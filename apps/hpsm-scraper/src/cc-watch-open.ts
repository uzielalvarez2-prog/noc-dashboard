import "dotenv/config";
import * as fs from "node:fs";

/**
 * Sondea los grupos de CARE hasta encontrar el PRIMER incidente abierto y
 * guarda su JSON completo en .cc-open-sample.json para validar el shape.
 *
 * Uso:  npx tsx src/cc-watch-open.ts            # net CARE, cada 30s
 *       npx tsx src/cc-watch-open.ts --net CNOC --every 15
 */
const BASE = process.env.CC_API_BASE ?? "https://controlcenter.cnoc.telmexit.com:3000";
const H = {
  Accept: "application/json",
  source: process.env.CC_SOURCE ?? "cc",
  apikey: process.env.CC_APIKEY ?? "authorizedApplicationApikey",
};
const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const net = arg("--net") ?? "CARE";
const every = Number(arg("--every") ?? 30) * 1000;

function token(): string {
  const t = JSON.parse(fs.readFileSync(".cc-token.json", "utf-8"));
  const c = JSON.parse(Buffer.from(t.access_token.split(".")[1], "base64").toString("utf-8"));
  if (c.exp * 1000 < Date.now()) throw new Error("Token expirado. Corre cc-explore.ts --login con CC_TOTP fresco.");
  return t.access_token;
}
const g = (p: string, tk: string) =>
  fetch(BASE + p, { headers: { ...H, Authorization: `Bearer ${tk}` } }).then(async (r) => {
    try { return JSON.parse(await r.text()); } catch { return null; }
  });

async function tick(): Promise<boolean> {
  const tk = token();
  const groups = (await g(`/api/incidents/groups?network_code=${net}`, tk))?.data ?? [];
  for (const grp of groups) {
    const r = await g(`/api/incidents/groups/open?network_code=${net}&group=${encodeURIComponent(grp)}`, tk);
    const n = r?.data?.length ?? 0;
    if (n) {
      const sample = r.data[0];
      fs.writeFileSync(".cc-open-sample.json", JSON.stringify(r.data, null, 2));
      console.log(`\n✅ ABIERTO encontrado en ${net}/${grp} (${n} en el grupo). Shape guardado en .cc-open-sample.json:`);
      console.log(JSON.stringify(sample, null, 2));
      return true;
    }
  }
  console.log(`${new Date().toLocaleTimeString()}  ${net}: 0 abiertos en ${groups.length} grupos`);
  return false;
}

(async () => {
  console.log(`Vigilando abiertos en ${net} cada ${every / 1000}s (Ctrl+C para salir)...`);
  while (!(await tick())) await new Promise((r) => setTimeout(r, every));
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
