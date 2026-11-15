import { h } from "./datos.js";

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONO = {
  microfono: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  bocina: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  silencio: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  enviar: svg('<path d="M4 12l16-8-6 16-2-7-8-1z"/>'),
  historial: svg('<path d="M4 5h16v11H9l-5 4V5z"/>'),
};
const icono = n => { const s = h("span", { clase: "ico" }); s.innerHTML = ICONO[n]; return s; };
const TEXTOS = { listo: "Ready · press the mic or type a question", grabando: "Listening… press again to send", pensando: "Thinking…", hablando: "Speaking…", error: "Something went wrong" };
const SILENCIO = "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // silent clip: unlocks audio playback after a user gesture

export function montarAdam({ raiz, tripulantes, alMicrofono, alEnviar, alObjetivo }) {
  const e = { objetivo: "todos", sonido: false, hablando: false, turnos: [], audio: new Audio() };
  const nombreDe = id => tripulantes.find(t => t.id === id)?.nombre ?? "Both crew";

  const txt = h("span"), ondas = h("span", { clase: "ondas", "aria-hidden": "true" }, ...[0, 1, 2, 3, 4].map(k => h("i", { style: `--k:${k}` })));
  const estadoEl = h("p", { clase: "adam-estado", "aria-live": "polite" }, ondas, txt);
  const preguntaEl = h("p", { clase: "adam-pregunta" }), respuestaEl = h("p", { clase: "adam-respuesta" });
  const turnosEl = h("div", { clase: "adam-turnos" }), logEl = h("div", { clase: "adam-log", hidden: true }, turnosEl);
  const contador = h("b", {}, "0");

  const chips = [["todos", "Both"], ...tripulantes.map(t => [t.id, t.nombre])].map(([id, nombre], k) =>
    h("button", { type: "button", clase: "chip", datos: k ? { id, slot: ["a", "b"][k - 1] } : { id }, onclick: () => fijar(id) }, nombre));
  const fijar = id => {
    e.objetivo = id;
    chips.forEach(c => c.setAttribute("aria-pressed", c.dataset.id === id));
    alObjetivo?.(id);
  };

  const sonidoEl = h("button", { type: "button", clase: "sonido", onclick: () => (e.sonido ? silenciar() : activarSonido()) });
  const pintarSonido = () => {
    sonidoEl.classList.toggle("activo", e.sonido);
    sonidoEl.title = e.sonido ? "Mute this device" : "Enable audio on this device";
    sonidoEl.replaceChildren(icono(e.sonido ? "bocina" : "silencio"), h("span", { clase: "txt" }, e.sonido ? "Audio on" : "Enable audio"));
  };
  const activarSonido = () => {
    if (e.sonido) return;
    e.audio.src = SILENCIO; e.audio.play().catch(() => {});
    e.sonido = true; pintarSonido();
  };
  const silenciar = () => {
    e.sonido = false; e.audio.pause();
    if (e.hablando) api.estado("listo");
    e.hablando = false; pintarSonido();
  };

  const bitacora = h("button", {
    type: "button", clase: "bitacora", title: "Conversation history", "aria-expanded": "false",
    onclick: () => { logEl.hidden = !logEl.hidden; bitacora.setAttribute("aria-expanded", !logEl.hidden); turnosEl.scrollTop = turnosEl.scrollHeight; },
  }, icono("historial"), h("span", { clase: "txt" }, "Conversation"), contador);
  const pintarLog = () => {
    contador.textContent = e.turnos.length;
    turnosEl.replaceChildren(...(e.turnos.length
      ? e.turnos.map(t => h("div", { clase: "adam-turno" },
        h("small", {}, `${t.hora} · ${nombreDe(t.objetivo)}`),
        t.q ? h("p", { clase: "q" }, `“${t.q}”`) : null,
        h("p", { clase: "a" }, t.a)))
      : [h("p", { clase: "adam-vacio" }, "No conversation yet. Ask ADAM about the crew's vitals or the cabin.")]));
    turnosEl.scrollTop = turnosEl.scrollHeight;
  };

  const mic = h("button", {
    type: "button", clase: "microfono", "aria-label": "Talk to ADAM", title: "Talk to ADAM",
    onclick: () => { activarSonido(); alMicrofono?.({ objetivo: e.objetivo, grabando: raiz.dataset.estado === "grabando" }); },
  }, icono("microfono"));

  const entrada = h("input", { type: "text", placeholder: "Ask ADAM…", "aria-label": "Ask ADAM", autocomplete: "off", maxlength: "300" });
  const form = h("form", {
    clase: "adam-form",
    onsubmit: ev => {
      ev.preventDefault();
      const texto = entrada.value.trim();
      if (!texto) return;
      entrada.value = ""; activarSonido();
      preguntaEl.textContent = `“${texto}”`; respuestaEl.textContent = "";
      api.estado("pensando");
      alEnviar?.({ texto, objetivo: e.objetivo });
    },
  }, entrada, h("button", { type: "submit", "aria-label": "Send question" }, icono("enviar")));

  const api = {
    estado(clave, texto) {
      raiz.dataset.estado = clave;
      raiz.classList.toggle("trabajando", clave === "pensando" || clave === "hablando");
      estadoEl.className = `adam-estado ${clave}`;
      txt.textContent = texto ?? TEXTOS[clave];
      mic.classList.toggle("grabando", clave === "grabando");
    },
    intercambio(q, a, objetivo = e.objetivo) {
      e.turnos.push({ hora: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), q, a, objetivo });
      preguntaEl.textContent = q ? `“${q}”` : ""; respuestaEl.textContent = a ?? "";
      pintarLog();
    },
    hablar(src) {
      if (!e.sonido || !src) return;
      e.hablando = true; e.audio.src = src;
      e.audio.play().catch(err => { e.hablando = false; api.estado("error", `Could not play the audio: ${err.message}`); });
    },
    objetivo: fijar,
  };

  e.audio.addEventListener("playing", () => e.hablando && api.estado("hablando"));
  e.audio.addEventListener("ended", () => { if (e.hablando) { e.hablando = false; api.estado("listo"); } });

  raiz.replaceChildren(logEl, h("div", { clase: "adam-barra" },
    mic,
    h("div", { clase: "adam-centro" },
      h("div", { clase: "adam-fila" }, h("i", { clase: "orbe" }), h("b", { clase: "adam-titulo" }, "ADAM"),
        h("div", { clase: "chips", role: "group", "aria-label": "Ask about" }, ...chips)),
      estadoEl, preguntaEl, respuestaEl),
    h("div", { clase: "adam-der" }, form, sonidoEl, bitacora)));

  api.estado("listo"); pintarSonido(); pintarLog(); fijar("todos");
  return api;
}
