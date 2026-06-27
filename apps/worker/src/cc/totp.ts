import { createHmac } from "node:crypto";

/**
 * Generador TOTP (RFC 6238) sin dependencias externas.
 * Se usa para el login full-auto contra Keycloak: el worker genera el mismo
 * código de 6 dígitos que la app autenticadora a partir de la semilla base32.
 *
 * La semilla (CC_TOTP_SECRET) es el secreto MFA — debe vivir solo como secreto
 * cifrado del worker (Railway), nunca en git ni en .env versionado.
 */

// Decodifica una cadena base32 (RFC 4648, sin padding obligatorio) a Buffer.
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error(`Caracter base32 inválido: "${char}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/**
 * Genera el código TOTP actual.
 * @param secret  semilla en base32
 * @param opts    digits (def 6), period seg (def 30), algoritmo (def sha1)
 */
export function generateTotp(
  secret: string,
  opts: { digits?: number; period?: number; algorithm?: "sha1" | "sha256" | "sha512" } = {}
): string {
  const digits = opts.digits ?? 6;
  const period = opts.period ?? 30;
  const algorithm = opts.algorithm ?? "sha1";

  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  // big-endian de 64 bits (los 32 bits altos casi siempre 0 en estas fechas)
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac(algorithm, base32Decode(secret)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}
