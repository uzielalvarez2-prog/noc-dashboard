import { describe, it, expect } from "vitest";
import { unirIms, resumirEnvios, type GrupoEnvio } from "./cliente-top-ims";

const g = (ids: string[]): GrupoEnvio => ({
  chatId: "x@g.us",
  etiqueta: "C",
  prefijo: "C",
  items: ids.map((id) => ({ incidentId: id, ref: "", siteName: "", status: "" })),
});

describe("unirIms", () => {
  it("dedup y normaliza a mayúsculas a través de varios grupos", () => {
    expect(unirIms([g(["imlatb1", "imlatb1"]), g(["imlatb2"])])).toEqual(["IMLATB1", "IMLATB2"]);
  });

  it("recorta la unión a MAX_IMS (50)", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `IM${i}`);
    expect(unirIms([g(ids)])).toHaveLength(50);
  });
});

describe("resumirEnvios", () => {
  it("captura qué cliente falló (chatId, etiqueta y causa), no solo un conteo", () => {
    const r = resumirEnvios([
      { chatId: "a@g.us", etiqueta: "SMART FIT", ok: true },
      { chatId: "b@g.us", etiqueta: "SEP", ok: false, error: "grupo desconocido" },
    ]);
    expect(r).toEqual({
      ok: false,
      enviados: 1,
      fallidos: 1,
      fallos: [{ chatId: "b@g.us", etiqueta: "SEP", error: "grupo desconocido" }],
    });
  });

  it("ok=true solo cuando no hay fallos", () => {
    expect(resumirEnvios([{ chatId: "a@g.us", etiqueta: "A", ok: true }]).ok).toBe(true);
  });
});
