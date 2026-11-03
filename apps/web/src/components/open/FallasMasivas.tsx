"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Copy, Check, ChevronDown, ChevronRight, ShieldCheck, Search, X } from "lucide-react";
import type { OpenIncidentRow } from "@/types/open";
import { cn } from "@/lib/utils";
import { copyHTMLTable } from "@/lib/openExport";
import { formatHpsmExcel } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Detector de FALLAS MASIVAS por cercanía temporal.
//
// Idea: una masiva se ve cuando VARIOS incidentes de la MISMA zona se abren casi
// a la misma hora (ej. 14:30, 14:33, 14:35…). No basta con que una zona tenga
// muchos incidentes: importa que estén PEGADOS en el tiempo.
//
// Algoritmo: por zona, ordenar por hora de apertura y encadenar incidentes
// mientras el hueco con el anterior sea <= GAP_MIN minutos. Cada cadena (cluster)
// con >= MIN_BURST incidentes es una "ráfaga" = posible falla masiva, y se
// muestra como tarjeta con su rango horario, servicios y folios.
//
// OJO ZONA HORARIA: HPSM guarda openTime como "reloj de pared en UTC" (el número
// del CSV, etiquetado UTC). La hora de apertura se lee en UTC, igual que
// formatHpsm; usar hora local recorrería 6 h.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_GAP_MIN = 10; // hueco máx. entre aperturas consecutivas de una ráfaga
const MIN_BURST = 5; // mínimo de incidentes para marcar ráfaga

type DimField = "state" | "district";

async function fetchOpenRows(group: string): Promise<OpenIncidentRow[]> {
  const p = new URLSearchParams();
  p.set("group", group);
  p.set("limit", "2000");
  p.set("collapse", "false"); // nivel sitio; deduplicamos a incidente abajo
  const res = await fetch(`/api/incidents/open?${p.toString()}`);
  if (!res.ok) throw new Error("Error al obtener incidentes para el análisis");
  const json = await res.json();
  const data = (json.data ?? []) as OpenIncidentRow[];
  const seen = new Set<string>();
  return data.filter((r) => (seen.has(r.incidentId) ? false : seen.add(r.incidentId)));
}

