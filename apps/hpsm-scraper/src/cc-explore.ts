import "dotenv/config";
import * as fs from "node:fs";

/**
 * Exploración de endpoints de la API de Control Center (CNOC).
 * - Reusa .cc-token.json si el access_token sigue vigente.
 * - Si expiró (o se pasa --login), re-login con password grant + CC_TOTP.
 * - Manda los headers reales: Authorization + source:cc + apikey.
 *
 * Uso:
 *   npx tsx src/cc-explore.ts                 # explora con torre por defecto
 *   npx tsx src/cc-explore.ts --net CARE      # otra torre
 *   npx tsx src/cc-explore.ts --login         # fuerza re-login (necesita CC_TOTP fresco)
 *   npx tsx src/cc-explore.ts --get /api/incidents/statuses
 */

const TOKEN_FILE = ".cc-token.json";
const BASE = process.env.CC_API_BASE ?? "https://controlcenter.cnoc.telmexit.com:3000";
const APIKEY = process.env.CC_APIKEY ?? "authorizedApplicationApikey";
const SOURCE = process.env.CC_SOURCE ?? "cc";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

function jwtExp(token: string): number | null {
  try {
    const c = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf-8"));
    return typeof c.exp === "number" ? c.exp : null;
  } catch {
    return null;
  }
}

async function login(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: need("CC_CLIENT_ID"),
    username: need("CC_USER"),
    password: need("CC_PASSWORD"),
    scope: "openid",
  });
  const totp = process.env.CC_TOTP;
  if (totp) body.set("totp", totp);

  console.log(`POST ${need("CC_TOKEN_URL")} (login, totp=${totp ? "sí" : "no"})`);
  const res = await fetch(need("CC_TOKEN_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => null);
  if (!json?.access_token) {
    console.error(`❌ Login HTTP ${res.status}:`, JSON.stringify(json));
    if (/totp|otp|credential/i.test(json?.error_description ?? "")) {
      console.error("👉 Agrega CC_TOTP=<6 dígitos frescos> al .env y vuelve a correr rápido (~30s).");
    }
    process.exit(1);
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(json, null, 2));
  console.log("✅ Token nuevo guardado.");
  return json.access_token;
}

async function getToken(): Promise<string> {
  if (has("--login")) return login();
  if (fs.existsSync(TOKEN_FILE)) {
    const t = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    const exp = jwtExp(t.access_token);
    const now = Math.floor(Date.now() / 1000);
    if (exp && exp > now + 30) {
      console.log(`Token cacheado vigente (${Math.round((exp - now) / 60)} min restantes).`);
      return t.access_token;
    }
    console.log("Token cacheado expirado → re-login.");
  }
  return login();
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    source: SOURCE,
    apikey: APIKEY,
  };
}

async function probe(token: string, path: string) {
  try {
    const r = await fetch(BASE + path, { headers: headers(token) });
    const ct = r.headers.get("content-type") ?? "";
    let preview = "";
    if (ct.includes("json")) {
      const text = await r.text();
      preview = " :: " + text.slice(0, 300).replace(/\s+/g, " ");
    }
    console.log(`  ${r.status}  ${path}${preview}`);
  } catch (e: any) {
    console.log(`  ERR  ${path}  ${e.message}`);
  }
}

async function main() {
  const token = await getToken();
  const net = arg("--net") ?? "CNOC";

  const single = arg("--get");
  if (single) {
    console.log(`\n--- GET ${single} (net=${net}, source=${SOURCE}) ---`);
    await probe(token, single);
    return;
  }

  const n = `network_code=${net}`;
  const paths = [
    // ya documentados
    `/api/incidents?${n}`,
    `/api/incidents/x-total-count?${n}`,
    `/api/incidents/statuses`,
    `/api/incidents/groups/open?${n}`,
    `/api/incidents/details?${n}`,
    `/api/changes?${n}`,
    // por mapear
    `/api/incidents/priorities`,
    `/api/incidents/categories`,
    `/api/incidents/locations`,
    `/api/incidents/count?${n}`,
    `/api/incidents/summary?${n}`,
    `/api/networks`,
    `/api/network-codes`,
    `/api/groups?${n}`,
    `/api/operators`,
    `/api/users/me`,
    `/api/reports/incidents`,
    `/api/reports/incidents/summary?${n}`,
    `/api/changes/statuses`,
    `/api/changes/x-total-count?${n}`,
  ];

  console.log(`\n--- Explorando API (base=${BASE}, net=${net}) ---`);
  for (const p of paths) await probe(token, p);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
