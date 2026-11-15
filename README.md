# ADAM — Astronaut Monitoring dashboard
Serve this folder with any static server (ES modules need http), e.g. `python3 -m http.server` and open http://localhost:8000.
- `app.js` — UI (live dual view + history tab). Only talks to `api` from `datos.js`.
- `mock.js` — simulated data. Replace the `api` export with your real client (same method names/shapes).

## ADAM assistant (voice/text bar)
UI lives in `adam.js`; the demo wiring is `montarAsistente()` in `app.js` (marked DEMO ONLY — replace it with your agent).
- Callbacks: `alMicrofono({objetivo, grabando})`, `alEnviar({texto, objetivo})`, `alObjetivo(id)`.
- Controller: `adam.estado("listo|grabando|pensando|hablando|error", texto?)`, `adam.intercambio(pregunta, respuesta, objetivo?)` (pregunta may be null for proactive alerts), `adam.hablar(audioUrl)`, `adam.objetivo(id)`.
