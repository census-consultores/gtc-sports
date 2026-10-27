// GTC Sports — motor de torneos (réplica de Tournament Planner 2025.2).
// Módulo puro: corre en el navegador (torneos.html) y en Node (pruebas). No toca la red.
// Un torneo es un solo documento JSON (como el archivo .TP): T = { info, dias, franjas, sedes, eventos,
// jugadores, inscripciones, cuadros, enlaces, res, ... }. resolver(T) deriva cuadros, partidos y tablas.

export const DEPORTES = { tenis: 'Tenis', padel: 'Pádel', beachtenis: 'Beach Tenis', pingpong: 'Ping Pong', pickleball: 'Pickleball', beachvolley: 'Beach Volley' };
export const GENEROS = { M: 'Caballeros', F: 'Damas', X: 'Mixto', B: 'Niños', G: 'Niñas', A: 'Cualquier género' };
export const ESTADOS_INS = { '': 'Aceptación directa', WC: 'Wild Card', LL: 'Lucky Loser', Q: 'Qualifier', DA: 'Aceptación directa', DQ: 'Descalificado', PR: 'Ranking protegido', SE: 'Exención especial', ALT: 'Alterno', WD: 'Retirado' };
export const LISTAS = { main: 'Cuadro principal', qual: 'Clasificación', reserve: 'Reserva', exclude: 'Excluidos' };
export const ETAPAS = { main: 'Cuadro principal', qual: 'Clasificación', prequal: 'Pre-clasificación', playoff: 'Playoff', grupos: 'Fase de grupos', ll: 'Lucky Losers', cons: 'Consolación', qcons: 'Consolación de clasificación', extra: 'Extra', reserve: 'Reserva', exclude: 'Excluidos' };
export const ESTADOS_PARTIDO = { '': 'Normal', wo: 'W.O.', wom: 'W.O. médico', ret: 'Retiro', dis: 'Descalificación', np: 'No jugado' };

// ---------- puntuación ----------
// Los 16 tipos de set de Tournament Planner + «puntos» (ping pong, pickleball, beach volley).
// g = games para ganar, tb = en qué empate se juega tie-break (null = sin tie-break), p = puntos (sets de puntos).
export const SETS = {
  normal: { n: 'Set normal (tie-break a 6-6)', g: 6, tb: 6 },
  mtb10: { n: 'Match tie-break (10)', p: 10 },
  mtb10uno: { n: 'Match tie-break (se registra 1-0)', uno: true },
  tb7: { n: 'Tie-break (7)', p: 7 },
  corto: { n: 'Set corto (tie-break a 4-4)', g: 4, tb: 4 },
  largo: { n: 'Set largo (sin tie-break)', g: 6, tb: null },
  minimtb10: { n: 'Mini tenis match tie-break (10)', p: 10 },
  minitb7: { n: 'Mini tenis tie-break (7)', p: 7 },
  pro8: { n: 'Pro set (tie-break a 8-8)', g: 8, tb: 8 },
  fast4: { n: 'Set FAST4', g: 4, tb: 3 },
  fast4mtb: { n: 'FAST4 match tie-break (10)', p: 10 },
  primero4: { n: 'Primero a 4 (sin tie-break)', g: 4, primero: true },
  tbprimero7: { n: 'Tie-break primero a 7 (7-6)', g: 7, primero: true },
  mtb15: { n: 'Match tie-break (15)', p: 15 },
  libre: { n: 'Acepta cualquier marcador', libre: true },
  custom: { n: 'Personalizado (games)', g: null, tb: 'g' },
  puntos: { n: 'Por puntos (ping pong, pickleball, beach volley)', p: null }
};
function setDef(tipo, f, ultimo) {
  const d = { ...(SETS[tipo] || SETS.normal) };
  if (tipo === 'custom') { d.g = +(f && f.games) || 6; d.tb = d.g; }
  if (tipo === 'puntos') { d.p = +((ultimo ? f.puntosUltimo : 0) || f.puntos) || 11; d.por2 = f.ganarPor2 !== false; d.tope = +f.tope || 0; }
  else if (d.p) d.por2 = true;
  return d;
}
// Devuelve 'a' o 'b' si el set (x, y) es válido para el tipo, o false.
export function ganadorSet(tipo, f, x, y, ultimo) {
  const d = setDef(tipo, f || {}, ultimo);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x === y) return false;
  const W = Math.max(x, y), L = Math.min(x, y), w = x > y ? 'a' : 'b';
  if (d.libre) return w;
  if (d.uno) return W === 1 && L === 0 ? w : false;
  if (d.p) { // por puntos / tie-break
    if (d.tope && W === d.tope && W - L >= 1 && L >= d.p - 1) return w;
    if (W < d.p) return false;
    if (!d.por2) return W === d.p ? w : false;
    return (W === d.p && W - L >= 2) || (W > d.p && W - L === 2) ? w : false;
  }
  const g = d.g;
  if (d.primero) return W === g && L < g ? w : false;
  if (d.tb == null) return (W === g && W - L >= 2) || (W > g && W - L === 2) ? w : false; // largo
  if (d.tb === g) return (W === g && L <= g - 2) || (W === g + 1 && (L === g - 1 || L === g)) ? w : false;
  if (d.tb === g - 1) return W === g && L <= g - 1 ? w : false; // FAST4: tie-break a 3-3
  return false;
}
// Autocompletar como TP: se escribe el marcador de quien perdió el set y se completa el del ganador.
export function completarSet(tipo, f, perdedor, ultimo) {
  const d = setDef(tipo, f || {}, ultimo), L = perdedor;
  if (!Number.isInteger(L) || L < 0) return null;
  if (d.libre) return null;
  if (d.uno) return L === 0 ? 1 : null;
  if (d.p) { if (d.tope && L >= d.tope - 1) return d.tope; return L <= d.p - 2 ? d.p : L + (d.por2 ? 2 : 1); }
  const g = d.g;
  if (d.primero) return L < g ? g : null;
  if (d.tb == null) return L <= g - 2 ? g : L + 2;
  if (d.tb === g) return L <= g - 2 ? g : (L <= g ? g + 1 : null);
  if (d.tb === g - 1) return L <= g - 1 ? g : null;
  return null;
}
// sets: [[a,b], ...]. Devuelve {ok, g: 'a'|'b'|null, sa, sb, msg}
export function evaluarMarcador(fmt, sets) {
  const f = fmt || {}, best = +f.bestOf || 3, need = Math.floor(best / 2) + 1;
  let sa = 0, sb = 0;
  for (let i = 0; i < sets.length; i++) {
    const [x, y] = sets[i];
    if (sa >= need || sb >= need) return { ok: false, msg: 'Hay sets de más: el partido ya estaba decidido.' };
    const ult = i === best - 1;
    const w = ganadorSet(ult ? (f.ultimo || f.tipo) : f.tipo, f, x, y, ult);
    if (!w) return { ok: false, set: i, msg: 'El set ' + (i + 1) + ' (' + x + '-' + y + ') no es válido para este formato.' };
    if (w === 'a') sa++; else sb++;
  }
  const g = sa >= need ? 'a' : sb >= need ? 'b' : null;
  return { ok: true, g, sa, sb, completo: !!g };
}
export function formatosPorDeporte(dep) {
  const F = (id, nombre, o) => ({ id, nombre, bestOf: 3, tipo: 'normal', ultimo: 'normal', ...o });
  if (dep === 'padel') return [F('f1', '2 sets + super tie-break a 10', { ultimo: 'mtb10', defecto: true }), F('f2', '3 sets con tie-break a 6-6'), F('f3', 'Pro set a 8', { bestOf: 1, tipo: 'pro8', ultimo: 'pro8' })];
  if (dep === 'beachtenis') return [F('f1', '2 sets + super tie-break a 10', { ultimo: 'mtb10', defecto: true }), F('f2', '1 set a 6', { bestOf: 1 }), F('f3', '3 sets cortos a 4', { tipo: 'corto', ultimo: 'corto' })];
  if (dep === 'pingpong') return [F('f1', 'Mejor de 5 sets a 11 puntos', { bestOf: 5, tipo: 'puntos', ultimo: 'puntos', puntos: 11, ganarPor2: true, defecto: true }), F('f2', 'Mejor de 3 sets a 11 puntos', { tipo: 'puntos', ultimo: 'puntos', puntos: 11, ganarPor2: true }), F('f3', 'Mejor de 7 sets a 11 puntos', { bestOf: 7, tipo: 'puntos', ultimo: 'puntos', puntos: 11, ganarPor2: true })];
  if (dep === 'pickleball') return [F('f1', 'Mejor de 3 juegos a 11 puntos', { tipo: 'puntos', ultimo: 'puntos', puntos: 11, ganarPor2: true, defecto: true }), F('f2', '1 juego a 15 puntos', { bestOf: 1, tipo: 'puntos', ultimo: 'puntos', puntos: 15, ganarPor2: true }), F('f3', 'Mejor de 3 juegos a 15 puntos', { tipo: 'puntos', ultimo: 'puntos', puntos: 15, ganarPor2: true })];
  if (dep === 'beachvolley') return [F('f1', '2 sets a 21 y tercero a 15', { tipo: 'puntos', ultimo: 'puntos', puntos: 21, puntosUltimo: 15, ganarPor2: true, defecto: true })];
  return [F('f1', '3 sets con tie-break a 6-6', { defecto: true }), F('f2', '2 sets + match tie-break a 10', { ultimo: 'mtb10' }), F('f3', 'Pro set a 8', { bestOf: 1, tipo: 'pro8', ultimo: 'pro8' })];
}

