import "dotenv/config";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

async function main() {
  const tokenUrl = need("CC_TOKEN_URL");
  const clientId = need("CC_CLIENT_ID");
  const user = need("CC_USER");
  const password = need("CC_PASSWORD");
  const totp = process.env.CC_TOTP; // opcional, por si Keycloak pide OTP

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: clientId,
    username: user,
    password,
    scope: "openid",
  });
  if (totp) body.set("totp", totp);

  console.log(`POST ${tokenUrl}  (client_id=${clientId}, user=${user})`);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText}`);

  let json: any = null;
  try { json = JSON.parse(text); } catch { /* texto plano */ }

  if (json && json.access_token) {
    const at = json.access_token as string;
    const parts = at.split(".");
    let claims: any = {};
    try { claims = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8")); } catch {}
    console.log("\n✅ TOKEN OBTENIDO");
    console.log(`   expires_in:        ${json.expires_in}s`);
    console.log(`   refresh_expires_in:${json.refresh_expires_in}s`);
    console.log(`   token_type:        ${json.token_type}`);
    console.log(`   tiene refresh:     ${json.refresh_token ? "sí" : "no"}`);
    console.log(`   usuario (token):   ${claims.preferred_username ?? claims.name ?? "?"}`);
    console.log(`   roles:             ${JSON.stringify(claims.realm_access?.roles ?? [])}`);
    console.log(`   audience:          ${JSON.stringify(claims.aud ?? claims.azp)}`);

    // Guardar token para reusar en pruebas de API (archivo gitignored)
    const fs = await import("node:fs");
    fs.writeFileSync(".cc-token.json", JSON.stringify(json, null, 2));
    console.log("\n   token guardado en .cc-token.json");

    // Probar rutas candidatas de la API de incidentes
    const base = process.env.CC_API_BASE ?? "https://controlcenter.cnoc.telmexit.com:3000";
    const paths = [
      "/api/incidents",
      "/api/incidents?page=1",
      "/api/incident",
      "/api/incidentes",
      "/api/tickets",
      "/api/alarms",
      "/api/alarmas",
      "/api/events",
      "/api/dashboard",
      "/api/v1/incidents",
    ];
    console.log("\n--- Probando rutas de API con el token ---");
    for (const p of paths) {
      try {
        const r = await fetch(base + p, {
          headers: { Authorization: `Bearer ${at}`, Accept: "application/json" },
        });
        const ct = r.headers.get("content-type") ?? "";
        let preview = "";
        if (r.ok && ct.includes("json")) {
          const t = await r.text();
          preview = " :: " + t.slice(0, 200).replace(/\s+/g, " ");
        }
        console.log(`  ${r.status}  ${p}  (${ct})${preview}`);
      } catch (e: any) {
        console.log(`  ERR  ${p}  ${e.message}`);
      }
    }
  } else {
    console.log("\n❌ NO se obtuvo token. Respuesta:");
    console.log(JSON.stringify(json ?? text, null, 2));
    if (json?.error === "invalid_grant" && /credential|otp|totp/i.test(json?.error_description ?? "")) {
      console.log("\n👉 Parece que Keycloak exige el código del autenticador (TOTP).");
      console.log("   Agrega CC_TOTP=<código de 6 dígitos> al .env y vuelve a correr RÁPIDO (el código expira en ~30s).");
    }
  }
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
