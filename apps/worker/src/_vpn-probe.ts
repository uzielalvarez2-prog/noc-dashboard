// TEMPORAL: comprueba si el contenedor puede levantar una VPN (TUN + NET_ADMIN)
// y si alcanza el concentrador. Se ejecuta al arrancar y se borra despues.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import net from "node:net";
import { logger } from "./logger.js";

const exec = promisify(execFile);

function tcpProbe(host: string, port: number, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const t0 = Date.now();
    const done = (r: string) => {
      s.destroy();
      resolve(r);
    };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(`ABIERTO (${Date.now() - t0}ms)`));
    s.once("timeout", () => done("TIMEOUT"));
    s.once("error", (e: Error) => done(`ERROR: ${e.message}`));
    s.connect(port, host);
  });
}

export async function vpnProbe(): Promise<void> {
  const out: Record<string, string> = {};

  out.tun = existsSync("/dev/net/tun") ? "SI existe" : "NO existe";

  try {
    const { stdout } = await exec("sh", ["-c", "cat /proc/self/status | grep CapEff"]);
    out.capEff = stdout.trim();
  } catch (e) {
    out.capEff = `error: ${(e as Error).message}`;
  }

  try {
    const { stdout } = await exec("sh", ["-c", "id -u"]);
    out.uid = stdout.trim();
  } catch {
    out.uid = "?";
  }

  out.ssh129 = await tcpProbe("200.33.150.129", 22);
  out.ssh144 = await tcpProbe("200.33.150.144", 22);
  out.internet = await tcpProbe("1.1.1.1", 443);

  logger.info("[vpn-probe] RESULTADO", out);
}
