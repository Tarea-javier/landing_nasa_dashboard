import { api, ESTADOS, numero, peorEstado, iniciales, h, $, horaEje } from "./datos.js";

const DIAS_EN_VUELO = 142;               // must match mock.js; replace with mission launch date from your API
const SLOT = ["a", "b"];
const COLOR = { a: "#ff93b6", b: "#5de4ff" };
const VITALES = [
  { id: "hr", nombre: "Heart rate", ids: ["hr"] },
  { id: "spo2", nombre: "Blood oxygen", ids: ["spo2"] },
  { id: "temp_corporal", nombre: "Body temp", ids: ["temp_corporal"] },
  { id: "presion", nombre: "Blood pressure", ids: ["presion_sis", "presion_dia"] },
  { id: "glucosa", nombre: "Glucose", ids: ["glucosa"] },
];
const CABINA = ["co2", "temp_cabina", "humedad", "radiacion"];
const HIST_METRICAS = [
  ["hr", "Heart rate"], ["spo2", "SpO₂"], ["temp_corporal", "Body temp"], ["presion_sis", "Systolic"],
  ["presion_dia", "Diastolic"], ["glucosa", "Glucose"], ["sueno_horas", "Sleep"], ["animo", "Mood"],
];
const HIST_RANGOS = [["24h", "24 h"], ["7d", "7 d"], ["30d", "30 d"], ["1y", "Pre-flight vs in-flight"]];

const S = { crew: [], ind: {}, vivo: {}, tab: "vivo", hMetrica: "hr", hRango: "7d", hDatos: null, ultimaSerie: 0 };

/* ---------------- charts (own canvas helpers, no dependency) ---------------- */
function lienzo(canvas) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hh = canvas.clientHeight;
  if (!w) return null;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh);
  return { c, w, h: hh };
}

function spark(canvas, datos, color) {
  const l = lienzo(canvas); if (!l || datos.length < 2) return;
  const { c, w, h: hh } = l;
  const ys = datos.map(p => p[1]), mn = Math.min(...ys), mx = Math.max(...ys), span = mx - mn || 1;
  const x = i => (i / (datos.length - 1)) * w, y = v => hh - 3 - ((v - mn) / span) * (hh - 8);
  const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00");
  c.beginPath(); datos.forEach((p, i) => (i ? c.lineTo(x(i), y(p[1])) : c.moveTo(x(i), y(p[1]))));
  c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
  c.lineTo(w, hh); c.lineTo(0, hh); c.fillStyle = g; c.fill();
}

function grafica(canvas, series, { band, launch, cursor }) {
  const l = lienzo(canvas); if (!l) return null;
  const { c, w, h: hh } = l, m = { l: 48, r: 14, t: 10, b: 26 };
  const todos = series.flatMap(s => s.datos);
  if (!todos.length) return null;
  const t0 = Math.min(...todos.map(p => p[0])), t1 = Math.max(...todos.map(p => p[0]));
  let mn = Math.min(...todos.map(p => p[1])), mx = Math.max(...todos.map(p => p[1]));
  if (band) { mn = Math.min(mn, band[0]); mx = Math.max(mx, band[1]); }
  const pad = (mx - mn || 1) * 0.1; mn -= pad; mx += pad;
  const X = t => m.l + ((t - t0) / (t1 - t0 || 1)) * (w - m.l - m.r), Y = v => m.t + (1 - (v - mn) / (mx - mn)) * (hh - m.t - m.b);
  c.font = "12px 'Chakra Petch', sans-serif"; c.fillStyle = "#98a0cf"; c.strokeStyle = "#3d4170"; c.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = mn + ((mx - mn) * k) / 4, yy = Y(v);
    c.beginPath(); c.moveTo(m.l, yy); c.lineTo(w - m.r, yy); c.globalAlpha = .5; c.stroke(); c.globalAlpha = 1;
    c.textAlign = "right"; c.fillText(numero(v, mx - mn < 8 ? 1 : 0), m.l - 8, yy + 4);
  }
  c.textAlign = "center";
  for (let k = 0; k <= 5; k++) { const t = t0 + ((t1 - t0) * k) / 5; c.fillText(horaEje(t, t1 - t0), X(t), hh - 7); }
  if (band) { c.fillStyle = "rgba(93,255,195,.07)"; c.fillRect(m.l, Y(band[1]), w - m.l - m.r, Y(band[0]) - Y(band[1])); }
  if (launch && launch > t0) {
    c.strokeStyle = "#ffc857"; c.setLineDash([5, 5]); c.beginPath(); c.moveTo(X(launch), m.t); c.lineTo(X(launch), hh - m.b); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#ffc857"; c.textAlign = "left"; c.fillText("LAUNCH", X(launch) + 6, m.t + 12);
  }
  for (const s of series) {
    c.beginPath(); s.datos.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))));
    c.strokeStyle = s.color; c.lineWidth = 1.8; c.shadowColor = s.color; c.shadowBlur = 6; c.stroke(); c.shadowBlur = 0;
  }
  if (cursor !== null && cursor !== undefined) { c.strokeStyle = "#eef0ff"; c.globalAlpha = .5; c.beginPath(); c.moveTo(cursor, m.t); c.lineTo(cursor, hh - m.b); c.stroke(); c.globalAlpha = 1; }
  return { t0, t1, X, m, w };
}