// ---------- torneo nuevo ----------
export const CRITERIOS = { mp: 'Puntos de partido', rmp: 'Puntos de partido entre empatados', rsd: 'Diferencia de sets entre empatados', rgd: 'Diferencia de games entre empatados', noret: 'No usar resultados de retirados', sd: 'Diferencia de sets', gd: 'Diferencia de games', gf: 'Games a favor', h2h: 'Enfrentamiento directo', sp: 'Porcentaje de sets', gp: 'Porcentaje de games', rsp: 'Porcentaje de sets entre empatados', rgp: 'Porcentaje de games entre empatados' };
export function id(p) { return (p || 'x') + Math.random().toString(36).slice(2, 9); }
export function nuevoTorneo(info) {
  const dep = info.deporte || 'tenis';
  return {
    v: 1,
    info: { nombre: '', numero: '', grupo: '', organizador: 'Guayaquil Tenis Club', tel: '', email: 'deportes@guayaquiltenisclub.ec', arbitro: '', arbitroTel: '', arbitroEmail: '', sede: 'Guayaquil Tenis Club', direccion: '', ciudad: 'Guayaquil', pais: 'Ecuador', zona: 'America/Guayaquil', web: '', ...info, deporte: dep },
    dias: [], franjas: {},
    sedes: [{ id: 's1', nombre: 'Guayaquil Tenis Club', direccion: '', canchas: [], modo: 'manual' }],
    bloqueos: {}, // canchaId -> { dia: [hora, ...] } franjas en que la cancha no está disponible
    rr: { modo: 'partido', pg: 2, pe: 1, pp: 0, sinPuntosWO: false, ps: [1, 1, 1, 0, 0], criterios: ['mp', 'rmp', 'rsd', 'rgd', 'noret'].map(k => ({ k, on: true })).concat(['sd', 'gd', 'gf', 'h2h', 'sp', 'gp', 'rsp', 'rgp'].map(k => ({ k, on: false }))) },
    cuotas: { base: 'inscripcion', tipo: 'suma', precios: [0, 0, 0], moneda: 'USD', extras: [] },
    opc: { numPartido: true, duracion: false, negrita: true, byeNum: true, cancha: true, sede: false, alfabetico: true, checkin: 'partido', primerCheckin: false, rondasRR: true, equilibrarRR: false, descanso: 30, mixto: 'h' },
    prog: { maxDia: 3, maxEvento: 2, periodo: 1, maxInd: 2, duracion: 75, descanso: 150, avisarSig: true, intercambios: true, ordenJuego: false },
    formatos: formatosPorDeporte(dep), autocompletar: true,
    oficiales: [], eventos: [], jugadores: [], inscripciones: [], cuadros: [], enlaces: [], res: {}, ajustes: {},
    notas: [], movimientos: [], avisos: [], publicado: false
  };
}
export function formatoDe(T, cuadro) {
  const ev = cuadro && T.eventos.find(e => e.id === cuadro.evento);
  const et = ev && (ev.etapas || []).find(s => s.id === cuadro.etapa);
  const fid = cuadro && cuadro.formato || (et && (cuadro.cons ? et.formatoCons : et.formato));
  return T.formatos.find(f => f.id === fid) || T.formatos.find(f => f.defecto) || T.formatos[0];
}
export function nuevoEvento(T, o) {
  const ev = { id: id('e'), nombre: '', genero: 'M', tipo: T.info.deporte === 'padel' ? 'D' : 'S', nivel: '', edadMin: 0, edadMax: 0, cuota: 0, sepSiembra: false, noDisp: {}, ...o };
  ev.etapas = ev.etapas || [{ id: 'main', tipo: 'main' }, { id: 'reserve', tipo: 'reserve' }, { id: 'exclude', tipo: 'exclude' }];
  return ev;
}
// Franjas: generador inicio-intervalo-fin, como Tournament Planner.
export function generarFranjas(inicio, intervalo, fin, max) {
  const toM = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const out = []; for (let m = toM(inicio); m <= toM(fin) && out.length < (max || 96); m += +intervalo) out.push(hhmm(m));
  return out;
}
export function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
export function minutos(h) { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); }

// ---------- jugadores ----------
export function edad(nac, ref) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nac || '')) return null;
  const r = ref ? new Date(ref + 'T12:00:00Z') : new Date(), n = new Date(nac + 'T12:00:00Z');
  let e = r.getUTCFullYear() - n.getUTCFullYear();
  if (r.getUTCMonth() < n.getUTCMonth() || (r.getUTCMonth() === n.getUTCMonth() && r.getUTCDate() < n.getUTCDate())) e--;
  return e;
}
export function esMenor(j, T) { const e = edad(j && j.nac, T && T.info.desde); return e != null && e < 18; }
export function nombreJ(j, T) {
  if (!j) return '';
  const apellidoPrimero = T && T.opc && T.opc.nombres === 'apellido';
  return apellidoPrimero ? [j.apellido, j.nombre].filter(Boolean).join(', ') : [j.nombre, j.apellido].filter(Boolean).join(' ');
}
// Invitados: solo beach tenis, desde noviembre de 2026, hasta 6 por torneo (decisión de Deportes, 27-oct-2026).
export const MAX_INVITADOS = 6;
export function invitadosPermitidos(T) { return T.info.deporte === 'beachtenis' && String(T.info.desde || '') >= '2026-11-01'; }
export function validarJugador(T, j) {
  const errs = [];
  if (!String(j.apellido || '').trim() && !String(j.nombre || '').trim()) errs.push('Escribe el nombre del jugador.');
  if (!j.genero) errs.push('Indica el género.');
  if (j.invitado) {
    if (!invitadosPermitidos(T)) errs.push('Solo los torneos de beach tenis desde noviembre de 2026 admiten invitados.');
    else if (T.jugadores.filter(x => x.invitado && x.id !== j.id).length >= MAX_INVITADOS) errs.push('Este torneo ya tiene ' + MAX_INVITADOS + ' invitados, el máximo permitido.');
  } else {
    if (!String(j.socio || '').replace(/\D/g, '')) errs.push('Falta el código de socio.');
  }
  if (j.cedula && String(j.cedula).replace(/\D/g, '').length !== 10) errs.push('La cédula debe tener 10 dígitos.');
  if (j.nac && !/^\d{4}-\d{2}-\d{2}$/.test(j.nac)) errs.push('Fecha de nacimiento inválida.');
  return errs;
}
// Revisión de un jugador frente a una categoría (Check Players de TP).
export function chequeoInscripcion(T, ev, j) {
  const w = [];
  if (!j) return w;
  if ((ev.genero === 'M' || ev.genero === 'B') && j.genero === 'F') w.push('Jugadora en categoría masculina.');
  if ((ev.genero === 'F' || ev.genero === 'G') && j.genero === 'M') w.push('Jugador en categoría femenina.');
  const e = edad(j.nac, T.info.desde);
  if (e != null && ev.edadMax && e > ev.edadMax) w.push('Supera la edad máxima (' + ev.edadMax + ').');
  if (e != null && ev.edadMin && e < ev.edadMin) w.push('No alcanza la edad mínima (' + ev.edadMin + ').');
  return w;
}
// Cuota de un jugador (Entry Fees de TP).
export function cuotaJugador(T, jid) {
  const evs = T.inscripciones.filter(i => (i.j1 === jid || i.j2 === jid) && i.lista !== 'exclude' && i.estado !== 'WD');
  const enCuadro = new Set(); T.cuadros.forEach(c => (c.lineas || []).forEach(x => { if (x) enCuadro.add(x); }));
  const lista = T.cuotas.base === 'participacion' ? evs.filter(i => enCuadro.has(i.id)) : evs;
  let total = 0;
  if (T.cuotas.tipo === 'numero') lista.forEach((_, k) => { total += +(T.cuotas.precios[Math.min(k, 2)] || 0); });
  else lista.forEach(i => { const ev = T.eventos.find(e => e.id === i.evento); total += +(ev && ev.cuota || 0); });
  const j = T.jugadores.find(x => x.id === jid) || {};
  (T.cuotas.extras || []).forEach(x => { const v = j.extras && j.extras[x.id]; if (v) total += x.tipo === 'numero' ? (+v || 0) * (+x.precio || 0) : +x.precio || 0; });
  const pagado = (j.pagos || []).reduce((s, p) => s + (+p.monto || 0), 0);
  return { total, pagado, saldo: total - pagado - (+j.descuento || 0) };
}

// ---------- inscripciones ----------
// Una inscripción es un participante del cuadro (una pareja en dobles). Solo las activas (pago validado) se sortean.
export function inscripcionActiva(i) { return i && i.pago === 'pagada' && i.estado !== 'WD' && i.estado !== 'DQ'; }
export function nombreIns(T, ins, corto) {
  if (!ins) return '';
  const j1 = T.jugadores.find(j => j.id === ins.j1), j2 = ins.j2 && T.jugadores.find(j => j.id === ins.j2);
  const a = nombreJ(j1, T), b = j2 ? nombreJ(j2, T) : (ins.busca ? '‹Busca pareja›' : '');
  if (!b) return a;
  const ord = T.opc.alfabetico ? [a, b].sort((x, y) => x.localeCompare(y, 'es')) : [a, b];
  return corto ? ord.join(' / ') : ord.join(' / ');
}

