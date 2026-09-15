import { Client, type ClientChannel } from "ssh2";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Ping ejecutado en el jump host de la red interna (ssix-sshsrv3) en vez de
 * desde Railway. Los enlaces MPLS/VPN tienen IP pública pero sólo responden
 * desde dentro de la red corporativa, así que medirlos desde la nube los
 * reporta caídos siempre.
 *
 * Ese host corre un bash restringido (`zxinteractrbash`) con un PATH acotado a
 * ~15 binarios; no hay `cat`, `sh` ni forma de ejecutar un comando remoto en
 * modo no-interactivo: `ssh host "cmd"` conecta, ignora el comando y sale con
 * código 0. Por eso se abre un shell con PTY y los comandos se escriben por el
 * canal, leyendo la salida hasta el resumen del ping.
 */

export interface SshPingResult {
  up: boolean;
  latencyMs: number | null;
}

/** `null` = no se pudo medir (SSH caído): el llamador debe conservar el estado previo. */
export type SshPingOutcome = SshPingResult | null;

const LATENCY_RE = /time[=<]([\d.]+)\s*ms/i;
const LOSS_RE = /(\d+)%\s*packet loss/i;
// Sólo aparece en la salida real del ping: el PTY hace eco del comando enviado,
// y ese eco contiene cualquier marcador que se intente usar como centinela.
const SUMMARY_RE = /packet loss/i;

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;
const OSC_RE = /\x1b\][0-9];[^\x07]*\x07/g;
const PROMPT_RE = /\$\s*$/;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "").replace(OSC_RE, "");
}

type Session = { conn: Client; stream: ClientChannel };

let session: Session | null = null;
let connecting: Promise<Session> | null = null;
/** Serializa los pings: un solo PTY compartido no puede multiplexar comandos. */
let queue: Promise<unknown> = Promise.resolve();

function closeSession(reason: string): void {
  if (!session) return;
  logger.warn("[ssh-ping] Cerrando sesión SSH", { reason });
  try {
    session.stream.end();
  } catch {
    // El canal ya podía estar roto; el end() de la conexión es el que importa.
  }
  try {
    session.conn.end();
  } catch {
    // Idem: cerrar es best-effort, la sesión se descarta igual.
  }
  session = null;
}

function connect(): Promise<Session> {
  const { host, port, user, password, connectTimeoutMs } = config.sshPing;

  return new Promise<Session>((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        // No hay nada que rescatar si ni siquiera se estableció la conexión.
      }
      reject(err);
    };

    conn.on("error", fail);
    conn.on("ready", () => {
      conn.shell({ term: "vt100", cols: 200, rows: 50 }, (err, stream) => {
        if (err) return fail(err);

        let banner = "";
        const waitPrompt = (chunk: Buffer) => {
          banner += chunk.toString("utf8");
          if (!PROMPT_RE.test(stripAnsi(banner))) return;
          stream.removeListener("data", waitPrompt);
          if (settled) return;
          settled = true;
          resolve({ conn, stream });
        };

        stream.on("data", waitPrompt);
        stream.on("close", () => fail(new Error("Canal SSH cerrado durante el login")));
      });
    });

    conn.connect({
      host,
      port,
      username: user,
      password,
      readyTimeout: connectTimeoutMs,
      keepaliveInterval: 15_000,
      // El servidor sólo ofrece host keys SHA-1 (ssh-rsa, ssh-dss), deshabilitadas
      // por defecto en clientes modernos. Sin esto la negociación falla.
      algorithms: {
        serverHostKey: ["ssh-rsa", "ssh-dss"],
        kex: [
          "diffie-hellman-group14-sha1",
          "diffie-hellman-group-exchange-sha1",
          "diffie-hellman-group1-sha1",
          "diffie-hellman-group14-sha256",
        ],
      },
    });
  });
}

async function getSession(): Promise<Session> {
  if (session) return session;
  if (!connecting) {
    connecting = connect()
      .then((s) => {
        session = s;
        s.conn.on("close", () => {
          session = null;
        });
        logger.info("[ssh-ping] Sesión SSH establecida", { host: config.sshPing.host });
        return s;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

function runPing(stream: ClientChannel, ip: string, count: number, timeoutS: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";

    const cleanup = () => {
      stream.removeListener("data", onData);
      clearTimeout(timer);
    };

    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const clean = stripAnsi(buf);
      if (!SUMMARY_RE.test(clean)) return;
      cleanup();
      resolve(clean);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout esperando la salida del ping"));
    }, (timeoutS * count + 10) * 1000);

    stream.on("data", onData);
    stream.write(`ping -c ${count} -W ${timeoutS} ${ip}\n`);
  });
}

function parse(output: string): SshPingResult {
  const loss = LOSS_RE.exec(output);
  const lossPct = loss ? Number(loss[1]) : 100;
  const latency = LATENCY_RE.exec(output);

  return {
    up: lossPct < 100,
    latencyMs: latency ? Math.round(Number(latency[1])) : null,
  };
}

/**
 * Pinguea `ip` desde el jump host. Devuelve `null` si no se pudo medir
 * (SSH caído, credenciales vencidas, timeout): tratar eso como "caído"
 * dispararía falsos negativos y reiniciaría la racha de `upSince`.
 */
export function sshPing(ip: string): Promise<SshPingOutcome> {
  const run = async (): Promise<SshPingOutcome> => {
    const { pingCount, pingTimeoutS } = config.sshPing;
    try {
      const s = await getSession();
      const output = await runPing(s.stream, ip, pingCount, pingTimeoutS);
      return parse(output);
    } catch (err) {
      // La sesión pudo quedar a medias (buffer sucio, canal muerto): se descarta
      // para que el siguiente intento reconecte limpio.
      closeSession((err as Error).message);
      logger.error("[ssh-ping] No se pudo medir la IP", { ip, err });
      return null;
    }
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Valida la conexión al arrancar para que un fallo de credenciales se vea de inmediato. */
export async function verifySshPing(): Promise<boolean> {
  try {
    await getSession();
    return true;
  } catch (err) {
    logger.error("[ssh-ping] Verificación inicial falló", { err });
    return false;
  }
}
