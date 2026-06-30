"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, Check, X, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Cliente {
  id: string;
  siglasIm: string;
  company: string;
  serviceRef: string;
  note: string | null;
  createdAt: string;
}

async function fetchClientes(apiBase: string): Promise<{ clientes: Cliente[] }> {
  const res = await fetch(apiBase);
  if (!res.ok) throw new Error("Error al cargar clientes");
  return res.json();
}

export function ClientesTopPanel({
  apiBase = "/api/clientes-top",
  queryKey = "clientes-top",
  invalidateKeys = ["war-room"],
  heading = "Base de clientes críticos",
}: {
  /** Ruta base de la API (CRUD + bulk). */
  apiBase?: string;
  /** Clave de TanStack Query para esta base (debe ser única por base). */
  queryKey?: string;
  /** Queries adicionales a invalidar tras un cambio (la vista que consume esta base). */
  invalidateKeys?: string[];
  heading?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchClientes(apiBase),
  });

  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newSiglas, setNewSiglas] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newService, setNewService] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSiglas, setEditSiglas] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editService, setEditService] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: [queryKey] });
    for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: [k] });
  }

  async function handleAdd() {
    const siglas = newSiglas.trim();
    const company = newCompany.trim();
    const service = newService.trim();
    if (!siglas && !company && !service) return;

    // Pre-chequeo en cliente para aviso inmediato (el server vuelve a validar).
    const all = data?.clientes ?? [];
    const dup = all.find((c) =>
      siglas
        ? c.siglasIm.trim().toLowerCase() === siglas.toLowerCase()
        : c.company.trim().toLowerCase() === company.toLowerCase() &&
          c.serviceRef.trim().toLowerCase() === service.toLowerCase()
    );
    if (dup) {
      setError(`⚠️ Cliente ya existe: ${dup.siglasIm || dup.company || dup.serviceRef}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siglasIm: siglas, company, serviceRef: service }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError((j.duplicate ? "⚠️ " : "") + (j.error ?? "Error al agregar"));
        return;
      }
      setNewSiglas("");
      setNewCompany("");
      setNewService("");
      setAdding(false);
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siglasIm: editSiglas, company: editCompany, serviceRef: editService }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al guardar");
        return;
      }
      setEditingId(null);
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al eliminar");
        return;
      }
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  // Importar pegando lineas "empresa<TAB o ,>servicio".
  async function handleBulkImport() {
    const rows = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|,|;/).map((p) => p.trim());
        return { siglasIm: parts[0] ?? "", company: parts[1] ?? "", serviceRef: parts[2] ?? "" };
      })
      .filter((r) => r.siglasIm || r.company || r.serviceRef);

    if (rows.length === 0) {
      setError("Pega al menos una línea válida");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: rows }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al importar");
        return;
      }
      setBulkText("");
      setBulkOpen(false);
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: Cliente) {
    setEditingId(c.id);
    setEditSiglas(c.siglasIm);
    setEditCompany(c.company);
    setEditService(c.serviceRef);
  }

  const all = data?.clientes ?? [];
  const q = filter.trim().toLowerCase();
  // Búsqueda: prioriza Siglas IM (coincidencias de siglas primero), luego empresa/servicio.
  const clientes = q
    ? all
        .filter(
          (c) =>
            c.siglasIm.toLowerCase().includes(q) ||
            c.company.toLowerCase().includes(q) ||
            c.serviceRef.toLowerCase().includes(q)
        )
        .sort((a, b) => {
          const aS = a.siglasIm.toLowerCase().includes(q) ? 0 : 1;
          const bS = b.siglasIm.toLowerCase().includes(q) ? 0 : 1;
          return aS - bS;
        })
    : all;

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">
            {heading}
          </h2>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
            {all.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar (Siglas IM)..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBulkOpen((v) => !v)}
            className="h-8 gap-1.5 border border-border text-xs text-text-muted hover:text-text-primary"
          >
            <Upload className="h-3.5 w-3.5" /> Importar
          </Button>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {/* Importar masivo */}
      {bulkOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/40 p-3">
          <p className="text-xs text-text-muted">
            Pega una línea por cliente: <code>Siglas IM[TAB o coma]Empresa[TAB o coma]Servicio</code>.
            Empresa y servicio son opcionales.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"IM-ACME\tACME S.A.\tSERV-001\nIM-GLBX,Globex,SERV-002\nIM-INI,Iniciodyne"}
            className="w-full rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBulkOpen(false)}
              className="h-8 text-xs text-text-muted"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={handleBulkImport}
              className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
            >
              <Upload className="h-3.5 w-3.5" /> Importar lista
            </Button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Siglas IM</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Empresa</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Servicio</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {/* Fila de alta */}
            {adding && (
              <tr className="border-b border-border bg-accent/5">
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    value={newSiglas}
                    onChange={(e) => setNewSiglas(e.target.value)}
                    placeholder="Siglas IM"
                    className={inputCls}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Nombre de la empresa"
                    className={inputCls}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newService}
                    onChange={(e) => setNewService(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="Referencia de servicio (opcional)"
                    className={inputCls}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={handleAdd}
                      className="h-7 w-7 p-0 text-success hover:bg-success/10">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewSiglas(""); setNewCompany(""); setNewService(""); }}
                      className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando clientes...
                </td>
              </tr>
            )}
            {!isLoading && clientes.length === 0 && !adding && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                  {q ? "Sin coincidencias" : "No hay clientes — agrega o importa la lista"}
                </td>
              </tr>
            )}

            {clientes.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="border-b border-border bg-accent/5 last:border-0">
                  <td className="px-4 py-2">
                    <input value={editSiglas} onChange={(e) => setEditSiglas(e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editService} onChange={(e) => setEditService(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(c.id)} className={inputCls} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleSaveEdit(c.id)}
                        className="h-7 w-7 p-0 text-success hover:bg-success/10">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-accent">{c.siglasIm || "—"}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{c.company || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-muted">{c.serviceRef || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(c)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleDelete(c.id)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-critical-dim hover:text-critical">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
