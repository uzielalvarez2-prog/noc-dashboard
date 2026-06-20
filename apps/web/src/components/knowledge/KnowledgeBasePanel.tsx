"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  HardDrive,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Doc {
  id: string;
  title: string;
  url: string;
  category: string;
  docType: string;
  note: string | null;
  createdAt: string;
}

const CATEGORIES = ["Manuales", "Políticas", "Procedimientos", "Plantillas", "General"];
const DOC_TYPES = ["LINK", "PDF", "DRIVE"];

function typeIcon(t: string) {
  if (t === "PDF") return <FileText className="h-4 w-4 text-critical" />;
  if (t === "DRIVE") return <HardDrive className="h-4 w-4 text-warning" />;
  return <LinkIcon className="h-4 w-4 text-accent" />;
}

async function fetchDocs(): Promise<{ docs: Doc[] }> {
  const res = await fetch("/api/knowledge");
  if (!res.ok) throw new Error("Error al cargar documentos");
  return res.json();
}

const empty = { title: "", url: "", category: "Manuales", docType: "LINK", note: "" };

export function KnowledgeBasePanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["knowledge"], queryFn: fetchDocs });

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === "ADMIN" || d.role === "SUPERVISOR"))
      .catch(() => {});
  }, []);

  const [filter, setFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setError(null);
    setFormOpen(true);
  }
  function openEdit(d: Doc) {
    setEditingId(d.id);
    setForm({ title: d.title, url: d.url, category: d.category, docType: d.docType, note: d.note ?? "" });
    setError(null);
    setFormOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.url.trim()) {
      setError("Título y URL son requeridos");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/knowledge/${editingId}` : "/api/knowledge", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al guardar");
        return;
      }
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } finally {
      setBusy(false);
    }
  }

  const docs = data?.docs ?? [];
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          (d.note ?? "").toLowerCase().includes(q)
      )
    : docs;

  // Agrupar por categoría.
  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of filtered) {
      const k = d.category || "General";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Documentos</h2>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
            {docs.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={openCreate}
              className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </Button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-text-muted">Cargando documentos...</p>}
      {!isLoading && docs.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-elevated/40 px-4 py-8 text-center text-sm text-text-muted">
          {isAdmin
            ? "No hay documentos. Usa Agregar para subir el primero."
            : "Aún no hay documentos cargados."}
        </p>
      )}

      {/* Grupos por categoría */}
      {grouped.map(([category, list]) => (
        <div key={category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {category} <span className="text-text-muted/60">({list.length})</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <div
                key={d.id}
                className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {typeIcon(d.docType)}
                    <span className="text-xs font-medium text-text-muted">{d.docType}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => openEdit(d)}
                        className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => remove(d.id)}
                        className="rounded p-1 text-text-muted hover:bg-critical-dim hover:text-critical"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm font-medium text-text-primary hover:text-accent"
                >
                  {d.title}
                  <ExternalLink className="h-3 w-3 shrink-0 text-text-muted" />
                </a>
                {d.note && <p className="text-xs text-text-muted">{d.note}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal alta/edición */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-base font-semibold text-text-primary">
                {editingId ? "Editar documento" : "Agregar documento"}
              </h3>
              <button onClick={() => setFormOpen(false)} className="text-text-muted hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {error && (
                <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
                  {error}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Título</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Manual de escalamiento PEXA"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Categoría</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={inputCls}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Tipo</label>
                  <select
                    value={form.docType}
                    onChange={(e) => setForm({ ...form, docType: e.target.value })}
                    className={inputCls}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Nota (opcional)</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Breve descripción"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-surface-elevated px-5 py-3">
              <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)} className="h-8 text-xs text-text-muted">
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={save}
                className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
              >
                {editingId ? "Guardar" : "Agregar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
