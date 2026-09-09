// Chats a los que NO se debe entregar, aunque sigan configurados como destino.
//
// Sirve para suspender temporalmente un grupo (p.ej. "PEXA Vespertino") sin
// borrar su configuración: APERTURA_CHAT_ID_VESPERTINO sigue puesta y reactivar
// es vaciar la env var. Misma lista que usa el worker (monitoring/suppressed.ts).
//
// Formato: WA_CHATS_SUSPENDIDOS="chatId1,chatId2" (vacía o ausente = nada suprimido).
const SUSPENDED = new Set(
  (process.env.WA_CHATS_SUSPENDIDOS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function isChatSuspendido(chatId: string): boolean {
  return SUSPENDED.has(chatId.trim());
}

export function hayChatsSuspendidos(): boolean {
  return SUSPENDED.size > 0;
}
