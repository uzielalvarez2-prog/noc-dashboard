"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, Check, X, Upload, Search, FileSpreadsheet, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ParsedRow {
  company: string;
  serviceRef: string;
}

// Detecta y descarta una fila de encabezados (empresa/company/cliente...).
function isHeaderRow(a: string, b: string): boolean {
  const h = `${a} ${b}`.toLowerCase();
  return /empresa|company|cliente|servicio|service/.test(h);
}

// Lee .csv o .xlsx → [{company, serviceRef}]. Col A = empresa, Col B = servicio.
async function parseClientesFile(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: ParsedRow[] = [];
    lines.forEach((line, i) => {
      const parts = line.split(/\t|,|;/).map((p) => p.trim().replace(/^"|"$/g, ""));
      const company = parts[0] ?? "";
      const serviceRef = parts[1] ?? "";
      if (i === 0 && isHeaderRow(company, serviceRef)) return;
      if (company || serviceRef) rows.push({ company, serviceRef });
    });
    return rows;
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: ParsedRow[] = [];
    ws.eachRow((row, rowNumber) => {
      const company = String(row.getCell(1).value ?? "").trim();
      const serviceRef = String(row.getCell(2).value ?? "").trim();
      if (rowNumber === 1 && isHeaderRow(company, serviceRef)) return;
      if (company || serviceRef) rows.push({ company, serviceRef });
    });
    return rows;
  }

  throw new Error("Formato no soportado. Usa .xlsx o .csv");
}

interface Cliente {
  id: string;
  company: string;
  serviceRef: string;
  note: string | null;
  createdAt: string;
}

async function fetchClientes(): Promise<{ clientes: Cliente[] }> {
  const res = await fetch("/api/clientes-top");
  if (!res.ok) throw new Error("Error al cargar clientes");
  return res.json();
}

export function ClientesTopPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["clientes-top"], queryFn: fetchClientes });

  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newService, setNewService] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editService, setEditService] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sendBulk(rows: ParsedRow[]): Promise<number | null> {
    const res = await fetch("/api/clientes-top", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: rows }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Error al importar");
      return null;
    }
    return (await res.json()).inserted ?? rows.length;
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const rows = await parseClientesFile(file);
      if (rows.length === 0) {
        setError("El archivo no tiene filas válidas (Col A: empresa, Col B: servicio).");
        return;
      }
      const inserted = await sendBulk(rows);
      if (inserted !== null) {
        setOkMsg(`Se importaron ${inserted} clientes desde ${file.name}.`);
        invalidate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setBusy(false);
    }
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["clientes-top"] });
    qc.invalidateQueries({ queryKey: ["war-room"] });
  }

  async function handleAdd() {
    if (!newCompany.trim() && !newService.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: newCompany, serviceRef: newService }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al agregar");
        return;
      }
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
      const res = await fetch(`/api/clientes-top/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: editCompany, serviceRef: editService }),
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
      const res = await fetch(`/api/clientes-top/${id}`, { method: "DELETE" });
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
        return { company: parts[0] ?? "", serviceRef: parts[1] ?? "" };
      })
      .filter((r) => r.company || r.serviceRef);

    if (rows.length === 0) {
      setError("Pega al menos una línea válida");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes-top", {
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
    setEditCompany(c.company);
    setEditService(c.serviceRef);
  }

  const all = data?.clientes ?? [];
  const q = filter.trim().toLowerCase();
  const clientes = q
    ? all.filter(
        (c) =>
          c.company.toLowerCase().includes(q) || c.serviceRef.toLowerCase().includes(q)
      )
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
            Base de clientes críticos
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
              placeholder="Buscar..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Importar archivo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBulkOpen((v) => !v)}
            className="h-8 gap-1.5 border border-border text-xs text-text-muted hover:text-text-primary"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Pegar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdding(true)}
            className="h-8 gap-1.5 border border-border text-xs text-text-muted hover:text-text-primary"
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
      {okMsg && (
        <p className="rounded-md border border-success/40 bg-success-dim px-3 py-2 text-xs text-success">
          {okMsg}
        </p>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Procesando...
        </p>
      )}

      {/* Importar masivo */}
      {bulkOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/40 p-3">
          <p className="text-xs text-text-muted">
            Pega una línea por cliente: <code>Empresa[TAB o coma]Servicio</code>. El
            servicio es opcional.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"ACME S.A.\tSERV-001\nGlobex,SERV-002\nIniciodyne"}
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
                    <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewCompany(""); setNewService(""); }}
                      className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando clientes...
                </td>
              </tr>
            )}
            {!isLoading && clientes.length === 0 && !adding && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-text-muted">
                  {q ? "Sin coincidencias" : "No hay clientes — agrega o importa la lista"}
                </td>
              </tr>
            )}

            {clientes.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="border-b border-border bg-accent/5 last:border-0">
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
                  <td className="px-4 py-3 font-medium text-text-primary">{c.company || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{c.serviceRef || "—"}</td>
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
