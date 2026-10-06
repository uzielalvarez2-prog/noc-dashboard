"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupPicker, type WhatsappGroup } from "./GroupPicker";

export interface ReglaFormState {
  nombre: string;
  servicePrefixes: string;
  imPrefixes: string;
  companyContains: string;
  porTurno: boolean;
  mostrarSitio: boolean;
  notifyChatIds: string[];
}

export const EMPTY_REGLA: ReglaFormState = {
  nombre: "",
  servicePrefixes: "",
  imPrefixes: "",
  companyContains: "",
  porTurno: false,
  mostrarSitio: false,
  notifyChatIds: [],
};

interface Props {
  value: ReglaFormState;
  onChange: (v: ReglaFormState) => void;
  groups: WhatsappGroup[];
  frequent: string[];
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const inputCls =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

function Campo({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-primary">{label}</span>
      {children}
      <span className="block text-[11px] text-text-muted">{hint}</span>
    </label>
  );
}

/** Formulario de alta/edición de una regla de alerta de apertura. */
export function AperturaReglaForm({ value, onChange, groups, frequent, busy, onSave, onCancel }: Props) {
  const set = (patch: Partial<ReglaFormState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-accent/5 p-3">
      <Campo label="Nombre" hint="Solo para identificarla en esta lista (ej. SEMARNAT).">
        <input autoFocus value={value.nombre} onChange={(e) => set({ nombre: e.target.value })} className={inputCls} />
      </Campo>

      <div className="grid gap-3 md:grid-cols-3">
        <Campo label="Servicio (prefijo de la REF)" hint="Ej. C25 o C20,C25,C50. Vacío = no filtra.">
          <input
            value={value.servicePrefixes}
            onChange={(e) => set({ servicePrefixes: e.target.value })}
            placeholder="C25"
            className={`${inputCls} font-mono`}
          />
        </Campo>
        <Campo label="El IM empieza con" hint="Ej. IMSMAG (varios separados por coma). Vacío = no filtra.">
          <input
            value={value.imPrefixes}
            onChange={(e) => set({ imPrefixes: e.target.value })}
            placeholder="IMSMAG"
            className={`${inputCls} font-mono`}
          />
        </Campo>
        <Campo label="Empresa contiene" hint="Un fragmento del nombre; sin importar mayúsculas ni acentos.">
          <input
            value={value.companyContains}
            onChange={(e) => set({ companyContains: e.target.value })}
            placeholder="MEDIO AMBIENTE"
            className={inputCls}
          />
        </Campo>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium text-text-primary">Destino</span>
        <label className="flex items-center gap-2 text-xs text-text-primary">
          <input type="checkbox" checked={value.porTurno} onChange={(e) => set({ porTurno: e.target.checked })} />
          Según turno — PEXA Matutino (06:00–15:00) / PEXA Vespertino (15:00–23:15)
        </label>
        <GroupPicker
          value={value.notifyChatIds}
          onChange={(v) => set({ notifyChatIds: v })}
          groups={groups}
          frequent={frequent}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-text-primary">
        <input type="checkbox" checked={value.mostrarSitio} onChange={(e) => set({ mostrarSitio: e.target.checked })} />
        Mostrar <b>Sitio</b> en lugar de Empresa en el mensaje (para chats de cliente)
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 gap-1.5 text-xs text-text-muted">
          <X className="h-3.5 w-3.5" /> Cancelar
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={onSave}
          className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
        >
          <Check className="h-3.5 w-3.5" /> Guardar
        </Button>
      </div>
    </div>
  );
}