/* ---------------- header / tabs ---------------- */
function montarPestanas() {
  for (const t of ["vivo", "historial"]) {
    $(`#tab-${t}`).addEventListener("click", () => {
      S.tab = t;
      for (const u of ["vivo", "historial"]) {
        $(`#tab-${u}`).setAttribute("aria-selected", u === t);
        $(`#vista-${u}`).hidden = u !== t;
      }
      if (t === "historial") cargarHistorial(); else pintarVivo();
    });
  }
}

function conexion(ok, hora) {
  const el = $("#conexion");
  el.className = `conexion ${ok ? "ok" : "error"}`;
  $("span", el).textContent = ok ? `Link live · ${new Date(hora).toLocaleTimeString("en-US")}` : "Link lost";
}

/* ---------------- LIVE view: two astronauts side by side ---------------- */
function montarVivo() {
  $("#cabina").replaceChildren(...CABINA.map(id => {
    const i = S.ind[id];
    return h("div", { datos: { id } }, h("span", {}, i.nombre), h("p", {}, h("b", {}, "—"), h("small", {}, i.unidad)));
  }));
  $("#dupla").replaceChildren(...S.crew.slice(0, 2).map((t, k) => {
    const slot = SLOT[k];
    return h("article", { clase: "panel tripulante", datos: { slot, id: t.id } },
      h("div", { clase: "cab" },
        h("span", { clase: "avatar" }, iniciales(t.nombre)),
        h("div", {}, h("h3", {}, t.nombre), h("p", {}, t.rol)),
        h("span", { clase: "estado sin_datos" }, h("i"), h("em", {}, "No data"))),
      h("div", { clase: "vitales" },
        ...VITALES.map(v => h("div", { clase: "vital", datos: { v: v.id } },
          h("span", { clase: "nombre" }, v.nombre), h("span", { clase: "normal-txt" }),
          h("div", { clase: "valor" }, "—", h("small", {}, S.ind[v.ids[0]].unidad)), h("canvas"))),
        h("div", { clase: "vital diario" },
          h("span", { clase: "nombre" }, "Daily log"),
          h("div", { clase: "linea", datos: { d: "sueno_horas" } }, "Sleep", h("b", {}, "—")),
          h("div", { clase: "linea", datos: { d: "animo" } }, "Mood /5", h("b", {}, "—")))));
  }));
}

