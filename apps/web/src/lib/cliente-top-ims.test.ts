import { describe, it, expect } from "vitest";
import { unirIms, type GrupoEnvio } from "./cliente-top-ims";

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
