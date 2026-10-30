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
  // Analistas que HPSM reporta solo con nombre completo (sin login en el export
  // original). No son duplicados de otro login: son personas distintas. Login
  // provisional derivado del nombre hasta tener el login HPSM real.
  "moreno flores angel yair": "aymoreno",
  "tinajera padilla abigail guadalupe": "atinajer",
  "zambrano lara miguel": "mzambran",
  "flores diaz angel antolin": "aflores",
  "leon garcia jose arturo": "jaleon",
  "sanchez sanchez jesus humberto": "jhsanche",
  "cosgaya euan ixchel lucia": "icosgaya",
  "perez vega rogelio": "rperezv",
  "fuentes jimenez david": "dfuentes",
  "arias velazquez israel": "iarias",
  "serrano jimenez brandon alberto": "bserrano",
  "zapata castillo adrian de jesus": "azapata",
};

// Cuentas de bot (no operadores humanos). Comparadas contra el login ya
// resuelto por toOperatorLogin, en minúsculas. HPSM reporta el bot tanto como
// "smBotCARE" (login) como "SM BOT" (nombre), así que se cubren ambos.
const BOT_LOGINS = new Set(["smbotcare", "sm bot"]);

export function isBotOperator(value: string): boolean {
  if (!value) return false;
  return BOT_LOGINS.has(value.trim().toLowerCase());
}

// Quita acentos y colapsa espacios para poder comparar "Núñez" == "Nunez"
// sin depender de que el CSV traiga los acentos correctos (HPSM a veces los rompe).
// También elimina puntos/separadores basura que HPSM a veces inserta en el nombre
// (p.ej. "MORALES SOLANO .. LUIS ALFONSO"), para que el match no dependa de ellos.
function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:]+/g, " ") // puntos/comas sueltos → espacio
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