// ---------- cuadros ----------
// Tipos del asistente (los 12 de TP).
export const TIPOS_CUADRO = {
  elim: 'Eliminación', rr: 'Round robin', gruposElim: 'Fase de grupos con eliminatoria', gruposRR: 'Fase de grupos con round robin final',
  qualMain: 'Clasificación por eliminación + cuadro principal', rr2: 'Round robin ida y vuelta', monrad: 'Monrad', compass: 'Compass',
  qual: 'Clasificación (qualifying)', rrPlayoff: 'Round robin con playoffs (puestos 1 a 8)', matchplay: 'Matchplay', feed: 'Feed-in continuo'
};
export const CONSOLACIONES = { none: 'Sin consolación', r1: 'Primera ronda', fm: 'Primer partido', feed: 'Feed-in completo', triple: 'Triple Plate', custom: 'Personalizada' };
const log2 = n => Math.round(Math.log2(n));
export function potencia2(n) { let p = 2; while (p < n) p *= 2; return p; }
function nuevoCuadroObj(o) { return { id: id('c'), nombre: '', tipo: 'elim', tam: 8, lineas: [], visible: true, orden: 0, ...o }; }
export function nombreRonda(c, r) {
  if (c.tipo === 'rr') return 'R' + (r + 1);
  if (c.tipo === 'grafo') return 'C' + (r + 1);
  const total = c.rondas || log2(c.tam), quedan = c.tam / Math.pow(2, r);
  if (c.rondas && c.rondas < log2(c.tam)) return 'Q' + (r + 1);
  if (r === total - 1 && quedan === 2) return 'Final';
  if (quedan === 4) return 'Semifinal'; if (quedan === 8) return 'Cuartos'; if (quedan === 16) return 'Octavos';
  return 'R' + quedan;
}
function addEnlace(T, de, a, manual) { T.enlaces.push({ id: id('l'), de, a, manual: !!manual }); }
function mk(T, base, o) { const c = nuevoCuadroObj({ evento: base.evento, etapa: base.etapa, formato: base.formato, orden: T.cuadros.length, ...o }); c.lineas = Array(c.tam).fill(null); T.cuadros.push(c); return c; }
function claveM(c, r, i) { return c.id + ':' + r + ':' + i; }
// Partidos de r-ronda de un cuadro de eliminación: tam / 2^(r+1)
function placementElim(T, base, main, rondaIdx, nombre, cons) {
  // perdedores de la ronda rondaIdx del cuadro main -> nuevo cuadro de eliminación
  const nP = main.tam / Math.pow(2, rondaIdx + 1);
  if (nP < 1) return null;
  if (nP === 1) { return null; }
  const c = mk(T, base, { tam: nP, nombre, cons: !!cons, padre: main.id });
  for (let i = 0; i < nP; i++) addEnlace(T, { t: 'l', k: claveM(main, rondaIdx, i) }, { c: c.id, linea: i });
  return c;
}
function playoffs(T, base, main, op) {
  // 3-4: perdedores de semifinal; 5-8: perdedores de cuartos (+ su 7-8)
  const R = main.rondas || log2(main.tam);
  if (R >= 2 && (op === '34' || op === '3458')) {
    const p = mk(T, base, { tam: 2, nombre: main.nombre + ' · 3.º y 4.º puesto', playoffDe: main.id, puesto: 3 });
    addEnlace(T, { t: 'l', k: claveM(main, R - 2, 0) }, { c: p.id, linea: 0 });
    addEnlace(T, { t: 'l', k: claveM(main, R - 2, 1) }, { c: p.id, linea: 1 });
  }
  if (R >= 3 && op === '3458') {
    const p = mk(T, base, { tam: 4, nombre: main.nombre + ' · 5.º a 8.º puesto', playoffDe: main.id, puesto: 5 });
    for (let i = 0; i < 4; i++) addEnlace(T, { t: 'l', k: claveM(main, R - 3, i) }, { c: p.id, linea: i });
    const q = mk(T, base, { tam: 2, nombre: main.nombre + ' · 7.º y 8.º puesto', playoffDe: main.id, puesto: 7 });
    addEnlace(T, { t: 'l', k: claveM(p, 0, 0) }, { c: q.id, linea: 0 });
    addEnlace(T, { t: 'l', k: claveM(p, 0, 1) }, { c: q.id, linea: 1 });
  }
}
// Monrad/Compass: los perdedores de cada ronda pasan a un cuadro nuevo (recursivo).
function recursivo(T, base, c, nombres, profundidad, maxProf) {
  const R = log2(c.tam);
  for (let r = 0; r < R - 1; r++) {
    if (maxProf != null && profundidad >= maxProf) break;
    const nombre = nombres.shift() || (c.nombre + ' · perdedores R' + (r + 1));
    const h = placementElim(T, base, c, r, nombre, true);
    if (h) recursivo(T, base, h, nombres, profundidad + 1, maxProf);
  }
}
// Feed-in: cuadro tipo grafo donde los perdedores de cada ronda del principal entran por turnos.
function feedIn(T, base, main, ultimaRonda, nombre) {
  const R = main.rondas || log2(main.tam);
  const hasta = Math.min(ultimaRonda == null ? R - 2 : ultimaRonda, R - 2); // como máximo los perdedores de semifinal
  const m = []; // {a, b} con fuente {t:'l', k} o {t:'w', m: indice}
  let actuales = []; // fuentes que siguen vivas en la consolación
  const perd = r => { const n = main.tam / Math.pow(2, r + 1); const out = []; for (let i = 0; i < n; i++) out.push({ t: 'l', k: claveM(main, r, i) }); return out; };
  actuales = perd(0);
  const jugar = () => { const sig = []; for (let i = 0; i + 1 < actuales.length; i += 2) { m.push({ a: actuales[i], b: actuales[i + 1] }); sig.push({ t: 'w', m: m.length - 1 }); } if (actuales.length % 2) sig.push(actuales[actuales.length - 1]); actuales = sig; };
  jugar();
  for (let r = 1; r <= hasta; r++) {
    const nuevos = perd(r).reverse(); // orden inverso: evita repetir el cruce de la ronda anterior
    while (actuales.length > nuevos.length) jugar();
    const sig = [];
    for (let i = 0; i < actuales.length; i++) { m.push({ a: nuevos[i], b: actuales[i] }); sig.push({ t: 'w', m: m.length - 1 }); }
    for (let i = actuales.length; i < nuevos.length; i++) sig.push(nuevos[i]);
    actuales = sig;
  }
  while (actuales.length > 1) jugar();
  const c = nuevoCuadroObj({ evento: base.evento, etapa: base.etapa, formato: base.formato, orden: T.cuadros.length, tipo: 'grafo', tam: m.length, m, nombre, cons: true, padre: main.id });
  c.lineas = [];
  T.cuadros.push(c);
  return c;
}
function triplePlate(T, base, main) {
  const N = main.tam, R = log2(N);
  // Plate: perdedores del primer partido (incluye a quien tuvo bye y pierde en 2.ª ronda)
  const plate = mk(T, base, { tam: N / 2, nombre: main.nombre + ' · Plate', cons: true, padre: main.id });
  for (let i = 0; i < N / 2; i++) addEnlace(T, { t: 'fm', c: main.id, i }, { c: plate.id, linea: i });
  if (R >= 3) {
    const sp = mk(T, base, { tam: N / 4, nombre: main.nombre + ' · Special Plate', cons: true, padre: main.id });
    for (let i = 0; i < N / 4; i++) addEnlace(T, { t: 'l2', c: main.id, i }, { c: sp.id, linea: i });
  }
  if (N >= 8) {
    const cp = mk(T, base, { tam: N / 4, nombre: main.nombre + ' · Consolation Plate', cons: true, padre: plate.id });
    for (let i = 0; i < N / 4; i++) addEnlace(T, { t: 'fm', c: plate.id, i }, { c: cp.id, linea: i });
  }
}
// Crea los cuadros de un tipo del asistente. op: {evento, etapa, tam, nombre, playoff, consolacion, consPlayoff,
//   ultimoFeed, grupos, tamGrupo, letras, pasan, extraPlayoff, mejor2, mejor3, tamPlayoff, qIn, qOut, formato}
export function crearCuadros(T, op) {
  const base = { evento: op.evento, etapa: op.etapa || 'main', formato: op.formato || null };
  const ev = T.eventos.find(e => e.id === op.evento) || {};
  const nombre = op.nombre || ev.nombre || 'Cuadro';
  const antes = T.cuadros.length;
  const elimCon = (c) => {
    if (op.playoff) playoffs(T, base, c, op.playoff);
    const cons = op.consolacion || 'none';
    let cc = null;
    if (cons === 'r1') { cc = mk(T, base, { tam: c.tam / 2, nombre: c.nombre + ' · Consolación', cons: true, padre: c.id }); for (let i = 0; i < c.tam / 2; i++) addEnlace(T, { t: 'l', k: claveM(c, 0, i) }, { c: cc.id, linea: i }); }
    if (cons === 'fm') { cc = mk(T, base, { tam: c.tam / 2, nombre: c.nombre + ' · Consolación', cons: true, padre: c.id }); for (let i = 0; i < c.tam / 2; i++) addEnlace(T, { t: 'fm', c: c.id, i }, { c: cc.id, linea: i }); }
    if (cons === 'custom') cc = mk(T, base, { tam: c.tam / 2, nombre: c.nombre + ' · Consolación', cons: true, padre: c.id });
    if (cons === 'feed') feedIn(T, base, c, op.ultimoFeed == null ? log2(c.tam) - 3 : op.ultimoFeed, c.nombre + ' · Consolación');
    if (cons === 'triple') triplePlate(T, base, c);
    if (cc && op.consPlayoff) playoffs(T, base, cc, op.consPlayoff);
  };
  const grupos = (prefijo) => {
    const G = +op.grupos || 2, S = +op.tamGrupo || 4, out = [];
    for (let g = 0; g < G; g++) out.push(mk(T, base, { tipo: 'rr', tam: S, nombre: (prefijo || 'Grupo') + ' ' + (op.numeros ? g + 1 : String.fromCharCode(65 + g)), grupo: true, idaVuelta: !!op.idaVuelta }));
    return out;
  };
  const t = op.tipo;
  if (t === 'elim') { const c = mk(T, base, { tam: +op.tam || 8, nombre }); elimCon(c); }
  else if (t === 'rr' || t === 'rr2') mk(T, base, { tipo: 'rr', tam: +op.tam || 4, nombre, idaVuelta: t === 'rr2' });
  else if (t === 'gruposElim' || t === 'gruposRR') {
    const gs = grupos(op.prefijo), pasan = +op.pasan || 1, n = gs.length * pasan;
    const etapaPO = op.etapaPlayoff || 'playoff';
    asegurarEtapa(T, op.evento, etapaPO);
    const pb = { ...base, etapa: etapaPO };
    if (t === 'gruposElim') {
      const tam = +op.tamPlayoff || potencia2(n);
      const po = mk(T, pb, { tam, nombre: nombre + ' · Playoff' });
      cruzarGrupos(T, gs, pasan, po);
      if (op.playoff) playoffs(T, pb, po, op.playoff);
    } else {
      const po = mk(T, pb, { tipo: 'rr', tam: n, nombre: nombre + ' · Final' });
      let k = 0; for (let p = 1; p <= pasan; p++) gs.forEach(g => addEnlace(T, { t: 'pos', c: g.id, n: p }, { c: po.id, linea: k++ }));
    }
    if (op.extraPlayoff) { // puestos 2, 3 y 4 de cada grupo en otro cuadro
      const ex = mk(T, pb, { tam: potencia2(gs.length * 3), nombre: nombre + ' · Playoff 2.º a 4.º' });
      let k = 0; [2, 3, 4].forEach(p => gs.forEach(g => { if (k < ex.tam) addEnlace(T, { t: 'pos', c: g.id, n: p }, { c: ex.id, linea: k++ }); }));
    }
    if (op.mejor2) T.enlaces.push({ id: id('l'), de: { t: 'best', cs: gs.map(g => g.id), n: 2 }, a: null, manual: true });
    if (op.mejor3) T.enlaces.push({ id: id('l'), de: { t: 'best', cs: gs.map(g => g.id), n: 3 }, a: null, manual: true });
  }
  else if (t === 'qual') { const qi = +op.qIn || 8, qo = +op.qOut || 2; mk(T, base, { tam: qi, rondas: log2(qi / qo), nombre: op.nombre || 'Clasificación', clasif: qo }); }
  else if (t === 'qualMain') {
    asegurarEtapa(T, op.evento, 'qual');
    const qi = +op.qIn || 32, qo = +op.qOut || 4;
    const q = mk(T, { ...base, etapa: 'qual' }, { tam: qi, rondas: log2(qi / qo), nombre: 'Clasificación', clasif: qo });
    const m = mk(T, base, { tam: +op.tam || 32, nombre, qualDe: q.id });
    elimCon(m);
  }
  else if (t === 'monrad') { const c = mk(T, base, { tam: +op.tam || 8, nombre, monrad: true }); recursivo(T, base, c, [], 0, null); }
  else if (t === 'compass') {
    const c = mk(T, base, { tam: +op.tam || 16, nombre: nombre + ' · Este' });
    const dirs = ['Oeste', 'Norte', 'Noreste', 'Noroeste', 'Sur', 'Sureste', 'Suroeste', 'Sur-sureste', 'Nor-noreste', 'Oeste 2', 'Norte 2', 'Sur 2', 'Este 2', 'Oeste 3', 'Norte 3'].map(d => nombre + ' · ' + d);
    recursivo(T, base, c, dirs, 0, 2); // cada jugador juega al menos 3 partidos
  }
  else if (t === 'feed') { const c = mk(T, base, { tam: +op.tam || 16, nombre }); feedIn(T, base, c, null, nombre + ' · Feed-in (3.er puesto)'); }
  else if (t === 'matchplay') {
    const G = Math.max(1, Math.round((+op.tam || 8) / 4));
    for (let g = 0; g < G; g++) { const c = mk(T, base, { tam: 4, nombre: nombre + ' · Grupo ' + String.fromCharCode(65 + g), grupo: true, matchplay: true }); playoffs(T, base, c, '34'); }
  }
  else if (t === 'rrPlayoff') {
    const gs = [mk(T, base, { tipo: 'rr', tam: 4, nombre: 'Grupo A', grupo: true }), mk(T, base, { tipo: 'rr', tam: 4, nombre: 'Grupo B', grupo: true })];
    asegurarEtapa(T, op.evento, 'playoff');
    for (let p = 1; p <= 4; p++) {
      const c = mk(T, { ...base, etapa: 'playoff' }, { tam: 2, nombre: nombre + ' · ' + (2 * p - 1) + '.º y ' + (2 * p) + '.º puesto', puesto: 2 * p - 1 });
      addEnlace(T, { t: 'pos', c: gs[0].id, n: p }, { c: c.id, linea: 0 });
      addEnlace(T, { t: 'pos', c: gs[1].id, n: p }, { c: c.id, linea: 1 });
    }
  }
  return T.cuadros.slice(antes);
}
export function asegurarEtapa(T, evId, tipo) {
  const ev = T.eventos.find(e => e.id === evId); if (!ev) return;
  if (!ev.etapas.some(s => s.id === tipo)) ev.etapas.push({ id: tipo, tipo });
}
// 1.º A vs 2.º B, 2.º A vs 1.º B… en mitades opuestas (verificado en TP).
function cruzarGrupos(T, gs, pasan, po) {
  const N = po.tam, pos = ordenSiembra(N);
  const lineaDe = s => pos.indexOf(s); // línea de la «semilla» s (1-based)
  const G = gs.length;
  // ganadores de grupo como semillas 1..G; segundos como G+1..2G en orden inverso para cruzarlos
  gs.forEach((g, k) => addEnlace(T, { t: 'pos', c: g.id, n: 1 }, { c: po.id, linea: lineaDe(k + 1) }));
  if (pasan >= 2) gs.forEach((g, k) => {
    // el 2.º del grupo k va contra el 1.º de otro grupo: el rival directo en primera ronda
    const rivalDe1 = lineaDe(((k + 1) % G) + 1) ^ 1;
    addEnlace(T, { t: 'pos', c: g.id, n: 2 }, { c: po.id, linea: rivalDe1 });
  });
  const usadas = new Set(T.enlaces.filter(l => l.a && l.a.c === po.id).map(l => l.a.linea));
  const libres = Array.from({ length: N }, (_, l) => l).filter(l => !usadas.has(l));
  for (let p = 3; p <= pasan; p++) gs.forEach(g => { const l = libres.shift(); if (l != null) addEnlace(T, { t: 'pos', c: g.id, n: p }, { c: po.id, linea: l }); });
}
// Orden de semillas por línea (1-based): seed 1 arriba, 2 abajo, 3-4 en N/4+1 y 3N/4, y desde 5 en el extremo opuesto de cada sección (ITF).
export function ordenSiembra(N) {
  const pos = Array(N).fill(0); // pos[linea] = número de siembra «virtual»
  pos[0] = 1; if (N >= 2) pos[N - 1] = 2;
  if (N >= 4) { pos[N / 4] = 3; pos[3 * N / 4 - 1] = 4; }
  for (let nivel = 3; N / Math.pow(2, nivel - 1) >= 2; nivel++) {
    const S = N / Math.pow(2, nivel - 1);
    let s = Math.pow(2, nivel - 1) + 1;
    for (let a = 0; a < N; a += S) {
      const top = a, bot = a + S - 1;
      if (pos[top] && !pos[bot]) pos[bot] = s++; else if (pos[bot] && !pos[top]) pos[top] = s++;
    }
  }
  return pos;
}
// Líneas de cada nivel de siembra: [[l1],[l2],[l3,l4],[l5..l8],...] para sortear dentro del nivel
function nivelesSiembra(N) {
  const pos = ordenSiembra(N), niveles = [];
  pos.forEach((s, l) => { if (!s) return; const nv = s <= 2 ? s - 1 : Math.ceil(Math.log2(s)); (niveles[nv] = niveles[nv] || []).push(l); });
  return niveles.filter(Boolean);
}
function barajar(a, rnd) { const r = rnd || Math.random; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function siembraNum(ins, etapa) { const s = ins && ins.siembra && ins.siembra[etapa]; if (!s) return 0; return parseInt(String(s), 10) || 0; }
function grupoSep(T, ins, campo) {
  if (!campo || campo === 'none') return null;
  const js = [ins.j1, ins.j2].map(x => T.jugadores.find(j => j.id === x)).filter(Boolean);
  if (campo === 'disponibilidad') return js.map(j => JSON.stringify(j.noDisp || {})).join('|');
  const v = js.map(j => String(j[campo] || '').trim()).filter(Boolean);
  return v.length ? v[0] : null;
}
// Sorteo (Make Draws). Ubica sembrados en sus líneas, byes primero a los sembrados y el resto al azar con separación.
// op: {separacion:'club'|'ciudad'|'pais'|'nivel'|'disponibilidad'|'none', soloPrimera:bool, sepParejas:bool, rnd}
export function sortear(T, cuadroIds, op) {
  op = op || {};
  const cuadros = cuadroIds.map(cid => T.cuadros.find(c => c.id === cid)).filter(Boolean);
  if (!cuadros.length) return { ok: false, msg: 'Elige un cuadro.' };
  const { evento, etapa } = cuadros[0];
  const destinos = new Set(); T.enlaces.forEach(l => { if (l.a && cuadroIds.includes(l.a.c)) destinos.add(l.a.c + ':' + l.a.linea); });
  // inscripciones que entran: activas, en la lista de esta etapa, y que no estén ya en otro cuadro de la misma etapa
  const listaEtapa = etapa === 'qual' ? 'qual' : 'main';
  const ocupadas = new Set(); T.cuadros.forEach(c => { if (c.evento === evento && c.etapa === etapa && !cuadroIds.includes(c.id)) c.lineas.forEach(x => x && x !== 'BYE' && ocupadas.add(x)); });
  let ins = T.inscripciones.filter(i => i.evento === evento && (i.lista || 'main') === listaEtapa && inscripcionActiva(i) && !ocupadas.has(i.id) && (!op.solo || op.solo.includes(i.id)));
  const huecos = []; // líneas libres (sin enlace) de todos los cuadros
  cuadros.forEach(c => { if (c.tipo === 'grafo') return; for (let l = 0; l < c.tam; l++) if (!destinos.has(c.id + ':' + l)) huecos.push([c, l]); });
  // clasificados de la previa: marcadores que se ubican como no sembrados
  const main = cuadros[0];
  const qual = main.qualDe && T.cuadros.find(c => c.id === main.qualDe);
  const nQ = qual ? qual.clasif : 0;
  if (ins.length + nQ > huecos.length) return { ok: false, msg: 'Hay ' + (ins.length + nQ) + ' participantes y solo ' + huecos.length + ' lugares. Aumenta el tamaño del cuadro o pasa inscripciones a reserva.' };
  const rnd = op.rnd || Math.random;
  cuadros.forEach(c => { c.lineas = Array(c.tam).fill(null); });
  borrarResultadosDe(T, cuadroIds);
  T.enlaces = T.enlaces.filter(l => !(l.de.t === 'q' && cuadroIds.includes(l.a && l.a.c)));
  const ordenadas = ins.slice().sort((a, b) => (siembraNum(a, etapa) || 1e9) - (siembraNum(b, etapa) || 1e9));
  const sembradas = ordenadas.filter(i => siembraNum(i, etapa));
  if (cuadros.length === 1 && cuadros[0].tipo === 'elim') {
    const c = cuadros[0], N = c.tam;
    const libres = new Set(); for (let l = 0; l < N; l++) if (!destinos.has(c.id + ':' + l)) libres.add(l);
    const niveles = nivelesSiembra(N);
    // sembrados: por nivel, sorteando dentro del nivel
    let k = 0;
    for (const nv of niveles) {
      const ls = barajar(nv.filter(l => libres.has(l)), rnd);
      const grupo = sembradas.slice(k, k + nv.length);
      // los niveles 1 y 2 (siembra 1 y 2) no se sortean
      grupo.forEach((s, x) => { const l = nv.length === 1 ? nv[0] : ls[x]; if (l != null && libres.has(l)) { c.lineas[l] = s.id; libres.delete(l); } });
      k += nv.length; if (k >= sembradas.length) break;
    }
    // byes: a los rivales de las semillas virtuales en orden (siembra 1, 2, 3…), equilibrados por secciones
    const nByes = libres.size - (ins.length - sembradas.length) - nQ;
    const reales = sembradas.map(s => c.lineas.indexOf(s.id)).filter(l => l >= 0);
    const virt = reales.concat(ordenSiembra(N).map((s, l) => [s, l]).filter(x => x[0]).sort((a, b) => a[0] - b[0]).map(x => x[1]).filter(l => !reales.includes(l)));
    let puestos = 0;
    for (const l of virt) { if (puestos >= nByes) break; const r = l ^ 1; if (libres.has(r) && c.lineas[l] !== 'BYE') { c.lineas[r] = 'BYE'; libres.delete(r); puestos++; } }
    for (const l of [...libres]) { if (puestos >= nByes) break; c.lineas[l] = 'BYE'; libres.delete(l); puestos++; }
    // resto al azar
    const resto = barajar(ordenadas.filter(i => !siembraNum(i, etapa)).map(i => i.id).concat(Array.from({ length: nQ }, (_, q) => 'Q:' + q)), rnd);
    const ls = barajar([...libres], rnd);
    resto.forEach((x, n) => { c.lineas[ls[n]] = x; });
    optimizarSeparacion(T, c, op, new Set(sembradas.map(s => s.id)));
    c.lineas.forEach((x, l) => { if (String(x).startsWith('Q:')) { const q = +x.slice(2); c.lineas[l] = null; T.enlaces.push({ id: id('l'), de: { t: 'q', c: qual.id, i: q }, a: { c: c.id, linea: l } }); } });
  } else {
    // grupos (o varios cuadros): sembrados repartidos en serpiente, uno por grupo; el resto al azar con separación
    const G = cuadros.length, slots = cuadros.map(c => { const s = []; for (let l = 0; l < c.tam; l++) if (!destinos.has(c.id + ':' + l)) s.push(l); return s; });
    const asign = cuadros.map(() => []);
    let g = 0, dir = 1;
    sembradas.forEach(s => { while (asign[g].length >= slots[g].length) g = (g + 1) % G; asign[g].push(s.id); g += dir; if (g === G || g < 0) { dir = -dir; g += dir; } });
    const resto = barajar(ordenadas.filter(i => !siembraNum(i, etapa)).map(i => i.id), rnd);
    for (const x of resto) {
      // grupo con lugar y menos coincidencias de separación; a igualdad, el más vacío
      let best = -1, bc = 1e9;
      for (let k = 0; k < G; k++) {
        if (asign[k].length >= slots[k].length) continue;
        const gx = grupoSep(T, T.inscripciones.find(i => i.id === x), op.separacion);
        const conf = gx == null ? 0 : asign[k].filter(y => grupoSep(T, T.inscripciones.find(i => i.id === y), op.separacion) === gx).length;
        const cost = conf * 100 + asign[k].length;
        if (cost < bc) { bc = cost; best = k; }
      }
      asign[best].push(x);
    }
    cuadros.forEach((c, k) => { asign[k].forEach((x, n) => { c.lineas[slots[k][n]] = x; }); for (let n = asign[k].length; n < slots[k].length; n++) c.lineas[slots[k][n]] = 'BYE'; });
  }
  return { ok: true, avisos: [] };
}
// Separación óptima: intercambia no sembrados para que los del mismo club (u otro campo) se crucen lo más tarde posible.
function optimizarSeparacion(T, c, op, fijos) {
  const campo = op.separacion;
  const parejas = op.sepParejas;
  if ((!campo || campo === 'none') && !parejas) return;
  const N = c.tam, R = log2(N);
  const grupo = l => { const x = c.lineas[l]; if (!x || x === 'BYE' || String(x).startsWith('Q:')) return null; return grupoSep(T, T.inscripciones.find(i => i.id === x), campo); };
  const ronda = (a, b) => { let r = 0; while ((a >> (r + 1)) !== (b >> (r + 1))) r++; return r; }; // ronda en que se cruzarían
  const peso = r => op.soloPrimera ? (r === 0 ? 1 : 0) : Math.pow(2, R - r);
  const costo = () => {
    let s = 0;
    for (let a = 0; a < N; a++) { const ga = grupo(a); if (ga == null) continue; for (let b = a + 1; b < N; b++) if (grupo(b) === ga) s += peso(ronda(a, b)); }
    return s;
  };
  const movibles = []; for (let l = 0; l < N; l++) { const x = c.lineas[l]; if (x && x !== 'BYE' && !fijos.has(x)) movibles.push(l); }
  let cur = costo();
  for (let it = 0; it < 400 && cur > 0; it++) {
    let mejor = null;
    for (let i = 0; i < movibles.length; i++) for (let j = i + 1; j < movibles.length; j++) {
      const a = movibles[i], b = movibles[j];
      [c.lineas[a], c.lineas[b]] = [c.lineas[b], c.lineas[a]];
      const v = costo(); if (v < cur && (!mejor || v < mejor[2])) mejor = [a, b, v];
      [c.lineas[a], c.lineas[b]] = [c.lineas[b], c.lineas[a]];
    }
    if (!mejor) break;
    [c.lineas[mejor[0]], c.lineas[mejor[1]]] = [c.lineas[mejor[1]], c.lineas[mejor[0]]]; cur = mejor[2];
  }
  c.separacionPendiente = cur > 0;
}
export function borrarResultadosDe(T, cuadroIds) {
  Object.keys(T.res).forEach(k => { if (cuadroIds.includes(k.split(':')[0])) delete T.res[k]; });
}
// Borra un cuadro y todo lo que depende de él (enlaces, resultados).
export function borrarCuadro(T, cid) {
  T.cuadros = T.cuadros.filter(c => c.id !== cid);
  T.enlaces = T.enlaces.filter(l => !(l.a && l.a.c === cid) && l.de.c !== cid && !(l.de.k && l.de.k.split(':')[0] === cid) && !(l.de.cs && l.de.cs.includes(cid)));
  borrarResultadosDe(T, [cid]);
  delete T.ajustes[cid];
}

// ---------- round robin ----------
// Método del círculo: rondas óptimas (n-1 para n par, n para n impar).
export function rondasRR(n) {
  const L = Array.from({ length: n % 2 ? n + 1 : n }, (_, i) => i), m = L.length, out = [];
  for (let r = 0; r < m - 1; r++) {
    const ronda = [];
    for (let i = 0; i < m / 2; i++) { const a = L[i], b = L[m - 1 - i]; if (a < n && b < n) ronda.push(r % 2 && i === 0 ? [b, a] : [a, b]); }
    out.push(ronda);
    L.splice(1, 0, L.pop());
  }
  return out;
}
function statsVacio() { return { pj: 0, pg: 0, pe: 0, pp: 0, pts: 0, sf: 0, sc: 0, gf: 0, gc: 0, ret: false }; }
// Tabla de un grupo con los criterios de desempate ordenables de TP.
export function tablaRR(T, c, partidos) {
  const cfg = T.rr, lineas = c.lineasEf || c.lineas;
  const ids = lineas.filter(x => x && x !== 'BYE');
  const retirados = new Set(); partidos.forEach(p => { if (p.est === 'ret' || p.est === 'dis') retirados.add(p.g === 'a' ? p.b : p.a); });
  const noret = cfg.criterios.some(x => x.k === 'noret' && x.on);
  const validos = partidos.filter(p => p.decidido && p.est !== 'np' && !(noret && (retirados.has(p.a) || retirados.has(p.b))));
  const calc = (subset, lista) => {
    const S = {}; subset.forEach(x => { S[x] = statsVacio(); });
    lista.forEach(p => {
      if (!S[p.a] || !S[p.b]) return;
      const A = S[p.a], B = S[p.b]; A.pj++; B.pj++;
      const wo = p.est === 'wo' || p.est === 'wom';
      (p.sets || []).forEach(([x, y]) => { if (x > y) { A.sf++; B.sc++; } else if (y > x) { B.sf++; A.sc++; } A.gf += x; A.gc += y; B.gf += y; B.gc += x; });
      const pun = (gan, per) => {
        if (cfg.modo === 'set') { (p.sets || []).forEach(([x, y]) => { const d = Math.abs(x - y), w = x > y ? A : B, l = x > y ? B : A; w.pts += +(cfg.ps[Math.min(d, 3) - 1] || 0); l.pts += +(cfg.ps[4] || 0); }); return; }
        if (cfg.modo === 'game') { A.pts += (p.sets || []).reduce((s, v) => s + v[0], 0); B.pts += (p.sets || []).reduce((s, v) => s + v[1], 0); return; }
        const pg = cfg.modo === 'itf' ? 1 : +cfg.pg, pp = cfg.modo === 'itf' ? 0 : +cfg.pp;
        gan.pts += pg; per.pts += (wo && cfg.sinPuntosWO) ? 0 : pp;
      };
      if (p.g === 't') { A.pe++; B.pe++; A.pts += cfg.modo === 'itf' ? 0 : +cfg.pe; B.pts += cfg.modo === 'itf' ? 0 : +cfg.pe; }
      else if (p.g === 'a') { A.pg++; B.pp++; pun(A, B); }
      else if (p.g === 'b') { B.pg++; A.pp++; pun(B, A); }
    });
    return S;
  };
  const global = calc(ids, validos);
  const ratio = (a, b) => (a + b) ? a / (a + b) : 0;
  const claves = (T.rr.modo === 'itf' ? ['mp', 'h2h', 'sp', 'gp'] : cfg.criterios.filter(x => x.on && x.k !== 'noret').map(x => x.k));
  const valor = (k, x, sub) => {
    const g = global[x], r = sub && sub[x];
    switch (k) {
      case 'mp': return g.pts; case 'rmp': return r.pts; case 'rsd': return r.sf - r.sc; case 'rgd': return r.gf - r.gc;
      case 'sd': return g.sf - g.sc; case 'gd': return g.gf - g.gc; case 'gf': return g.gf;
      case 'sp': return ratio(g.sf, g.sc); case 'gp': return ratio(g.gf, g.gc); case 'rsp': return ratio(r.sf, r.sc); case 'rgp': return ratio(r.gf, r.gc);
      case 'h2h': return r.pg; default: return 0;
    }
  };
  const ordenar = (lista, ci) => {
    if (lista.length <= 1 || ci >= claves.length) return [lista];
    const k = claves[ci];
    if (k === 'h2h' && lista.length !== 2) return ordenar(lista, ci + 1);
    const sub = calc(lista, validos.filter(p => lista.includes(p.a) && lista.includes(p.b)));
    const grupos = {};
    lista.forEach(x => { const v = valor(k, x, sub); (grupos[v] = grupos[v] || []).push(x); });
    const vals = Object.keys(grupos).map(Number).sort((a, b) => b - a);
    if (vals.length === 1) return ordenar(lista, ci + 1);
    return vals.flatMap(v => ordenar(grupos[v], ci + 1)); // cada empate se vuelve a desempatar dentro de su subgrupo
  };
  let orden = ordenar(ids, 0); // lista de bloques empatados
  const empate = orden.some(b => b.length > 1);
  let plano = orden.flat();
  const aj = T.ajustes[c.id];
  if (aj && aj.length === plano.length && aj.every(x => plano.includes(x))) plano = aj.slice();
  return { filas: plano.map((x, n) => ({ id: x, pos: n + 1, ...global[x], manual: !!aj })), empate: empate && !aj, completo: partidos.every(p => p.decidido) };
}

// ---------- resolución de todo el torneo ----------
// Devuelve { cuadros: {cid: {lineas, partidos:[...], tabla?, ganador}}, partidos: [...] } sin modificar T.
export function resolver(T) {
  const est = {}; const porClave = {};
  const enlacesA = {}; T.enlaces.forEach(l => { if (l.a) (enlacesA[l.a.c] = enlacesA[l.a.c] || {})[l.a.linea] = l; });
  const fuente = (src) => {
    // devuelve entryId, 'BYE' o null (pendiente)
    if (src.t === 'w' || src.t === 'l') { const p = porClave[src.k]; if (!p) return null; if (!p.decidido) return null; return src.t === 'w' ? p.ganador : p.perdedor; }
    if (src.t === 'pos') { const e = est[src.c]; if (!e || !e.tabla || !e.tabla.completo || e.tabla.empate) return null; const f = e.tabla.filas[src.n - 1]; return f ? f.id : 'BYE'; }
    if (src.t === 'q') { const c = T.cuadros.find(x => x.id === src.c); if (!c) return null; const R = c.rondas || log2(c.tam); const p = porClave[claveM(c, R - 1, src.i)]; return p && p.decidido ? p.ganador : null; }
    if (src.t === 'fm' || src.t === 'l2') {
      const c = T.cuadros.find(x => x.id === src.c); if (!c) return null;
      if (src.t === 'fm') {
        const p0 = porClave[claveM(c, 0, src.i)]; if (!p0 || !p0.decidido) return null;
        if (!p0.bye) return p0.perdedor;
        if (p0.ganador === 'BYE') return 'BYE';
        const p1 = porClave[claveM(c, 1, src.i >> 1)]; if (!p1 || !p1.decidido) return null; // tuvo bye: su primer partido es el de 2.ª ronda
        return p1.perdedor === p0.ganador ? p0.ganador : 'BYE';
      }
      // l2: perdedores de su segundo partido en el principal (Special Plate): perdedor de 2.ª ronda que había ganado en 1.ª
      const p1 = porClave[claveM(c, 1, src.i)]; if (!p1 || !p1.decidido) return null;
      const vieneDeBye = [0, 1].some(k => { const p0 = porClave[claveM(c, 0, 2 * src.i + k)]; return p0 && p0.bye && p0.ganador === p1.perdedor; });
      return vieneDeBye ? 'BYE' : p1.perdedor;
    }
    return null;
  };
  const cuadros = T.cuadros.slice();
  for (let iter = 0; iter < cuadros.length + 3; iter++) {
    let cambio = false;
    for (const c of cuadros) {
      const lineas = (c.tipo === 'grafo') ? [] : c.lineas.map((x, l) => {
        if (x) return x;
        const lk = enlacesA[c.id] && enlacesA[c.id][l];
        if (!lk) return enlacesA[c.id] ? 'BYE' : null; // cuadro alimentado por enlaces: línea sin enlace = bye
        if (lk.forward) return lk.forward; // enlace manual ya adelantado
        if (lk.manual) return null;
        return fuente(lk.de);
      });
      const firma = JSON.stringify(lineas) + (c.tipo === 'grafo' ? iter : '');
      const prev = est[c.id];
      if (prev && prev.firma === firma && c.tipo !== 'grafo') continue;
      const e = { firma, lineas, partidos: [] };
      if (c.tipo === 'rr') {
        const n = c.tam, rondas = rondasRR(n);
        const legs = c.idaVuelta ? 2 : 1;
        for (let leg = 0; leg < legs; leg++) rondas.forEach((ron, r) => ron.forEach(([i, j]) => {
          const lo = Math.min(i, j), hi = Math.max(i, j), [x, y] = leg ? [hi, lo] : [lo, hi]; // clave estable: ida lo:hi, vuelta hi:lo
          const k = c.id + ':g:' + x + ':' + y;
          const a = lineas[x], b = lineas[y];
          if (a === 'BYE' || b === 'BYE') return;
          const p = partidoBase(T, c, k, r + leg * rondas.length, a, b);
          e.partidos.push(p);
        }));
        c.lineasEf = lineas;
        e.tabla = tablaRR(T, c, e.partidos);
      } else if (c.tipo === 'grafo') {
        const ganM = [];
        c.m.forEach((m, idx) => {
          const val = s => s.t === 'w' ? (ganM[s.m] === undefined ? null : ganM[s.m]) : fuente(s);
          const a = val(m.a), b = val(m.b);
          const p = partidoElim(T, c, c.id + ':m:' + idx, ronGrafo(c, idx), idx, a, b);
          ganM[idx] = p.decidido ? p.ganador : null;
          e.partidos.push(p);
        });
        const ult = e.partidos[e.partidos.length - 1]; e.ganador = ult && ult.decidido ? ult.ganador : null;
      } else {
        const R = c.rondas || log2(c.tam);
        let prevGan = null;
        for (let r = 0; r < R; r++) {
          const n = c.tam / Math.pow(2, r + 1), gan = [];
          for (let i = 0; i < n; i++) {
            const a = r === 0 ? lineas[2 * i] : prevGan[2 * i], b = r === 0 ? lineas[2 * i + 1] : prevGan[2 * i + 1];
            const p = partidoElim(T, c, claveM(c, r, i), r, i, a, b);
            gan.push(p.decidido ? p.ganador : null);
            e.partidos.push(p);
          }
          prevGan = gan;
        }
        e.ganador = R === log2(c.tam) ? prevGan[0] : null;
        e.clasificados = R < log2(c.tam) ? prevGan : null;
      }
      e.partidos.forEach(p => { porClave[p.k] = p; });
      est[c.id] = e; cambio = true;
    }
    if (!cambio) break;
  }
  const partidos = [];
  T.cuadros.forEach(c => { const e = est[c.id]; if (e) e.partidos.forEach(p => { if (!p.bye) partidos.push(p); }); });
  return { cuadros: est, partidos, porClave };
}
export function numRondas(c) { if (c.tipo === 'rr') return rondasRR(c.tam).length * (c.idaVuelta ? 2 : 1); if (c.tipo === 'grafo') return c.m.reduce((mx, _, i) => Math.max(mx, ronGrafo(c, i) + 1), 0); return c.rondas || log2(c.tam); }
function ronGrafo(c, idx) { // ronda aproximada de un partido del grafo (para el orden de programación)
  let r = 0; const memo = {};
  const prof = i => { if (memo[i] != null) return memo[i]; const m = c.m[i]; const d = s => s.t === 'w' ? prof(s.m) + 1 : 0; return (memo[i] = Math.max(d(m.a), d(m.b))); };
  r = prof(idx); return r;
}
function partidoBase(T, c, k, r, a, b) {
  let R = T.res[k] || {};
  const obsoleto = !!(R.ab && (R.g || R.est) && (R.ab[0] !== a || R.ab[1] !== b));
  if (obsoleto) R = { ...R, s: null, est: null, g: null }; // el resultado era de otros participantes: no cuenta
  const p = { k, c: c.id, r, a, b, obsoleto, sets: R.s || [], est: R.est || '', g: R.g || null, fecha: R.fecha || null, hora: R.hora || null, cancha: R.cancha || null, num: R.num || null, enCancha: R.enCancha || null, dur: R.dur || null, juez: R.juez || null, nota: R.nota || '', ck: R.ck || {}, av: R.av || {}, destacado: !!R.destacado };
  p.listo = !!(a && b);
  p.decidido = p.listo && !!(p.g || p.est === 'np');
  if (p.decidido && p.g !== 't' && p.g) { p.ganador = p.g === 'a' ? a : b; p.perdedor = p.g === 'a' ? b : a; }
  if (p.est === 'np') { p.ganador = 'BYE'; p.perdedor = 'BYE'; }
  return p;
}
function partidoElim(T, c, k, r, i, a, b) {
  const p = partidoBase(T, c, k, r, a, b);
  p.i = i;
  if (a === 'BYE' || b === 'BYE') {
    p.bye = true; p.listo = false;
    if (a === 'BYE' && b === 'BYE') { p.decidido = true; p.ganador = 'BYE'; p.perdedor = 'BYE'; }
    else if (a && b) { p.decidido = true; p.ganador = a === 'BYE' ? b : a; p.perdedor = 'BYE'; }
    else p.decidido = false;
  }
  if (p.g === 't') { p.decidido = false; } // en eliminación no hay empate
  return p;
}
// Posibles jugadores de un partido aún sin definir (para validar programación y descanso).
export function posibles(T, porClave, p) {
  const out = new Set();
  const add = x => { if (x && x !== 'BYE') out.add(x); };
  add(p.a); add(p.b);
  if (p.a && p.b) return out;
  const c = T.cuadros.find(x => x.id === p.c);
  if (c && c.tipo === 'elim' && p.r > 0) {
    const sides = [];
    if (!p.a) sides.push(porClave[claveM(c, p.r - 1, 2 * p.i)]);
    if (!p.b) sides.push(porClave[claveM(c, p.r - 1, 2 * p.i + 1)]);
    sides.forEach(q => q && posibles(T, porClave, q).forEach(add));
  }
  return out;
}
export function jugadoresIns(T, insId) { const i = T.inscripciones.find(x => x.id === insId); return i ? [i.j1, i.j2].filter(Boolean) : []; }
// Partidos de los que depende p (sus «alimentadores» dentro del mismo cuadro, y enlaces).
export function previos(T, porClave, p) {
  const c = T.cuadros.find(x => x.id === p.c), out = [];
  if (c && c.tipo === 'elim' && p.r > 0) { const a = porClave[claveM(c, p.r - 1, 2 * p.i)], b = porClave[claveM(c, p.r - 1, 2 * p.i + 1)]; [a, b].forEach(q => q && (q.bye ? previos(T, porClave, q).forEach(z => out.push(z)) : out.push(q))); }
  if (c && c.tipo === 'grafo') { const m = c.m[p.i]; [m.a, m.b].forEach(s => { if (s.t === 'w') out.push(porClave[c.id + ':m:' + s.m]); if (s.t === 'l' && porClave[s.k]) out.push(porClave[s.k]); }); }
  if (c && c.tipo !== 'grafo') {
    const lin = p.r === 0 && c.tipo === 'elim' ? [2 * p.i, 2 * p.i + 1] : [];
    lin.forEach(l => {
      const lk = T.enlaces.find(e => e.a && e.a.c === c.id && e.a.linea === l); if (!lk) return;
      if (lk.de.k && porClave[lk.de.k]) out.push(porClave[lk.de.k]);
      if (lk.de.t === 'pos') Object.values(porClave).forEach(q => { if (q.c === lk.de.c && !q.bye) out.push(q); });
    });
  }
  return out.filter(Boolean);
}

// ---------- programación ----------
// Capacidad: canchas libres por (día, hora).
export function canchasDisponibles(T, dia, hora, sedeId) {
  const out = [];
  T.sedes.forEach(s => { if (sedeId && s.id !== sedeId) return; s.canchas.forEach(c => { const b = T.bloqueos[c.id] && T.bloqueos[c.id][dia]; if (!(b && b.includes(hora))) out.push({ sede: s.id, cancha: c.id, nombre: c.nombre }); }); });
  return out;
}
function noDisponible(T, jid, dia, hora) { const j = T.jugadores.find(x => x.id === jid); const b = j && j.noDisp && j.noDisp[dia]; return !!(b && b.includes(hora)); }
function eventoNoDisp(T, evId, dia, hora) { const e = T.eventos.find(x => x.id === evId); const b = e && e.noDisp && e.noDisp[dia]; return !!(b && b.includes(hora)); }
export function ocupacion(T, R, dia) {
  const occ = {}; (R || resolver(T)).partidos.forEach(p => { if (p.fecha === dia && p.hora) { occ[p.hora] = occ[p.hora] || []; occ[p.hora].push(p); } });
  return occ;
}
// Restricciones de un horario para un partido. Devuelve [] si cabe o la lista de motivos (como los colores de TP).
export function motivos(T, R, p, dia, hora, op) {
  op = op || {};
  const out = [], rest = +(op.descanso != null ? op.descanso : T.prog.descanso) || 0;
  const c = T.cuadros.find(x => x.id === p.c);
  const disp = canchasDisponibles(T, dia, hora, op.sede);
  const usados = R.partidos.filter(q => q.k !== p.k && q.fecha === dia && q.hora === hora);
  if (!disp.length) out.push('sin-canchas');
  else if (usados.length >= disp.length) out.push('canchas-llenas');
  if (op.maxFranja && usados.filter(q => q.c === p.c || (T.cuadros.find(x => x.id === q.c) || {}).evento === (c && c.evento)).length >= op.maxFranja) out.push('max-franja');
  const pos = posibles(T, R.porClave, p);
  const jug = new Set(); pos.forEach(e => jugadoresIns(T, e).forEach(j => jug.add(j)));
  const t = minutos(hora);
  jug.forEach(j => { if (noDisponible(T, j, dia, hora)) out.push('no-disponible'); });
  if (c && eventoNoDisp(T, c.evento, dia, hora)) out.push('categoria-no-juega');
  // previos del cuadro: deben empezar antes, con descanso
  previos(T, R.porClave, p).forEach(q => { if (q.decidido) return; if (!q.fecha || !q.hora) out.push('previo-sin-programar'); else if (q.fecha > dia || (q.fecha === dia && minutos(q.hora) + rest > t)) out.push('antes-que-previo'); });
  // descanso y máximos de cada jugador (contando partidos posibles)
  const ev = c && T.eventos.find(e => e.id === c.evento);
  jug.forEach(j => {
    const suyos = R.partidos.filter(q => q.k !== p.k && q.fecha === dia && q.hora && [...posibles(T, R.porClave, q)].some(e => jugadoresIns(T, e).includes(j)));
    if (suyos.some(q => Math.abs(minutos(q.hora) - t) < Math.max(rest, 1))) out.push('descanso');
    if (suyos.length + 1 > (+T.prog.maxDia || 99)) out.push('max-dia');
    const mismoEv = suyos.filter(q => (T.cuadros.find(x => x.id === q.c) || {}).evento === (c && c.evento));
    if (mismoEv.length + 1 > (+T.prog.maxEvento || 99)) out.push('max-evento');
    if (ev && ev.tipo === 'S') { const ind = suyos.filter(q => { const e2 = T.eventos.find(e => e.id === (T.cuadros.find(x => x.id === q.c) || {}).evento); return e2 && e2.tipo === 'S'; }); if (ind.length + 1 > (+T.prog.maxInd || 99)) out.push('max-individuales'); }
  });
  return [...new Set(out)];
}
// Asigna la primera cancha libre de esa franja.
export function canchaLibre(T, R, p, dia, hora, sede) {
  const usadas = new Set(R.partidos.filter(q => q.k !== p.k && q.fecha === dia && q.hora === hora).map(q => q.cancha));
  const d = canchasDisponibles(T, dia, hora, sede).find(x => !usadas.has(x.cancha));
  return d ? d.cancha : null;
}
export function setRes(T, k, campos) { T.res[k] = { ...(T.res[k] || {}), ...campos }; Object.keys(T.res[k]).forEach(x => { if (T.res[k][x] == null || T.res[k][x] === '') delete T.res[k][x]; }); if (!Object.keys(T.res[k]).length) delete T.res[k]; }
// Programación automática (Schedule Tournament). op: {cuadros:[ids], alcance:'primeros'|'conocidos'|'todos', desdeDia, desdeHora, descanso, descansoRR, adelantarByes, autoCancha}
export function programarAuto(T, op) {
  let R = resolver(T);
  const elegidos = new Set(op.cuadros || T.cuadros.map(c => c.id));
  const dias = T.dias.filter(d => d >= (op.desdeDia || T.dias[0]));
  let pend = R.partidos.filter(p => elegidos.has(p.c) && !p.fecha && !p.decidido);
  if (op.alcance === 'conocidos') pend = pend.filter(p => p.a && p.b && p.a !== 'BYE' && p.b !== 'BYE');
  if (op.alcance === 'primeros') pend = pend.filter(p => p.r === 0 || previos(T, R.porClave, p).every(q => q.bye || q.decidido));
  // orden: por ronda, luego cuadros más grandes primero (como «Urgent Matches»)
  pend.sort((a, b) => a.r - b.r || (T.cuadros.find(c => c.id === b.c).tam - T.cuadros.find(c => c.id === a.c).tam) || a.k.localeCompare(b.k));
  let hechos = 0; const sinLugar = [];
  for (const p0 of pend) {
    R = resolver(T); const p = R.porClave[p0.k]; if (!p || p.fecha) continue;
    const c = T.cuadros.find(x => x.id === p.c);
    const descanso = c.tipo === 'rr' && op.descansoRR != null ? op.descansoRR : op.descanso;
    let puesto = false;
    for (const d of dias) {
      for (const h of (T.franjas[d] || [])) {
        if (d === op.desdeDia && op.desdeHora && minutos(h) < minutos(op.desdeHora)) continue;
        const m = motivos(T, R, p, d, h, { descanso });
        if (m.length) continue;
        setRes(T, p.k, { fecha: d, hora: h, cancha: op.autoCancha === false ? null : canchaLibre(T, R, p, d, h) });
        hechos++; puesto = true; break;
      }
      if (puesto) break;
    }
    if (!puesto) sinLugar.push(p.k);
  }
  return { programados: hechos, sinLugar };
}
// Validar programación de un día (Validate Schedule).
export function validarDia(T, dia, par) {
  par = { descanso: 60, finTarde: '19:00', inicioTemprano: '10:00', maxDia: 2, maxEvento: 1, maxInd: 1, ...(par || {}) };
  const R = resolver(T), out = { descanso: [], maxDia: [], maxInd: [], maxEvento: [], indTrasDobles: [], tardeTemprano: [], noDisponible: [], varias: [] };
  const porJug = {};
  R.partidos.filter(p => p.fecha === dia && p.hora).forEach(p => {
    posibles(T, R.porClave, p).forEach(e => jugadoresIns(T, e).forEach(j => { (porJug[j] = porJug[j] || []).push(p); }));
  });
  const ayer = T.dias[T.dias.indexOf(dia) - 1];
  Object.entries(porJug).forEach(([j, ps]) => {
    ps.sort((a, b) => minutos(a.hora) - minutos(b.hora));
    for (let i = 1; i < ps.length; i++) if (minutos(ps[i].hora) - minutos(ps[i - 1].hora) < par.descanso) out.descanso.push({ j, p: ps[i] });
    if (ps.length > par.maxDia) out.maxDia.push({ j, n: ps.length });
    const evOf = p => T.eventos.find(e => e.id === (T.cuadros.find(c => c.id === p.c) || {}).evento) || {};
    const ind = ps.filter(p => evOf(p).tipo === 'S'); if (ind.length > par.maxInd) out.maxInd.push({ j, n: ind.length });
    const porEv = {}; ps.forEach(p => { const e = evOf(p).id; porEv[e] = (porEv[e] || 0) + 1; }); Object.entries(porEv).forEach(([e, n]) => { if (n > par.maxEvento) out.maxEvento.push({ j, e, n }); });
    for (let i = 1; i < ps.length; i++) if (evOf(ps[i]).tipo === 'S' && evOf(ps[i - 1]).tipo === 'D') out.indTrasDobles.push({ j, p: ps[i] });
    ps.forEach(p => { if (noDisponible(T, j, dia, p.hora)) out.noDisponible.push({ j, p }); });
    const sedes = new Set(ps.map(p => (T.sedes.find(s => s.canchas.some(c => c.id === p.cancha)) || {}).id).filter(Boolean)); if (sedes.size > 1) out.varias.push({ j });
    if (ayer && ps.length && minutos(ps[0].hora) < minutos(par.inicioTemprano)) {
      const prev = R.partidos.filter(q => q.fecha === ayer && q.hora && [...posibles(T, R.porClave, q)].some(e => jugadoresIns(T, e).includes(j)));
      if (prev.some(q => minutos(q.hora) >= minutos(par.finTarde))) out.tardeTemprano.push({ j, p: ps[0] });
    }
  });
  return out;
}
// Partidos urgentes: pendientes con jugadores definidos, priorizando a quien tiene más partidos por jugar.
export function urgentes(T) {
  const R = resolver(T);
  const pend = R.partidos.filter(p => !p.decidido && p.listo);
  const carga = {}; pend.forEach(p => [p.a, p.b].forEach(e => jugadoresIns(T, e).forEach(j => { carga[j] = (carga[j] || 0) + 1; })));
  return pend.filter(p => !p.fecha).map(p => ({ p, prioridad: [p.a, p.b].flatMap(e => jugadoresIns(T, e)).reduce((s, j) => s + (carga[j] || 0) * 4, 0) })).sort((a, b) => b.prioridad - a.prioridad);
}
export function numerarPartidos(T, dia, desde, sede) {
  const R = resolver(T); let n = +desde || 1;
  R.partidos.filter(p => p.fecha === dia && p.hora && (!sede || (T.sedes.find(s => s.canchas.some(c => c.id === p.cancha)) || {}).id === sede)).sort((a, b) => minutos(a.hora) - minutos(b.hora) || String(a.cancha).localeCompare(String(b.cancha))).forEach(p => setRes(T, p.k, { num: n++ }));
}

// ---------- resultados ----------
// Guarda un resultado validado. sets: [[a,b],...]; est: ''|wo|wom|ret|dis|np; g: 'a'|'b'|'t' (forzado)
export function guardarResultado(T, k, { sets, est, g, dur, juez, cancha }) {
  const R = resolver(T), p = R.porClave[k];
  if (!p) return { ok: false, msg: 'Partido no encontrado.' };
  if (!p.listo) return { ok: false, msg: 'Faltan los participantes de este partido.' };
  const c = T.cuadros.find(x => x.id === p.c), f = formatoDe(T, c);
  sets = (sets || []).filter(s => Number.isInteger(s[0]) && Number.isInteger(s[1]));
  let gan = g || null;
  if (!est) {
    const ev = evaluarMarcador(f, sets);
    if (!ev.ok) return ev;
    if (!ev.completo && g !== 't') return { ok: false, msg: 'El marcador no tiene un ganador. Completa los sets o elige un estado (W.O., retiro…).' };
    if (g === 't' && c.tipo !== 'rr') return { ok: false, msg: 'Solo los partidos de grupo admiten empate.' };
    gan = g === 't' ? 't' : ev.g;
  } else if (est !== 'np' && !gan) return { ok: false, msg: 'Indica quién gana el partido.' };
  // ab guarda quiénes jugaron: si un cambio anterior altera los participantes, el resultado queda «obsoleto» y no cuenta.
  setRes(T, k, { s: sets.length ? sets : null, est: est || null, g: est === 'np' ? null : gan, ab: [p.a, p.b], dur: dur || null, juez: juez || null, cancha: cancha || (T.res[k] || {}).cancha, enCancha: null, fin: Date.now() });
  const obsoletos = resolver(T).partidos.filter(q => q.obsoleto).map(q => q.k);
  return { ok: true, obsoletos };
}

// ---------- publicación ----------
// Proyección pública sin cédulas, códigos de socio, contactos, pagos ni notas. Los menores se marcan (m: true):
// la API solo entrega sus nombres a socios con sesión iniciada.
export function publico(T) {
  const R = resolver(T);
  const jug = {}; T.jugadores.forEach(j => { jug[j.id] = { n: nombreJ(j, T), club: j.club || '', m: esMenor(j, T) || undefined, inv: j.invitado || undefined }; });
  const ins = {}; T.inscripciones.forEach(i => { ins[i.id] = { j: [i.j1, i.j2].filter(Boolean), s: i.siembra || {} }; });
  const cuadros = T.cuadros.filter(c => c.visible !== false).map(c => {
    const e = R.cuadros[c.id] || {};
    return { id: c.id, n: c.nombre, ev: c.evento, et: c.etapa, t: c.tipo, tam: c.tam, rondas: c.rondas, ida: c.idaVuelta || undefined, l: e.lineas, tabla: e.tabla ? e.tabla.filas.map(f => ({ id: f.id, pos: f.pos, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, pts: f.pts, sf: f.sf, sc: f.sc, gf: f.gf, gc: f.gc })) : undefined, ganador: e.ganador || undefined };
  });
  const vis = new Set(cuadros.map(c => c.id));
  const canchaN = {}; T.sedes.forEach(s => s.canchas.forEach(c => { canchaN[c.id] = c.nombre; }));
  const partidos = R.partidos.filter(p => vis.has(p.c)).map(p => ({ k: p.k, c: p.c, r: p.r, a: p.a, b: p.b, s: p.sets.length ? p.sets : undefined, est: p.est || undefined, g: p.g || undefined, f: p.fecha || undefined, h: p.hora || undefined, ch: p.cancha ? canchaN[p.cancha] : undefined, num: p.num || undefined, vivo: p.enCancha ? true : undefined }));
  return {
    v: 1, info: { nombre: T.info.nombre, grupo: T.info.grupo, deporte: T.info.deporte, desde: T.info.desde, hasta: T.info.hasta, sede: T.info.sede, arbitro: T.info.arbitro || undefined },
    eventos: T.eventos.map(e => ({ id: e.id, n: e.nombre, g: e.genero, t: e.tipo })), jugadores: jug, inscripciones: ins, cuadros, partidos,
    rondas: Object.fromEntries(T.cuadros.map(c => [c.id, Array.from({ length: numRondas(c) }, (_, r) => nombreRonda(c, r))]))
  };
}
// Personas (código de socio + cédula) de una lista de inscripciones: para avisos.
export function personasDe(T, insIds) {
  const set = new Set(); (insIds || []).forEach(x => jugadoresIns(T, x).forEach(j => set.add(j)));
  return [...set].map(jid => T.jugadores.find(j => j.id === jid)).filter(Boolean).map(j => ({ socio: j.socio || '', cedula: j.cedula || '' }));
}
