// Mapeo de nombre completo (como viene en la columna "Closed By" del CSV de HPSM,
// formato "Apellido(s) Nombre(s)") al login HPSM del operador (p.ej. "vtlopez").
// Fuente: listado de usuarios exportado de HPSM.
const NAME_TO_LOGIN: Record<string, string> = {
  "licea alvarez pablo": "plicea",
  "guzman flores ivan": "iguzmanf",
  "orijel fernandez jesus daniel": "jorijel",
  "perez lobato jose": "jplobato",
  "jimenez ramirez jose angel": "jjramire",
  "torres viera gerardo": "gtviera",
  "nunez gonzalez angelica maria": "angien",
  "juarez garcia benito": "bjuarez",
  "manrique hernandez carolina": "carolm",
  "canizalez rodriguez david alejandro": "dcanizal",
  "ortega garcia jesus ivan": "jesusog",
  "terrazas salazar jose antonio": "jterraza",
  "rangel barraza manuel": "mrangelb",
  "chavarria colmenero maria de los angeles": "mccolmen",
  "daniel alberto morelos ramirez": "dmorelos",
  "morelos ramirez daniel alberto": "dmorelos",
  "lopez telles victor hugo": "vltelles",
  "resendiz silva jorge": "jrsilva",
  "perez garcia jose luis": "pgarciaj",
  "rojas perez reyes joaquin": "rrojas",
  "bustamante arias gerardo": "gbustam",
  "paniagua tapia gustavo": "gpaniagu",
  "salinas garcia miguel": "msalinas",
  "ramirez vaca cesar": "crvaca",
  "murillo amado audel": "murilloa",
  "gonzalez luis daniel": "dgluis",
  "velazquez sanchez dewi": "dvsanche",
  "tinajero sanchez yololxochitl": "ytinajer",
  "ruiz trejo leonel": "rtrejol",
  "navarrete garcia francisco javier": "fngarcia",
  "alvarez oviedo uziel": "ualvarez",
  "torres lopez victor hugo": "vtlopez",
  "nava rivera enrique": "enrivera",
  "rivera martinez nayeli": "nrmartin",
  "vazquez jimenez itzamarai": "ivjimene",
  "vieyra renteria katherine alexa": "kvieyra",
  "cervantes benitez vida rosario": "vcervant",
  "parra del valle thelma camila": "tparra",
  "gomez hernandez julio cesar": "jghernan",
  "velazquez rojas jordy manuel": "jvrojas",
  "santiago montero brandon ricardo": "bsantiag",
  "montero santiago ricardo brandon": "bsantiag",
  "medina hernandez rodrigo": "medinar",
  "hernandez medina rodrigo": "medinar",
  "ceron alonso isacc armando": "iceron",
  "alonso ceron amrando isaac": "iceron",
  "flores lopez melissa": "mflopez",
  "ibarra carmona harec garald": "hibarra",
  "farca villavicencio fedra": "ffarca",
  "morales solano luis alfonso": "lmsolano",
};

// Quita acentos y colapsa espacios para poder comparar "Núñez" == "Nunez"
// sin depender de que el CSV traiga los acentos correctos (HPSM a veces los rompe).
function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Traduce el nombre completo tal como viene de HPSM a su login.
// Si no hay match en el mapeo, devuelve el nombre original (mejor mostrar
// un nombre reconocible que un "(sin dato)" para operadores nuevos aún no mapeados).
export function toOperatorLogin(fullName: string): string {
  if (!fullName) return fullName;
  const login = NAME_TO_LOGIN[normalizeName(fullName)];
  return login ?? fullName;
}
