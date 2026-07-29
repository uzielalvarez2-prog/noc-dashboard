import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface PingResult {
  up: boolean;
  method: "icmp" | "tcp";
  latencyMs: number | null;
}

// Regex tolerante: matchea "time=8ms", "time<1ms", "tiempo=8ms" (locales distintos).
const LATENCY_RE = /(?:time|tiempo)[=<]([\d.]+)\s*ms/i;

async function pingIcmp(ip: string, timeoutMs: number): Promise<PingResult | null> {
  const isWindows = process.platform === "win32";
  const args = isWindows
    ? ["-n", "1", "-w", String(timeoutMs), ip]
    : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip];

  try {
    const { stdout } = await execFileAsync("ping", args, { timeout: timeoutMs + 1000 });
    const match = LATENCY_RE.exec(stdout);
    return { up: true, method: "icmp", latencyMs: match ? Math.round(Number(match[1])) : null };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null; // binario ping no disponible: usar fallback TCP
    return { up: false, method: "icmp", latencyMs: null }; // exit code != 0: no responde
  }
}

function pingTcp(ip: string, port: number, timeoutMs: number): Promise<PingResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (up: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ up, method: "tcp", latencyMs: up ? Date.now() - start : null });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

/** Chequea si una IP responde: ICMP real con fallback a TCP connect. Nunca lanza. */
export async function checkIp(ip: string): Promise<PingResult> {
  const icmpResult = await pingIcmp(ip, config.monitoring.pingTimeoutMs);
  if (icmpResult?.up) return icmpResult;

  return pingTcp(ip, config.monitoring.tcpFallbackPort, config.monitoring.pingTimeoutMs);
}
