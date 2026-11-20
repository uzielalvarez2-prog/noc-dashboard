// Página local de cierre de incidentes servida por el PROPIO scraper.
//
// Por qué vive aquí y no en el dashboard (Next.js/Vercel): con el sync HPSM
// apagado por Seguridad y sin acceso por la web, el cierre se dispara a mano
// desde esta PC. Esta página es un solo proceso (el scraper) que:
//   - ya tiene Chromium instalado y la sesión HPSM serializada (un solo login),
//   - ya expone los endpoints JSON /cerrar-incidentes y /cerrar-incidentes/progreso.
//
// La página es HTML+JS plano (sin build, sin React): la sirve server.ts en
// GET /cerrar inyectando la INTERNAL_API_KEY y los templates. Solo se sirve a
// conexiones locales (localhost), así que la key nunca sale de la máquina.
//
// Replica la pantalla "Cerrar incidentes" del dashboard: textarea de IMs,
// selector de template, modo Verificar/Aplicar/Cerrar, y panel de resultados
// que se va poblando IM por IM leyendo el progreso cada 3 s.

// Mismo catálogo que apps/web/src/lib/templatesCierre.ts (match por texto EXACTO
// contra el wizard de HPSM). Si HPSM gana/pierde templates, actualizar AMBAS.
export const TEMPLATES_CIERRE: string[] = [
  "*A TX SINC",
  "*A CUSTOMER STABLE",
  "*B ONT APAGADA",
  "* A Falso positivo",
  "* C Check",
  "** A SIN ACCESO.",
  "*AA ejecutivo",
  "*AA | Falla de energía",
  "*AA || FALLA DE ENERGÍA",
  "*AA_CORTE DE F.O. POR VANDALISMO.",
  "*C FALLA DE ENERGÍA",
  "LINK DOWN",
  "PROBLEMA COMERCIAL",
  "FALLA EN MEDIO",
  "PRINC ACTIVO",
  "RESP INACTIVO",
  "SE REALIZÓ LA RECONSTRUCCIÓN TOTAL DEL CIRCUITO",
];

/** Escapa texto para incrustarlo seguro dentro de un literal JS entre comillas. */
function jsString(s: string): string {
  return JSON.stringify(s);
}

/**
 * HTML completo de la página de cierre. `internalKey` se inyecta para que el JS
 * de la página pueda llamar a los endpoints protegidos del propio scraper.
 */
