"use client";

import { useMemo, useState } from "react";
import { Search, X, Check } from "lucide-react";

export interface WhatsappGroup {
  id: string;
  chatId: string;
  name: string;
}

interface GroupPickerProps {
  /** chatIds seleccionados. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Catálogo completo de grupos descubiertos por el listener. */
  groups: WhatsappGroup[];
  /**
   * chatIds ordenados por uso (el más usado primero). Se muestran como accesos
   * directos cuando no hay búsqueda: son ~90 grupos y unos pocos concentran casi
   * todas las altas, así que lo normal es no tener que escribir nada.
   */
  frequent?: string[];
}

/** Normaliza para buscar sin acentos ni mayúsculas: "supervisión" encuentra "SUPERVISION". */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const MAX_VISIBLE = 9; // la lista no debe empujar el resto del formulario fuera de pantalla
const MAX_FREQUENT = 4;

export function GroupPicker({ value, onChange, groups, frequent = [] }: GroupPickerProps) {
  const [query, setQuery] = useState("");

  const byChatId = useMemo(() => new Map(groups.map((g) => [g.chatId, g])), [groups]);

  function toggle(chatId: string) {
    onChange(value.includes(chatId) ? value.filter((c) => c !== chatId) : [...value, chatId]);
  }

  const q = norm(query.trim());

  // Con búsqueda: todo el catálogo filtrado. Sin búsqueda: los frecuentes primero
  // (y, si no alcanzan, se completa alfabéticamente) para que la lista nunca esté
  // vacía ni obligue a escribir.
  const suggestions = useMemo(() => {
    if (q) {
      return groups
        .filter((g) => norm(g.name || g.chatId).includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    const top = frequent
      .map((chatId) => byChatId.get(chatId))
      .filter((g): g is WhatsappGroup => g != null)
      .slice(0, MAX_FREQUENT);
    const topIds = new Set(top.map((g) => g.chatId));
    const rest = groups
      .filter((g) => !topIds.has(g.chatId))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [...top, ...rest];
  }, [q, groups, frequent, byChatId]);

  const visible = suggestions.slice(0, MAX_VISIBLE);
  const hidden = suggestions.length - visible.length;

  // Índice donde terminan los frecuentes y empieza el resto del catálogo. Sin este
  // corte visual los dos bloques se leen como una sola lista y grupos cualesquiera
  // (los primeros alfabéticamente) aparentan ser "más usados".
  const frequentShown = q
    ? 0
    : visible.findIndex((g) => !frequent.slice(0, MAX_FREQUENT).includes(g.chatId));

  if (groups.length === 0) {
    return <span className="text-sm text-text-muted">Sin grupos detectados</span>;
  }

  return (
    <div className="space-y-2">
      {/* Lo seleccionado va ARRIBA y separado del catálogo: antes se perdía entre
          los ~90 chips y no había forma de ver de un vistazo a quién se le avisa. */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((chatId) => {
            const g = byChatId.get(chatId);
            return (
              <button
                key={chatId}
                type="button"
                onClick={() => toggle(chatId)}
                title="Quitar"
                className="group flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-sm text-accent transition-colors hover:border-critical/40 hover:bg-critical-dim hover:text-critical"
              >
                {g?.name || chatId}
                <X className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={value.length > 0 ? "Agregar otro grupo…" : "Buscar grupo…"}
          className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {!q && frequent.length > 0 && (
          <p className="border-b border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-muted">
            Más usados
          </p>
        )}
        {visible.length === 0 && (
          <p className="px-3 py-3 text-sm text-text-muted">Sin coincidencias para “{query}”</p>
        )}
        {visible.map((g, i) => {
          const active = value.includes(g.chatId);
          return (
            <div key={g.chatId}>
              {i === frequentShown && frequentShown > 0 && (
                <p className="border-y border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-muted">
                  Todos los grupos
                </p>
              )}
              <button
                type="button"
                onClick={() => toggle(g.chatId)}
                className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-text-primary hover:bg-surface-elevated"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    active ? "border-accent bg-accent text-white" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{g.name || g.chatId}</span>
              </button>
            </div>
          );
        })}
        {hidden > 0 && (
          <p className="border-t border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-muted">
            +{hidden} más — escribe para filtrar
          </p>
        )}
      </div>
    </div>
  );
}