function pintarVivo() {
  if (S.tab !== "vivo") return;
  const ref = S.vivo[S.crew[0]?.id]?.lect;
  if (ref) for (const id of CABINA) {
    const l = ref[id], i = S.ind[id], caja = $(`.cabina [data-id="${id}"]`);
    if (!l) continue;
    caja.className = l.estado; $("b", caja).textContent = numero(l.valor, i.decimales);
  }
  for (const panel of document.querySelectorAll(".tripulante")) {
    const d = S.vivo[panel.dataset.id]; if (!d?.lect) continue;
    const color = COLOR[panel.dataset.slot];
    const personales = [...VITALES.flatMap(v => v.ids), "sueno_horas", "animo"].map(id => d.lect[id]?.estado).filter(Boolean);
    const g = peorEstado(personales), chip = $(".estado", panel);
    chip.className = `estado ${g}`; $("em", chip).textContent = ESTADOS[g].etiqueta;
    for (const v of VITALES) {
      const el = $(`[data-v="${v.id}"]`, panel), ls = v.ids.map(id => d.lect[id]);
      if (ls.some(x => !x)) continue;
      const peor = peorEstado(ls.map(x => x.estado));
      el.classList.toggle("precaucion", peor === "precaucion"); el.classList.toggle("alerta", peor === "alerta");
      $(".valor", el).firstChild.textContent = ls.map((x, k) => numero(x.valor, S.ind[v.ids[k]].decimales)).join("/");
      const i = S.ind[v.ids[0]];
      $(".normal-txt", el).textContent = v.ids.length > 1 ? `≤${S.ind.presion_sis.normal_max}/${S.ind.presion_dia.normal_max}` : `${i.normal_min}–${i.normal_max}`;
      spark($("canvas", el), d.ser?.[v.ids[0]] ?? [], color);
    }
    for (const id of ["sueno_horas", "animo"]) $(`[data-d="${id}"] b`, panel).textContent = numero(d.lect[id]?.valor, S.ind[id].decimales);
  }
}

async function ciclo() {
  try {
    const v = await api.version();
    for (const t of S.crew) {
      const f = await api.estado(t.id);
      (S.vivo[t.id] ??= {}).lect = Object.fromEntries(f.map(x => [x.indicador, x]));
    }
    if (Date.now() - S.ultimaSerie > 4000) {
      S.ultimaSerie = Date.now();
      const ids = VITALES.flatMap(x => x.ids);
      for (const t of S.crew) S.vivo[t.id].ser = (await api.series(ids, t.id, "tiempo_real")).series;
    }
    conexion(true, v.actualizado); pintarVivo();
  } catch (e) { conexion(false); }
}