// "Reloj de pared en UTC" del openTime → epoch en ms tratado como UTC, para
// comparar/restar sin el corrimiento de 6 h.
function wallClockMs(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

// Hora de pared (UTC) "dd/mm HH:MM".
function wallLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

interface Burst {
  zone: string;
  rows: OpenIncidentRow[]; // ordenadas por apertura
  firstMs: number;
  lastMs: number;
  serviceCount: number;
}

// Copia un conjunto de incidentes al portapapeles como tabla (HTML para correo
// + texto plano para Excel/WhatsApp). Reutilizado por las ráfagas y por el
// explorador por zona. Devuelve true si el portapapeles aceptó el contenido.
async function copyIncidentTable(rows: OpenIncidentRow[], title: string): Promise<boolean> {
  const th = (s: string) => `<th style="background:#1e293b;color:#94a3b8;padding:6px 10px;text-align:left">${s}</th>`;
  const td = (s: string) => `<td style="padding:5px 10px;border-bottom:1px solid #334155;white-space:nowrap">${s}</td>`;
  const head = [th("IM"), th("Empresa"), th("Servicio"), th("Sitio"), th("Apertura"), th("Estatus")].join("");
  const body = rows
    .map((r) =>
      `<tr>${[td(r.incidentId), td(r.company), td(r.serviceId), td(r.siteName || "—"), td(formatHpsmExcel(r.openTime)), td(r.status)].join("")}</tr>`
    )
    .join("");
  const html = `<table style="border-collapse:collapse;font-family:Arial;font-size:12px;color:#e2e8f0"><caption style="font-weight:bold;text-align:left;padding-bottom:8px;color:#f8fafc">${title}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const plain = rows
    .map((r) => `${r.incidentId}\t${r.company}\t${r.serviceId}\t${r.siteName || ""}\t${formatHpsmExcel(r.openTime)}\t${r.status}`)
    .join("\n");
  return copyHTMLTable(html, plain);
}

export function FallasMasivas({ group }: { group: "PEXA" | "CECOR" }) {
  const [dim, setDim] = useState<DimField>("state");
  const [gapMin, setGapMin] = useState<number>(DEFAULT_GAP_MIN);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [zoneQuery, setZoneQuery] = useState("");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [zoneCopied, setZoneCopied] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false); // dropdown de sugerencias abierto
  const zoneBoxRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al hacer clic fuera del buscador.
  useEffect(() => {
    if (!zoneOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (zoneBoxRef.current && !zoneBoxRef.current.contains(e.target as Node)) {
        setZoneOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [zoneOpen]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["zone-bursts", group],
    queryFn: () => fetchOpenRows(group),
    refetchInterval: 240_000,
  });

  const bursts = useMemo(() => {
    const data = rows ?? [];
    // Agrupar por zona.
    const byZone = new Map<string, OpenIncidentRow[]>();
    for (const r of data) {
      const zone = ((dim === "state" ? r.state : r.district) || "—").trim() || "—";
      const list = byZone.get(zone) ?? [];
      list.push(r);
      byZone.set(zone, list);
    }

    const gapMs = gapMin * 60_000;
    const out: Burst[] = [];
    for (const [zone, list] of byZone) {
      // Ordenar por hora de apertura (reloj de pared UTC).
      const sorted = [...list].sort((a, b) => wallClockMs(a.openTime) - wallClockMs(b.openTime));
      let chain: OpenIncidentRow[] = [];
      let prevMs = 0;
      const flush = () => {
        if (chain.length >= MIN_BURST) {
          const services = new Set(chain.map((r) => r.serviceId));
          out.push({
            zone,
            rows: chain,
            firstMs: wallClockMs(chain[0].openTime),
            lastMs: wallClockMs(chain[chain.length - 1].openTime),
            serviceCount: services.size,
          });
        }
        chain = [];
      };
      for (const r of sorted) {
        const t = wallClockMs(r.openTime);
        if (chain.length === 0 || t - prevMs <= gapMs) {
          chain.push(r);
        } else {
          flush();
          chain.push(r);
        }
        prevMs = t;
      }
      flush();
    }
    // Más recientes (última apertura) primero; desempate por tamaño.
    return out.sort((a, b) => b.lastMs - a.lastMs || b.rows.length - a.rows.length);
  }, [rows, dim, gapMin]);

  // Helper: zona de una fila según la dimensión activa (Estado / Distrito).
  const zoneOf = (r: OpenIncidentRow) =>
    ((dim === "state" ? r.state : r.district) || "—").trim() || "—";

  // Índice de TODAS las zonas con su volumen (no solo ráfagas): para el
  // explorador por zona. Incidentes únicos, servicios y sitios distintos.
  const zoneIndex = useMemo(() => {
    const data = rows ?? [];
    const by = new Map<string, { incidents: Set<string>; services: Set<string>; sites: Set<string> }>();
    for (const r of data) {
      const z = zoneOf(r);
      let e = by.get(z);
      if (!e) by.set(z, (e = { incidents: new Set(), services: new Set(), sites: new Set() }));
      e.incidents.add(r.incidentId);
      if (r.serviceId) e.services.add(r.serviceId);
      if (r.siteName) e.sites.add(r.siteName);
    }
    return [...by.entries()]
      .map(([zone, e]) => ({ zone, incidents: e.incidents.size, services: e.services.size, sites: e.sites.size }))
      .sort((a, b) => b.incidents - a.incidents || a.zone.localeCompare(b.zone, "es"));
  }, [rows, dim]);

  // Sugerencias que coinciden con lo tecleado (acento-insensible), máx. 8.
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const zoneMatches = useMemo(() => {
    const q = norm(zoneQuery);
    if (!q) return zoneIndex.slice(0, 8);
    return zoneIndex.filter((z) => norm(z.zone).includes(q)).slice(0, 8);
  }, [zoneIndex, zoneQuery]);

  // Incidentes de la zona seleccionada, ordenados por apertura (reloj UTC).
  const zoneRows = useMemo(() => {
    if (!selectedZone) return [];
    const data = rows ?? [];
    return data
      .filter((r) => zoneOf(r) === selectedZone)
      .sort((a, b) => wallClockMs(a.openTime) - wallClockMs(b.openTime));
  }, [rows, dim, selectedZone]);

  const zoneSummary = useMemo(() => {
    if (zoneRows.length === 0) return null;
    const services = new Set(zoneRows.map((r) => r.serviceId).filter(Boolean));
    const sites = new Set(zoneRows.map((r) => r.siteName).filter(Boolean));
    return {
      incidents: zoneRows.length,
      services: services.size,
      sites: sites.size,
      first: zoneRows[0].openTime,
      last: zoneRows[zoneRows.length - 1].openTime,
    };
  }, [zoneRows]);

  function pickZone(zone: string) {
    setSelectedZone(zone);
    setZoneQuery(zone);
    setZoneCopied(false);
    setZoneOpen(false); // al elegir, se cierra el dropdown
  }
  function clearZone() {
    setSelectedZone(null);
    setZoneQuery("");
    setZoneCopied(false);
    setZoneOpen(false);
  }
  async function copyZone() {
    if (!selectedZone || !zoneSummary) return;
    const dimLabel = dim === "state" ? "Estado" : "Distrito";
    const title = `Incidentes abiertos — ${dimLabel}: ${selectedZone} · ${zoneSummary.incidents} incidentes, ${zoneSummary.services} servicios, ${zoneSummary.sites} sitios`;
    if (await copyIncidentTable(zoneRows, title)) {
      setZoneCopied(true);
      setTimeout(() => setZoneCopied(false), 2000);
    }
  }

  async function copyBurst(b: Burst, key: string) {
    const dur = Math.round((b.lastMs - b.firstMs) / 60_000);
    const title = `Posible falla masiva — ${b.zone}: ${b.rows.length} incidentes (${b.serviceCount} servicios) entre ${hhmm(b.rows[0].openTime)} y ${hhmm(b.rows[b.rows.length - 1].openTime)} · ${dur} min`;
    if (await copyIncidentTable(b.rows, title)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    }
  }

  const dimBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Posibles fallas masivas</h3>
          <p className="text-[11px] text-text-muted/70">
            Zonas donde {MIN_BURST}+ incidentes se abrieron casi a la misma hora (≤{gapMin} min entre cada uno).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => { setDim("state"); clearZone(); }} className={dimBtn(dim === "state")}>
            Estado
          </button>
          <button type="button" onClick={() => { setDim("district"); clearZone(); }} className={dimBtn(dim === "district")}>
            Distrito
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <span className="text-[11px] text-text-muted">Ventana:</span>
          {[5, 10, 15].map((g) => (
            <button key={g} type="button" onClick={() => setGapMin(g)} className={dimBtn(gapMin === g)}>
              {g} min
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Analizando aperturas…
        </div>
      ) : bursts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
          <ShieldCheck className="h-4 w-4 text-success" />
          Sin ráfagas: ninguna zona tiene {MIN_BURST}+ incidentes abiertos tan seguidos.
        </div>
      ) : (
        <div className="space-y-2">
          {bursts.map((b) => {
            const key = `${b.zone}-${b.firstMs}`;
            const expanded = openCard === key;
            const durMin = Math.round((b.lastMs - b.firstMs) / 60_000);
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-red-500/40 bg-red-500/[0.06]">
                <button
                  type="button"
                  onClick={() => setOpenCard(expanded ? null : key)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-red-500/[0.1]"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                  )}
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text-primary" title={b.zone}>
                      {b.zone}
                    </span>
                    <span className="block text-[11px] text-text-muted">
                      {hhmm(b.rows[0].openTime)} → {hhmm(b.rows[b.rows.length - 1].openTime)}
                      {" · "}
                      {durMin === 0 ? "en el mismo minuto" : `${durMin} min`}
                      {" · "}
                      {wallLabel(b.rows[0].openTime).split(" ")[0]}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-right">
                    <span className="flex flex-col items-end">
                      <span className="font-mono text-lg font-bold leading-none text-red-400">{b.rows.length}</span>
                      <span className="text-[10px] text-text-muted">incidentes</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="font-mono text-sm font-semibold leading-none text-text-primary">{b.serviceCount}</span>
                      <span className="text-[10px] text-text-muted">servicios</span>
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-red-500/30 bg-surface/40 px-3 py-2">
                    <div className="mb-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => copyBurst(b, key)}
                        className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
                      >
                        {copiedKey === key ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedKey === key ? "Copiado" : "Copiar correo"}
                      </button>
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 bg-surface-elevated/80 backdrop-blur-md">
                          <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                            <th className="px-2 py-1 font-medium">Hora</th>
                            <th className="px-2 py-1 font-medium">IM</th>
                            <th className="px-2 py-1 font-medium">Empresa</th>
                            <th className="px-2 py-1 font-medium">Servicio</th>
                            <th className="px-2 py-1 font-medium">Sitio</th>
                            <th className="px-2 py-1 font-medium">Estatus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.map((r) => (
                            <tr key={r.incidentId} className="border-b border-border/30">
                              <td className="px-2 py-1 font-mono text-text-primary">{hhmm(r.openTime)}</td>
                              <td className="px-2 py-1 font-mono text-accent">{r.incidentId}</td>
                              <td className="px-2 py-1 text-text-primary">
                                <span className="block max-w-[12rem] truncate" title={r.company}>{r.company || "—"}</span>
                              </td>
                              <td className="px-2 py-1 font-mono text-text-muted">{r.serviceId || "—"}</td>
                              <td className="px-2 py-1 text-text-muted">
                                <span className="block max-w-[10rem] truncate" title={r.siteName}>{r.siteName || "—"}</span>
                              </td>
                              <td className="px-2 py-1 text-text-muted">{r.status || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          Explorador por zona: busca una Estado/Distrito y ve TODO su volumen
          de incidentes abiertos (no solo las ráfagas). Trabaja sobre los mismos
          datos ya cargados — sin llamadas nuevas al backend.
          ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-border/60 pt-4">
        <div className="mb-2 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-text-muted" />
          <h4 className="text-sm font-semibold text-text-primary">Explorador por zona</h4>
          <span className="text-[11px] text-text-muted/70">
            Busca un {dim === "state" ? "estado" : "distrito"} para ver su volumen completo.
          </span>
        </div>

        <div ref={zoneBoxRef} className="relative max-w-md">
          <input
            type="text"
            value={zoneQuery}
            onFocus={() => setZoneOpen(true)}
            onChange={(e) => {
              setZoneQuery(e.target.value);
              if (selectedZone) setSelectedZone(null);
              setZoneOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setZoneOpen(false);
            }}
            placeholder={dim === "state" ? "Ej. CDMX, Jalisco, Nuevo León…" : "Ej. Distrito…"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-8 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          />
          {zoneQuery && (
            <button
              type="button"
              onClick={clearZone}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              title="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Sugerencias: solo cuando el buscador tiene foco (dropdown abierto),
              no hay zona fijada y hay coincidencias. Se cierra al elegir, al
              hacer clic fuera o con Escape. */}
          {zoneOpen && !selectedZone && zoneMatches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
              {zoneMatches.map((z) => (
                <li key={z.zone}>
                  <button
                    type="button"
                    onClick={() => pickZone(z.zone)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-surface"
                  >
                    <span className="truncate">{z.zone}</span>
                    <span className="shrink-0 font-mono text-text-muted">
                      {z.incidents} inc · {z.services} serv
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Resumen + tabla de la zona seleccionada. */}
        {selectedZone && zoneSummary && (
          <div className="mt-3 overflow-hidden rounded-lg border border-accent/40 bg-accent/[0.05]">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-primary" title={selectedZone}>
                  {selectedZone}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {zoneSummary.incidents} incidentes · {zoneSummary.services} servicios · {zoneSummary.sites} sitios
                  {" · "}
                  {hhmm(zoneSummary.first)} → {hhmm(zoneSummary.last)}
                </span>
              </div>
              <button
                type="button"
                onClick={copyZone}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
              >
                {zoneCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {zoneCopied ? "Copiado" : "Copiar correo"}
              </button>
            </div>
            <div className="max-h-80 overflow-auto border-t border-accent/20 bg-surface/40">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-surface-elevated/80 backdrop-blur-md">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="px-2 py-1 font-medium">Hora</th>
                    <th className="px-2 py-1 font-medium">IM</th>
                    <th className="px-2 py-1 font-medium">Empresa</th>
                    <th className="px-2 py-1 font-medium">Servicio</th>
                    <th className="px-2 py-1 font-medium">Sitio</th>
                    <th className="px-2 py-1 font-medium">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneRows.map((r) => (
                    <tr key={r.incidentId} className="border-b border-border/30">
                      <td className="px-2 py-1 font-mono text-text-primary">{hhmm(r.openTime)}</td>
                      <td className="px-2 py-1 font-mono text-accent">{r.incidentId}</td>
                      <td className="px-2 py-1 text-text-primary">
                        <span className="block max-w-[12rem] truncate" title={r.company}>{r.company || "—"}</span>
                      </td>
                      <td className="px-2 py-1 font-mono text-text-muted">{r.serviceId || "—"}</td>
                      <td className="px-2 py-1 text-text-muted">
                        <span className="block max-w-[10rem] truncate" title={r.siteName}>{r.siteName || "—"}</span>
                      </td>
                      <td className="px-2 py-1 text-text-muted">{r.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Zona tecleada pero sin coincidencias. */}
        {zoneQuery && !selectedZone && zoneMatches.length === 0 && (
          <p className="mt-2 text-xs text-text-muted">Ninguna zona coincide con “{zoneQuery}”.</p>
        )}
      </div>
    </div>
  );
}
