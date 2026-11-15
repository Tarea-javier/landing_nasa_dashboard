const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const VENTANA_VIVO = HORA;
const CADA_EVENTO = 75 * SEGUNDO;
const PRIMER_EVENTO = 15 * SEGUNDO;
const DIAS_EN_VUELO = 142;

const INDICADORES = [
  ["hr", "Heart rate", "lpm", "vital", 50, 100, 40, 130, 0],
  ["spo2", "Blood oxygen", "%", "vital", 95, 100, 90, 100, 0],
  ["temp_corporal", "Body temperature", "°C", "vital", 36.1, 37.5, 35.5, 38.3, 1],
  ["presion_sis", "Systolic pressure", "mmHg", "vital", 90, 130, 80, 160, 0],
  ["presion_dia", "Diastolic pressure", "mmHg", "vital", 60, 85, 50, 100, 0],
  ["glucosa", "Glucose", "mg/dL", "vital", 70, 140, 55, 200, 0],
  ["co2", "Cabin CO₂", "mmHg", "ambiente", 0, 3, 0, 4, 2],
  ["temp_cabina", "Cabin temperature", "°C", "ambiente", 18, 27, 16, 29, 1],
  ["humedad", "Cabin humidity", "%", "ambiente", 25, 70, 20, 75, 0],
  ["radiacion", "Radiation", "µSv/h", "ambiente", 0, 40, 0, 100, 1],
  ["sueno_horas", "Sleep", "h", "diario", 6, 9, 5, 11, 1],
  ["animo", "Mood", "1-5", "diario", 3, 5, 2, 5, 0],
].map(([id, nombre, unidad, categoria, normal_min, normal_max, alerta_min, alerta_max, decimales]) => ({
  id, nombre, unidad, categoria, normal_min, normal_max, alerta_min, alerta_max, decimales,
}));

const CATALOGO = Object.fromEntries(INDICADORES.map(i => [i.id, i]));

const TRIPULANTES = [
  { id: "T1", nombre: "Cmdr. Ríos", rol: "Commander" },
  { id: "T2", nombre: "Dr. Vega", rol: "Mission Specialist" },
];

const BASE = {
  T1: { hr: 66, temp: 36.9, sis: 112, dia: 71, glucosa: 94 },
  T2: { hr: 72, temp: 37.0, sis: 108, dia: 69, glucosa: 99 },
};

const RUIDO = {
  hr: 2, spo2: 0.5, temp_corporal: 0.04, presion_sis: 5, presion_dia: 4, glucosa: 6,
  co2: 0.08, temp_cabina: 0.1, humedad: 2, radiacion: 2.5,
};

const EVENTOS = {
  taquicardia: 60 * SEGUNDO,
  desaturacion: 45 * SEGUNDO,
  co2_alto: 90 * SEGUNDO,
  tormenta_solar: 60 * SEGUNDO,
  fiebre: 120 * SEGUNDO,
};

const RANGOS = {
  tiempo_real: { ventana: 5 * MINUTO, bucket: null },
  "1h": { ventana: HORA, bucket: 10 * SEGUNDO },
  "24h": { ventana: DIA, bucket: 5 * MINUTO },
  "7d": { ventana: 7 * DIA, bucket: 30 * MINUTO },
  "30d": { ventana: 30 * DIA, bucket: 2 * HORA },
  "1y": { ventana: 365 * DIA, bucket: DIA },
};

const VITALES = ["hr", "spo2", "temp_corporal"];
const CABINA = ["co2", "temp_cabina", "humedad", "radiacion"];
const DIARIOS = ["sueno_horas", "animo"];

const LANZAMIENTO = Date.now() - DIAS_EN_VUELO * DIA;

// ---------- deterministic noise, so history does not reshuffle on every reload ----------