/* ---------------- HISTORY tab ---------------- */
function montarControlesHistorial() {
  const pintar = () => {
    const seg = (el, ops, act, fn) => el.replaceChildren(...ops.map(([id, t]) => h("button", { type: "button", clase: id === act ? "activo" : null, onclick: () => fn(id) }, t)));
    seg($("#h-metricas"), HIST_METRICAS, S.hMetrica, id => { S.hMetrica = id; pintar(); cargarHistorial(); });
    seg($("#h-rangos"), HIST_RANGOS, S.hRango, id => { S.hRango = id; pintar(); cargarHistorial(); });
  };
  pintar();
  const cv = $("#h-canvas"), globo = $("#h-globo");
  cv.addEventListener("pointermove", e => {
    if (!S.hDatos) return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left;
    const { t0, t1, m, w } = S.hDatos.geo;
    const t = t0 + ((px - m.l) / (w - m.l - m.r)) * (t1 - t0);
    const filas = S.hDatos.series.map(s => {
      const p = s.datos.reduce((b, q) => (Math.abs(q[0] - t) < Math.abs(b[0] - t) ? q : b), s.datos[0]);
      return [s, p];
    });
    S.hDatos.geo = { ...S.hDatos.geo, ...grafica(cv, S.hDatos.series, { ...S.hDatos.opc, cursor: px }) };
    const d = new Date(filas[0][1][0]), dec = S.ind[S.hMetrica].decimales;
    globo.replaceChildren(
      h("div", { clase: "t" }, d.toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
      ...filas.map(([s, p]) => h("div", { style: `color:${s.color}` }, h("span", {}, s.nombre), h("b", {}, numero(p[1], dec)))));
    globo.hidden = false;
    globo.style.left = `${Math.min(Math.max(px, 90), r.width - 90)}px`; globo.style.top = `${e.clientY - r.top - 12}px`;
  });
  cv.addEventListener("pointerleave", () => {
    globo.hidden = true;
    if (S.hDatos) grafica(cv, S.hDatos.series, S.hDatos.opc);
  });
  window.addEventListener("resize", () => S.tab === "historial" && S.hDatos && grafica(cv, S.hDatos.series, S.hDatos.opc));
}

const promedio = a => (a.length ? a.reduce((s, p) => s + p[1], 0) / a.length : null);

async function cargarHistorial() {
  const id = S.hMetrica, ind = S.ind[id], dec = ind.decimales, crew = S.crew.slice(0, 2);
  const [rango, anual, mes] = await Promise.all([
    Promise.all(crew.map(t => api.series([id], t.id, S.hRango))),
    Promise.all(crew.map(t => api.series([id], t.id, "1y"))),
    Promise.all(crew.map(t => api.series([id], t.id, "30d"))),
  ]);
  const series = crew.map((t, k) => ({ nombre: t.nombre, color: COLOR[SLOT[k]], datos: rango[k].series[id] ?? [] }));
  const lanz = Date.now() - DIAS_EN_VUELO * 86400e3;
  const opc = { band: ind.normal_max > ind.normal_min ? [ind.normal_min, ind.normal_max] : null, launch: S.hRango === "1y" ? lanz : null, cursor: null };
  $("#h-leyenda").replaceChildren(h("b", {}, `${ind.nombre} · ${ind.unidad}`), ...series.map(s => h("span", { style: `--c:${s.color}` }, h("i"), s.nombre)),
    h("span", { style: "--c:#5dffc3" }, h("i"), `normal ${ind.normal_min}–${ind.normal_max}`));
  requestAnimationFrame(() => {
    const geo = grafica($("#h-canvas"), series, opc);
    S.hDatos = { series, opc, geo };
  });

  // pre-flight vs in-flight summary (from the 1-year series)
  $("#h-resumen").replaceChildren(...crew.map((t, k) => {
    const d = anual[k].series[id] ?? [], pre = promedio(d.filter(p => p[0] < lanz)), en = promedio(d.filter(p => p[0] >= lanz));
    const delta = pre !== null && en !== null ? en - pre : null;
    return h("article", { clase: "panel", datos: { slot: SLOT[k] } },
      h("div", { clase: "res-cab" }, h("i"), t.nombre),
      h("div", { clase: "res-datos" },
        h("div", {}, h("span", {}, "Pre-flight avg"), h("b", {}, numero(pre, dec))),
        h("div", {}, h("span", {}, "In-flight avg"), h("b", {}, numero(en, dec))),
        h("div", {}, h("span", {}, "Change"), h("b", { clase: delta > 0 ? "sube" : "baja" }, delta === null ? "—" : `${delta > 0 ? "+" : ""}${numero(delta, dec)}`))));
  }));

  // daily log, last 14 days, from the 30-day series
  const porDia = crew.map((t, k) => {
    const m = new Map();
    for (const [ms, v] of mes[k].series[id] ?? []) {
      const dia = new Date(ms).toDateString(); const g = m.get(dia) ?? { ms, v: [] }; g.v.push(v); m.set(dia, g);
    }
    return m;
  });
  const dias = [...porDia[0].keys()].slice(-14).reverse();
  const celda = g => (g ? [numero(promedio(g.v.map(x => [0, x])), dec), h("small", {}, `  ${numero(Math.min(...g.v), dec)}–${numero(Math.max(...g.v), dec)}`)] : "—");
  $("#h-tabla").replaceChildren(
    h("thead", {}, h("tr", {}, h("th", {}, "Date"), ...crew.map((t, k) => h("th", { clase: SLOT[k] }, `${t.nombre} avg (min–max)`)))),
    h("tbody", {}, ...dias.map(dia => h("tr", {},
      h("td", {}, new Date(porDia[0].get(dia).ms).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })),
      ...porDia.map(m => h("td", {}, celda(m.get(dia))))))));
}

/* ---------------- boot ---------------- */
async function iniciar() {
  const [inds, crew] = await Promise.all([api.indicadores(), api.tripulantes()]);
  S.ind = Object.fromEntries(inds.map(i => [i.id, i])); S.crew = crew;
  montarPestanas(); montarVivo(); montarControlesHistorial();
  await ciclo(); setInterval(ciclo, 1000);
  window.addEventListener("resize", pintarVivo);
}
iniciar();
