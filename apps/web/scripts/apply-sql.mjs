// Aplica un archivo .sql a Neon usando DATABASE_URL de .env.local.
// Uso: node scripts/apply-sql.mjs prisma/sql/2026-06-war-room.sql
// Nunca imprime el valor de DATABASE_URL.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

// .env.local tiene prioridad; si no existe, cae a .env (no sobreescribe lo ya cargado).
config({ path: resolve(webRoot, ".env.local") });
config({ path: resolve(webRoot, ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL no está definida en .env.local");
  process.exit(1);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("ERROR: pasa la ruta del .sql como argumento");
  process.exit(1);
}

const sql = readFileSync(resolve(webRoot, sqlPath), "utf8");

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  console.log(`Conectado a Neon. Ejecutando ${sqlPath} ...`);
  await client.query(sql);
  console.log("OK — SQL aplicado sin errores.");

  // Verificación: listar las tablas nuevas y su conteo de columnas.
  const { rows } = await client.query(`
    SELECT table_name, COUNT(*) AS cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('ClienteTop', 'WarRoomIncident', 'KnowledgeDoc')
    GROUP BY table_name
    ORDER BY table_name;
  `);
  console.log("Tablas creadas:");
  for (const r of rows) console.log(`  - ${r.table_name} (${r.cols} columnas)`);
} catch (err) {
  console.error("ERROR aplicando SQL:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