function azar(clave) {
  let h = 2166136261;
  for (let k = 0; k < clave.length; k++) h = Math.imul(h ^ clave.charCodeAt(k), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function gaussFijo(clave) {
  const u = Math.max(azar(`${clave}|a`), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * azar(`${clave}|b`));
}

function gauss(sigma = 1) {
  const u = Math.max(Math.random(), 1e-9);
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

const redondear = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ---------- signal model (port of sim/simulador.py) ----------

function horaDelDia(ms) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

const circadiano = (ms, pico) => Math.sin((2 * Math.PI * (horaDelDia(ms) - pico + 6)) / 24);

function enEjercicio(ms) {
  const h = horaDelDia(ms);
  return (h >= 10 && h < 11) || (h >= 18 && h < 19);
}

function despuesDeComer(ms) {
  const h = horaDelDia(ms);
  return Math.max(0, ...[8, 13, 19].filter(c => h >= c).map(c => Math.exp(-(h - c) / 1.2)));
}

const enVuelo = ms => ms >= LANZAMIENTO;
const indiceDia = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * MINUTO) / DIA);

// Expected value without noise; used for history and as the base of live readings.
function modelo(dueno, ind, ms) {
  const vuelo = enVuelo(ms);
  if (dueno === "cabina") {
    if (ind === "co2") return 2.2 + 0.3 * circadiano(ms, 14);
    if (ind === "temp_cabina") return 22.5 + 0.4 * circadiano(ms, 15);
    if (ind === "humedad") return 45;
    return 22;
  }
  const b = BASE[dueno];
  const ej = enEjercicio(ms) ? 1 : 0;
  switch (ind) {
    case "hr":
      return b.hr + 6 * circadiano(ms, 16) + 45 * ej + (vuelo ? 4 : 0) + 1.5 * gaussFijo(`${dueno}|dia|${indiceDia(ms)}`);
    case "spo2":
      return vuelo ? 97.4 : 97.8;
    case "temp_corporal":
      return b.temp + 0.3 * circadiano(ms, 18) + 0.5 * ej;
    case "presion_sis":
      return b.sis + (vuelo ? 6 : 0);
    case "presion_dia":
      return b.dia + (vuelo ? 3 : 0);
    case "glucosa":
      return b.glucosa + 35 * despuesDeComer(ms);
  }
  return null;
}

function diario(dueno, ind, dia) {
  const vuelo = enVuelo(dia * DIA);
  const clave = `${dueno}|${ind}|${dia}`;
  if (ind === "sueno_horas") {
    const v = vuelo ? 6.3 + 0.6 * gaussFijo(clave) : 7.4 + 0.5 * gaussFijo(clave);
    return redondear(Math.min(9, Math.max(4.5, v)), 1);
  }
  const opciones = vuelo ? [3, 4, 4, 4, 5] : [4, 4, 5, 5, 4];
  return opciones[Math.floor(azar(clave) * opciones.length)];
}

// Daily log entries are written at 07:00 local time.
function momentoDiario(dia) {
  const medianoche = new Date(dia * DIA);
  const local = new Date(medianoche.getUTCFullYear(), medianoche.getUTCMonth(), medianoche.getUTCDate(), 7);
  return local.getTime();
}

const dueno = (ind, tripulante) => (CATALOGO[ind].categoria === "ambiente" ? "cabina" : tripulante);

// ---------- live stream (last hour of raw 1 s readings, kept in memory) ----------

const vivo = { buffer: new Map(), ultimo: 0, version: 0, eventos: {}, afectado: null, proximoEvento: 0, bp: 0, glu: 0 };

function guardar(d, valores, ms) {
  for (const [ind, v] of Object.entries(valores)) {
    const clave = `${d}:${ind}`;
    if (!vivo.buffer.has(clave)) vivo.buffer.set(clave, []);
    vivo.buffer.get(clave).push([ms, v]);
  }
}

function lecturaViva(d, ind, ms) {
  let v = modelo(d, ind, ms) + gauss(RUIDO[ind]);
  const ev = vivo.eventos;
  const afectado = vivo.afectado === d;
  if (ind === "hr" && afectado && ev.taquicardia > ms) v += 55;
  if (ind === "spo2" && afectado && ev.desaturacion > ms) v = 88.5 + gauss(0.6);
  if (ind === "temp_corporal" && afectado && ev.fiebre > ms) v = 38.6 + gauss(0.05);
  if (ind === "co2" && ev.co2_alto > ms) v = 4.4 + gauss(0.1);
  if (ind === "radiacion" && ev.tormenta_solar > ms) v = 160 + gauss(20);
  if (ind === "spo2") v = Math.min(100, v);
  const decimales = { hr: 0, spo2: 1, temp_corporal: 2, co2: 2, temp_cabina: 1, humedad: 0, radiacion: 1 };
  return redondear(v, decimales[ind] ?? 0);
}

function paso(ms, conEventos) {
  if (conEventos && ms >= vivo.proximoEvento) {
    const nombres = Object.keys(EVENTOS);
    const nombre = nombres[Math.floor(Math.random() * nombres.length)];
    vivo.eventos[nombre] = ms + EVENTOS[nombre];
    vivo.afectado = TRIPULANTES[Math.floor(Math.random() * TRIPULANTES.length)].id;
    vivo.proximoEvento = ms + CADA_EVENTO;
  }
  for (const { id } of TRIPULANTES) {
    guardar(id, Object.fromEntries(VITALES.map(ind => [ind, lecturaViva(id, ind, ms)])), ms);
    if (ms - vivo.bp >= MINUTO) {
      guardar(id, {
        presion_sis: Math.round(modelo(id, "presion_sis", ms) + gauss(RUIDO.presion_sis)),
        presion_dia: Math.round(modelo(id, "presion_dia", ms) + gauss(RUIDO.presion_dia)),
      }, ms);
    }
    if (ms - vivo.glu >= 5 * MINUTO) {
      guardar(id, { glucosa: Math.round(modelo(id, "glucosa", ms) + gauss(RUIDO.glucosa)) }, ms);
    }
  }
  if (ms - vivo.bp >= MINUTO) vivo.bp = ms;
  if (ms - vivo.glu >= 5 * MINUTO) vivo.glu = ms;
  guardar("cabina", Object.fromEntries(CABINA.map(ind => [ind, lecturaViva("cabina", ind, ms)])), ms);
}

function podar(ahora) {
  const limite = ahora - VENTANA_VIVO;
  for (const puntos of vivo.buffer.values()) {
    let k = 0;
    while (k < puntos.length && puntos[k][0] < limite) k++;
    if (k) puntos.splice(0, k);
  }
}

// Catches up one reading per second since the last call (survives throttled background tabs).
function avanzar() {
  const ahora = Math.floor(Date.now() / SEGUNDO) * SEGUNDO;
  if (!vivo.ultimo) {
    for (let ms = ahora - VENTANA_VIVO; ms <= ahora; ms += SEGUNDO) paso(ms, false);
    vivo.proximoEvento = ahora + PRIMER_EVENTO;
    vivo.ultimo = ahora;
    vivo.version++;
    return;
  }
  const desde = Math.max(vivo.ultimo + SEGUNDO, ahora - VENTANA_VIVO);
  if (desde > ahora) return;
  for (let ms = desde; ms <= ahora; ms += SEGUNDO) paso(ms, true);
  vivo.ultimo = ahora;
  vivo.version++;
  podar(ahora);
}

// ---------- queries ----------

function estadoDe(ind, valor) {
  if (valor === null || valor === undefined) return "sin_datos";
  const i = CATALOGO[ind];
  if (valor < i.alerta_min || valor > i.alerta_max) return "alerta";
  if (valor < i.normal_min || valor > i.normal_max) return "precaucion";
  return "normal";
}

function ultimoDiario(d, ind, ahora) {
  let dia = indiceDia(ahora);
  if (momentoDiario(dia) > ahora) dia--;
  return [momentoDiario(dia), diario(d, ind, dia)];
}

function estado(tripulante) {
  const ahora = Date.now();
  return INDICADORES.map(({ id }) => {
    const d = dueno(id, tripulante);
    const puntos = vivo.buffer.get(`${d}:${id}`);
    const ultimo = DIARIOS.includes(id) ? ultimoDiario(d, id, ahora) : puntos?.[puntos.length - 1];
    const valor = ultimo ? ultimo[1] : null;
    return {
      indicador: id,
      valor,
      tiempo: ultimo ? new Date(ultimo[0]).toISOString() : null,
      simulado: true,
      estado: estadoDe(id, valor),
    };
  });
}

function agrupar(puntos, bucket) {
  const grupos = new Map();
  for (const [ms, v] of puntos) {
    const t = Math.floor(ms / bucket) * bucket;
    const g = grupos.get(t) ?? [0, 0];
    g[0] += v;
    g[1]++;
    grupos.set(t, g);
  }
  return [...grupos].map(([t, [suma, n]]) => [t, redondear(suma / n, 3)]);
}

// Bucket average of the model, sampled 24 times per bucket, plus a little stable noise.
function historico(d, ind, desde, hasta, bucket) {
  const resultado = [];
  const cada30 = ["presion_sis", "presion_dia", "glucosa"].includes(ind);
  for (let t = Math.floor(desde / bucket) * bucket; t < hasta; t += bucket) {
    if (t < desde) continue;
    if (d === "cabina" && !enVuelo(t)) continue;
    if (cada30 && bucket < 30 * MINUTO && t % (30 * MINUTO) !== 0) continue;
    // A bucket that is still open averages the last full bucket-width up to now,
    // so a daily point at 18:30 is not just the 30 minutes of exercise so far.
    const inicio = Math.min(t, hasta - bucket);
    let suma = 0;
    for (let k = 0; k < 24; k++) suma += modelo(d, ind, inicio + ((k + 0.5) * bucket) / 24);
    const muestras = Math.max(1, bucket / (cada30 ? 30 * MINUTO : d === "cabina" ? MINUTO : 15 * MINUTO));
    const ruido = RUIDO[ind] * (1 / Math.sqrt(muestras) + 0.15) * gaussFijo(`${d}|${ind}|${bucket}|${t}`);
    let v = suma / 24 + ruido;
    if (ind === "spo2") v = Math.min(100, v);
    resultado.push([t, redondear(v, 3)]);
  }
  return resultado;
}

function serieDiaria(d, ind, desde, hasta, bucket) {
  const resultado = [];
  for (let dia = indiceDia(desde) - 1; dia <= indiceDia(hasta); dia++) {
    const ms = momentoDiario(dia);
    if (ms <= desde || ms > hasta) continue;
    resultado.push([bucket ? Math.floor(ms / bucket) * bucket : ms, diario(d, ind, dia)]);
  }
  return resultado;
}

function serie(indicadores, tripulante, rango) {
  const { ventana, bucket } = RANGOS[rango];
  const ahora = Date.now();
  const desde = ahora - ventana;
  const series = {};
  for (const ind of indicadores) {
    const d = dueno(ind, tripulante);
    if (DIARIOS.includes(ind)) {
      series[ind] = serieDiaria(d, ind, desde, ahora, bucket);
      continue;
    }
    const crudos = (vivo.buffer.get(`${d}:${ind}`) ?? []).filter(p => p[0] > desde);
    if (!bucket) {
      series[ind] = crudos;
      continue;
    }
    if (ventana <= VENTANA_VIVO) {
      series[ind] = agrupar(crudos, bucket);
      continue;
    }
    if (bucket >= VENTANA_VIVO) {
      series[ind] = historico(d, ind, desde, ahora, bucket);
      continue;
    }
    const corte = Math.ceil((ahora - VENTANA_VIVO) / bucket) * bucket;
    series[ind] = [
      ...historico(d, ind, desde, corte, bucket),
      ...agrupar(crudos.filter(p => p[0] >= corte), bucket),
    ];
  }
  return { rango, tripulante_id: tripulante, series };
}

// ---------- public API, same names and shapes as the real fetch-based client ----------

const listo = valor => Promise.resolve(structuredClone(valor));

export const api = {
  indicadores: () => listo(INDICADORES),
  tripulantes: () => listo(TRIPULANTES),
  version: () => {
    avanzar();
    return listo({ version: vivo.version, actualizado: new Date(vivo.ultimo).toISOString(), comando: 0 });
  },
  comandos: () => listo([]),
  estado: tripulante_id => listo(estado(tripulante_id)),
  series: (indicadores, tripulante_id, rango) => listo(serie(indicadores, tripulante_id, rango)),
  sincronia: () => listo({ comando: 0, vista: null, hablar: null }),
  vista: () => listo({ id: 0 }),
};