export function renderCerrarPage(internalKey: string): string {
  const templatesJs = `[${TEMPLATES_CIERRE.map(jsString).join(",")}]`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cerrar incidentes — HPSM local</title>
<style>
  :root {
    --bg: #060d1a; --surface: #0d1526; --surface2: #152032; --border: #1e3048;
    --text: #e2e8f0; --muted: #64748b; --accent: #3b82f6;
    --critical: #ef4444; --critical-dim: #1f1315; --warning: #f59e0b;
    --success: #22c55e; --info: #38bdf8; --violet: #8b5cf6;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 14px;
  }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; line-height: 1.5; max-width: 820px; }
  .sub b { color: var(--text); }
  .grid { display: grid; gap: 20px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
  .muted { color: var(--muted); }
  textarea, select {
    width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; padding: 10px;
    font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px;
  }
  textarea { min-height: 200px; resize: vertical; }
  .row { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-top: 12px; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
  button {
    border: 0; border-radius: 6px; padding: 9px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer; color: #fff; background: var(--accent); transition: filter .15s, background .15s;
    display: inline-flex; align-items: center; gap: 6px;
  }
  button:hover { filter: brightness(1.1); }
  button:disabled { opacity: .5; cursor: not-allowed; filter: none; }
  button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  button.ghost:hover { color: var(--text); }
  button.danger { background: var(--critical); }
  button.warn { background: var(--warning); color: #1a1205; }
  .pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-family: "JetBrains Mono", monospace; }
  .banner { border-radius: 6px; padding: 10px 12px; font-size: 13px; margin-top: 12px; line-height: 1.45; }
  .banner.err { background: var(--critical-dim); border: 1px solid rgba(239,68,68,.4); color: #fca5a5; }
  .banner.warn { background: #1c1609; border: 1px solid rgba(245,158,11,.4); color: #fcd34d; }
  .banner.info { background: rgba(56,189,248,.08); border: 1px solid rgba(56,189,248,.3); color: #7dd3fc; }
  .banner.ok { background: #0b1a0f; border: 1px solid rgba(34,197,94,.4); color: #86efac; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 8px 10px; border-top: 1px solid var(--border); vertical-align: top; }
  tr:first-child td { border-top: 0; }
  .im { font-family: "JetBrains Mono", monospace; white-space: nowrap; }
  .res { font-weight: 700; }
  .res.cerrado { color: var(--success); }
  .res.verificado, .res.aplicado { color: var(--info); }
  .res.ya-cerrado { color: var(--muted); }
  .res.template-no-existe, .res.no-encontrado { color: var(--warning); }
  .res.error { color: var(--critical); }
  .msg { color: var(--muted); margin-top: 2px; }
  .results-box { max-height: 60vh; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; margin-top: 12px; }
  .placeholder { border: 1px solid var(--border); background: var(--bg); border-radius: 6px; padding: 14px; color: var(--muted); font-size: 13px; margin-top: 12px; line-height: 1.5; }
  .spin { animation: spin 1s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--muted); }
  .legend span b { color: var(--text); font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Cerrar incidentes · HPSM local</h1>
  <p class="sub">
    Pega una lista de incidentes, elige el template y el modo. El scraper abre <b>una sola sesión</b>
    de HPSM en esta PC y los procesa en fila (~30 s por IM). Empieza en modo <b>Verificar</b> (no toca
    nada) para confirmar que todo está en orden; cambia a <b>Cerrar de verdad</b> solo cuando estés seguro.
    Si hay una descarga del scraper corriendo, el cierre espera su turno.
  </p>

  <div class="grid">
    <!-- ── Entrada ───────────────────────────────────────────────── -->
    <div class="card">
      <label for="ims">Incidentes a cerrar</label>
      <textarea id="ims" placeholder="IMCNIE002997&#10;IMAADX006635&#10;…" spellcheck="false"></textarea>

      <div class="row">
        <div>
          <label for="template" class="muted">Template a aplicar</label>
          <select id="template"></select>
        </div>
        <div>
          <label for="modo" class="muted">Modo</label>
          <select id="modo">
            <option value="verificar">Verificar (sin tocar nada)</option>
            <option value="aplicar">Aplicar template (sin cerrar)</option>
            <option value="cerrar">Cerrar de verdad</option>
          </select>
        </div>
      </div>

      <div class="foot">
        <span id="count" class="muted">0 IMs detectados</span>
        <button id="go"><span id="go-icon">▶</span> <span id="go-label">Verificar</span></button>
      </div>

      <div id="confirm" class="banner warn" style="display:none"></div>
      <div id="error" class="banner err" style="display:none"></div>
      <div id="status" class="banner info" style="display:none"></div>
    </div>

    <!-- ── Resultados ────────────────────────────────────────────── -->
    <div class="card">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
        <span style="font-weight:600" id="res-title">Resultados</span>
        <div style="display:flex; gap:8px">
          <button id="clear" class="ghost" disabled>Limpiar</button>
          <button id="copy" class="ghost" disabled>Copiar</button>
        </div>
      </div>
      <div id="results"></div>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";
  var KEY = ${jsString(internalKey)};
  var TEMPLATES = ${templatesJs};
  var IM_RE = /\\bIM[A-Z0-9]{4,20}\\b/g;

  var $ = function (id) { return document.getElementById(id); };
  var imsEl = $("ims"), tplEl = $("template"), modoEl = $("modo");
  var goEl = $("go"), goLabel = $("go-label"), goIcon = $("go-icon");
  var countEl = $("count"), confirmEl = $("confirm"), errorEl = $("error"), statusEl = $("status");
  var resultsEl = $("results"), resTitle = $("res-title"), clearEl = $("clear"), copyEl = $("copy");

  var MAX = 50;
  var confirmando = false;   // segunda confirmación para "cerrar"
  var polling = null;        // timer de progreso
  var limpio = false;        // ocultar resultados viejos tras "Limpiar"
  var ultimosResultados = [];

  // Poblar selector de templates.
  TEMPLATES.forEach(function (t) {
    var o = document.createElement("option");
    o.value = t; o.textContent = t; tplEl.appendChild(o);
  });

  var MODO_LABEL = { verificar: "Verificar", aplicar: "Aplicar template", cerrar: "Cerrar en HPSM" };

  function extraerIms(txt) {
    var m = (txt || "").toUpperCase().match(IM_RE) || [];
    var seen = {}, out = [];
    m.forEach(function (im) { if (!seen[im]) { seen[im] = 1; out.push(im); } });
    return out;
  }

  function imsActuales() { return extraerIms(imsEl.value); }

  function refrescarContador() {
    var ims = imsActuales();
    var extra = ims.length > MAX ? " (máximo " + MAX + ")" : "";
    countEl.textContent = ims.length + " IMs detectados" + extra;
    countEl.className = ims.length > MAX ? "" : "muted";
    countEl.style.color = ims.length > MAX ? "var(--critical)" : "";
    actualizarBoton();
  }

  function actualizarBoton() {
    var modo = modoEl.value;
    goLabel.textContent = confirmando
      ? "Confirmar cierre de " + imsActuales().length + " IM(s)"
      : MODO_LABEL[modo];
    goIcon.textContent = modo === "cerrar" ? (confirmando ? "⚠" : "🔒") : "▶";
    goEl.className = modo === "cerrar" ? (confirmando ? "danger" : "") : "";
  }

  function fetchJson(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Content-Type": "application/json", "x-internal-key": KEY }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  }

  function mostrar(el, texto) { el.textContent = texto; el.style.display = texto ? "block" : "none"; }

  function renderResultados(resultados, progreso) {
    ultimosResultados = resultados || [];
    var cerrados = ultimosResultados.filter(function (r) { return r.resultado === "cerrado"; }).length;
    resTitle.textContent = "Resultados" + (cerrados > 0 ? " — " + cerrados + " cerrado(s)" : "");
    clearEl.disabled = ultimosResultados.length === 0;
    copyEl.disabled = ultimosResultados.length === 0;

    if (ultimosResultados.length === 0) {
      resultsEl.innerHTML = '<div class="placeholder">Aquí aparece el resultado de cada IM conforme se procesa. ' +
        'En modo &quot;Verificar&quot; nada se modifica; solo comprueba que el incidente existe y que el template está disponible.</div>';
      return;
    }
    var rows = ultimosResultados.map(function (r) {
      var cls = (r.resultado || "error");
      var lbl = LABEL[r.resultado] || "Error";
      return '<tr><td class="im">' + esc(r.im) + '</td><td>' +
        '<span class="res ' + cls + '">' + esc(lbl) + '</span>' +
        '<div class="msg">' + esc(r.mensaje || "") + '</div></td></tr>';
    }).join("");
    resultsEl.innerHTML = '<div class="results-box"><table><tbody>' + rows + '</tbody></table></div>';
  }

  var LABEL = {
    cerrado: "Cerrado", verificado: "Listo para cerrar", aplicado: "Template aplicado",
    "ya-cerrado": "Ya estaba cerrado", "no-encontrado": "No encontrado",
    "template-no-existe": "Template no existe", error: "Error"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var EN_CURSO = { en_cola: 1, cerrando: 1 };

  function pintarProgreso(progreso, resultados) {
    if (!progreso || progreso.estado === "inactivo" || limpio) { mostrar(statusEl, ""); return; }
    var n = (resultados || []).length;
    if (progreso.estado === "en_cola") {
      mostrar(statusEl, "En cola: esperando a que el scraper termine su corrida de HPSM…");
    } else if (progreso.estado === "cerrando") {
      mostrar(statusEl, "Procesando… " + n + " de " + progreso.total);
    } else if (progreso.estado === "terminado" || progreso.estado === "error") {
      mostrar(statusEl, progreso.mensaje || "");
    }
  }

  function leerProgreso() {
    return fetchJson("/cerrar-incidentes/progreso", { method: "GET" }).then(function (r) {
      if (!r.ok) return;
      var progreso = r.body.progreso, resultados = r.body.resultados || [];
      if (!limpio) renderResultados(resultados, progreso);
      pintarProgreso(progreso, resultados);
      var activo = progreso && EN_CURSO[progreso.estado];
      setBusy(!!activo);
      if (!activo && polling) { clearInterval(polling); polling = null; }
    });
  }

  function setBusy(busy) {
    goEl.disabled = busy || imsActuales().length === 0 || imsActuales().length > MAX || !tplEl.value;
    if (busy) { goLabel.textContent = "Procesando…"; goIcon.innerHTML = '<span class="spin">↻</span>'; }
    else { actualizarBoton(); }
  }

  function lanzar() {
    mostrar(errorEl, ""); mostrar(confirmEl, ""); limpio = false; confirmando = false;
    var ims = imsActuales();
    var modo = modoEl.value, template = tplEl.value;
    var items = ims.map(function (im) { return { im: im, template: template }; });
    setBusy(true);
    fetchJson("/cerrar-incidentes", { method: "POST", body: JSON.stringify({ items: items, modo: modo }) })
      .then(function (r) {
        if (!r.ok) { mostrar(errorEl, r.body.error || "No se pudo iniciar la corrida"); setBusy(false); return; }
        // Arranca el sondeo de progreso.
        if (polling) clearInterval(polling);
        polling = setInterval(leerProgreso, 3000);
        leerProgreso();
      })
      .catch(function () { mostrar(errorEl, "Error de conexión con el scraper"); setBusy(false); });
  }

  goEl.addEventListener("click", function () {
    var ims = imsActuales();
    if (ims.length === 0) { mostrar(errorEl, "No hay IMs válidos en la lista"); return; }
    if (ims.length > MAX) { mostrar(errorEl, "Máximo " + MAX + " IMs por corrida"); return; }
    if (modoEl.value === "cerrar" && !confirmando) {
      confirmando = true;
      mostrar(confirmEl, "Esto cierra " + ims.length + " incidente(s) de verdad en HPSM con el template \\"" +
        tplEl.value + "\\". Es irreversible. Vuelve a apretar para confirmar.");
      actualizarBoton();
      return;
    }
    lanzar();
  });

  [imsEl].forEach(function (el) { el.addEventListener("input", function () { confirmando = false; mostrar(confirmEl, ""); refrescarContador(); }); });
  modoEl.addEventListener("change", function () { confirmando = false; mostrar(confirmEl, ""); actualizarBoton(); });
  tplEl.addEventListener("change", function () { confirmando = false; mostrar(confirmEl, ""); });

  clearEl.addEventListener("click", function () {
    imsEl.value = ""; limpio = true; mostrar(errorEl, ""); mostrar(confirmEl, ""); mostrar(statusEl, "");
    renderResultados([], null); refrescarContador();
  });
  copyEl.addEventListener("click", function () {
    var txt = ultimosResultados.map(function (r) {
      return r.im + "\\t" + (LABEL[r.resultado] || "Error") + "\\t" + (r.mensaje || "");
    }).join("\\n");
    navigator.clipboard.writeText(txt).then(function () {
      copyEl.textContent = "Copiado"; setTimeout(function () { copyEl.textContent = "Copiar"; }, 1500);
    }).catch(function () {});
  });

  // Estado inicial: si hay una corrida en curso (p. ej. recargaste), retomarla.
  renderResultados([], null);
  refrescarContador();
  leerProgreso().then(function () {
    if (polling === null) {
      // Si al cargar ya hay algo en curso, leerProgreso lo detecta y arranca el
      // timer; si no, un primer sondeo diferido por si estaba "en_cola".
    }
  });
})();
</script>
</body>
</html>`;
}
