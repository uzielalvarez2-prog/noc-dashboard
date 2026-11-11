"use client";

import { useEffect, useState } from "react";
import { Send, Loader2, X, Check, AlertTriangle } from "lucide-react";
import { GroupPicker, type WhatsappGroup } from "@/components/monitoring/GroupPicker";

// ─────────────────────────────────────────────────────────────────────────────
// Botón ADMIN de PRUEBA MANUAL del Estatus Cliente TOP → WhatsApp.
//
// Abre un panel donde se elige el grupo destino (ej. "Supervision PEXA") con el
// mismo GroupPicker que las reglas. Al enviar, dispara la corrida real: lee los
// IMs abiertos del cliente TOP, consulta su estatus en HPSM vía scraper y manda
// el mensaje. Puede tardar varios minutos (el scraper entra IM por IM).
//
// La corrida automática de 09:00/20:00 la dispara el cron del scraper; este
// botón es para validar el formato y el envío de forma controlada.
// ─────────────────────────────────────────────────────────────────────────────

interface RunResult {
  ok?: boolean;
  sinIms?: boolean;
  ims?: number;
  iniciado?: boolean;
  error?: string;
}

export function EnviarEstatusButton({
  clienteTopId,
  clienteNombre,
  defaultChatId,
}: {
  clienteTopId?: string;
  clienteNombre?: string;
  /** Grupo de aviso guardado del cliente; preselecciona el destino al abrir. */
  defaultChatId?: string | null;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [chatId, setChatId] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [enviarSiVacio, setEnviarSiVacio] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === "ADMIN"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/whatsapp/groups")
      .then((r) => r.json())
      .then((d: { groups?: WhatsappGroup[] }) => setGroups(d.groups ?? []))
      .catch(() => {});
  }, [open]);

  if (!isAdmin) return null;

  async function enviar() {
    const destino = chatId[0];
    if (!destino) return;
    setEnviando(true);
    setResult(null);
    try {
      const res = await fetch("/api/cliente-top/estatus-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: destino, enviarSiVacio, clienteTopId }),
      });
      setResult((await res.json()) as RunResult);
    } catch {
      setResult({ ok: false, error: "Error de conexión" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Preselecciona el grupo guardado del cliente (editable para una prueba).
          setChatId(defaultChatId ? [defaultChatId] : []);
          setOpen(true);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent/50 hover:text-accent"
        title="Enviar el estatus de los IMs del cliente TOP a un grupo de WhatsApp"
      >
        <Send className="h-3.5 w-3.5" />
        Enviar estatus
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20"
          onClick={() => !enviando && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">
                Enviar estatus{clienteNombre ? ` · ${clienteNombre}` : " Cliente TOP"} a WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => !enviando && setOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-xs text-text-muted">
              Elige el grupo destino. Al enviar, el scraper consulta HPSM IM por IM
              en segundo plano (unos minutos) y manda el mensaje al grupo al
              terminar. Puedes cerrar la ventana: la corrida sigue sola.
            </p>

            <GroupPicker value={chatId} onChange={(v) => setChatId(v.slice(-1))} groups={groups} />

            <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={enviarSiVacio}
                onChange={(e) => setEnviarSiVacio(e.target.checked)}
              />
              Enviar aunque no haya IMs abiertos (para la prueba)
            </label>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={enviando || chatId.length === 0}
                onClick={enviar}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {enviando ? "Arrancando…" : "Enviar ahora"}
              </button>
            </div>

            {result && (
              <div
                className={`mt-4 rounded-md border p-3 ${
                  result.ok ? "border-success/40 bg-success-dim" : "border-critical/40 bg-critical-dim"
                }`}
              >
                <div className="flex items-start gap-2">
                  {result.ok ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                  )}
                  <div className="text-xs">
                    {result.ok ? (
                      result.iniciado ? (
                        <p className="text-success">
                          Corrida iniciada · {result.ims ?? 0} IM(s). El scraper está
                          consultando HPSM (~{Math.max(1, Math.ceil((result.ims ?? 0) * 0.5))} min);
                          el mensaje llegará al grupo al terminar. Ya puedes cerrar esta ventana.
                        </p>
                      ) : result.sinIms ? (
                        <p className="text-success">No hay IMs abiertos del cliente. Mensaje "0 IMs" enviado.</p>
                      ) : (
                        <p className="text-success">Listo.</p>
                      )
                    ) : (
                      <p className="text-critical">{result.error ?? "Falló el disparo."}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
