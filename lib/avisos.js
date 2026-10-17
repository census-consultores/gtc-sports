// GTC Sports — avisos automáticos (push + correo) para las funciones de Vercel.
// Push: Edge Function `emitir-push` de Supabase (APNs + FCM). Correo: Resend (notificaciones@gtcsports.ec).
// Destinatarios de un equipo: sus jugadores (código de socio) -> teléfonos con la app (gtc_push_tokens)
// y cuentas con correo y consentimiento (cuentas, por cédula). Nada de esto es legible desde el cliente.
// Cada aviso se registra en gtc_avisos_log con una clave única: el mismo aviso nunca sale dos veces.
import { Resend } from 'resend';
import { plantilla } from './correo.js';
import { evento, googleUrl, icsUrl } from './cal.js';

const URL = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
const FROM = 'GTC Sports <notificaciones@gtcsports.ec>';
const REPLY = ['deportes@guayaquiltenisclub.ec'];

export const DISC = { futbol: 'Fútbol', tenis: 'Tenis', natacion: 'Natación', carrera: 'Carrera', pingpong: 'Ping Pong', beachtenis: 'Beach Tenis', padel: 'Pádel', beachvolley: 'Beach Volley', cuarenta: 'Cuarenta', basquet: 'Baloncesto', pickleball: 'Pickleball' };
export const CATN = { I1: 'Infantil 1', I2: 'Infantil 2', I3: 'Infantil 3', I4: 'Infantil 4', J1: 'Juvenil 1', J2: 'Juvenil 2', J3: 'Juvenil 3', SEN: 'Senior', MAS: 'Máster', DAM: 'Damas' };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

async function sb(path, opts = {}) {
  const r = await fetch(URL + '/rest/v1/' + path, {
    ...opts,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=representation', ...(opts.headers || {}) }
  });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
  if (!r.ok) throw { status: r.status, data: d };
  return d;
}
const enc = encodeURIComponent;

// Fecha de hoy en Guayaquil (UTC-5, sin horario de verano)
export function hoyGye() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
export function fechaTxt(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))) return String(f || '');
  const d = new Date(f + 'T12:00:00Z');
  return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];
}
export function titulo(s) { return String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()); }
// Código de socio para avisos: sin ceros a la izquierda ni sufijo -01/-02 (los avisos de un hijo llegan también al titular)
function socioBase(x) { return String(x == null ? '' : x).split('-')[0].replace(/\D/g, '').replace(/^0+/, ''); }
function cedNorm(c) { c = String(c || '').replace(/\D/g, ''); if (c.length === 9) c = '0' + c; return c; }

// ---------- destinatarios ----------
// equipos: lista de ids, o null = todos los socios (todos los teléfonos y todas las cuentas con consentimiento)
export async function destinatarios(equipos) {
  if (equipos === null) {
    const cu = await sb('cuentas?select=correo&consent=is.true&correo=not.is.null&limit=5000');
    const correos = [...new Set((cu || []).map(c => String(c.correo || '').trim().toLowerCase()).filter(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)))];
    return { todos: true, sessKeys: [], correos };
  }
  const ids = [...new Set((equipos || []).filter(Boolean).map(String))];
  if (!ids.length) return { todos: false, sessKeys: [], correos: [] };
  const jug = await sb('jugadores?select=socio,ced_real,activo&equipo_id=in.(' + ids.map(enc).join(',') + ')&limit=5000');
  const socios = new Set(), ceds = new Set();
  (jug || []).forEach(j => {
    if (j.activo === false) return;
    const s = socioBase(j.socio); if (s && s.length >= 3 && s.length <= 6) socios.add(s);
    const c = cedNorm(j.ced_real); if (c.length >= 10) ceds.add(c);
  });
  // cuentas de esos jugadores (por cédula): correo con consentimiento y su correo/código para casar teléfonos
  const cu = ceds.size ? await sb('cuentas?select=cedula,socio,correo,auth_email,consent&limit=5000') : [];
  const correos = new Set(), claves = new Set();
  (cu || []).forEach(c => {
    if (!ceds.has(cedNorm(c.cedula))) return;
    const s = socioBase(c.socio); if (s) socios.add(s);
    [c.correo, c.auth_email].forEach(e => { if (e) claves.add(String(e).trim().toLowerCase()); });
    if (c.consent && c.correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.correo).trim())) correos.add(String(c.correo).trim().toLowerCase());
  });
  const tk = await sb('gtc_push_tokens?select=sess_key&sess_key=not.is.null&limit=10000');
  const sessKeys = new Set();
  (tk || []).forEach(t => {
    const k = String(t.sess_key || '');
    if (k.indexOf('@') > 0 ? claves.has(k.trim().toLowerCase()) : socios.has(socioBase(k))) sessKeys.add(k);
  });
  return { todos: false, sessKeys: [...sessKeys], correos: [...correos] };
}

// ---------- envío ----------
let _audKey = null;
async function llavePush() {
  if (_audKey) return _audKey;
  const r = await sb('gtc_config?select=valor&clave=eq.push_audience_key');
  _audKey = r && r[0] && r[0].valor; return _audKey;
}
export async function enviarPush(dest, title, body) {
  if (!dest.todos && !dest.sessKeys.length) return { sent: 0 };
  const secret = await llavePush(); if (!secret) return { sent: 0, error: 'sin llave de push' };
  const payload = { secret, title: String(title).slice(0, 80), body: String(body).slice(0, 300) };
  if (dest.todos) payload.broadcast = true; else payload.onlySessKeys = dest.sessKeys;
  const r = await fetch(URL + '/functions/v1/emitir-push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  let j = {}; try { j = await r.json(); } catch (e) { }
  return { sent: +j.sent || 0, error: r.ok ? undefined : (j.error || ('push ' + r.status)) };
}
// Correo: plantilla única (lib/correo.js). datos = contenido de la plantilla (tipo, título, duelo, filas, párrafos, botones).
export async function enviarCorreos(lista, asunto, datos) {
  if (!lista.length || !process.env.RESEND_API_KEY) return { enviados: 0 };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = plantilla(datos), subject = String(asunto).replace(/[\r\n]+/g, ' ').slice(0, 150);
  let n = 0; const errores = [];
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100).map(to => ({ from: FROM, to, replyTo: REPLY, subject, html }));
    try { const { error } = await resend.batch.send(lote); if (error) errores.push(String(error.message || error)); else n += lote.length; }
    catch (e) { errores.push(String(e && e.message || e)); }
  }
  return { enviados: n, error: errores[0] };
}

// Reserva la clave en el registro; si ya existía devuelve false (el aviso ya salió).
async function reservar(row) {
  const r = await sb('gtc_avisos_log?on_conflict=clave', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: JSON.stringify(row) });
  return Array.isArray(r) && r.length ? r[0].id : false;
}
async function cerrar(id, res) {
  try { await sb('gtc_avisos_log?id=eq.' + id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(res) }); } catch (e) { }
}

// Aviso completo: reserva, envía push y correo, y deja constancia.
export async function avisar({ clave, tipo, partido_id = null, alcance, autor = null, equipos, titulo: tit, cuerpo, asunto, mail, correo = true }) {
  const id = await reservar({ clave, tipo, partido_id, alcance, autor, titulo: tit, cuerpo });
  if (!id) return { ok: true, repetido: true, push: 0, correos: 0 };
  let dest, p = { sent: 0 }, c = { enviados: 0 }, err = null;
  try {
    dest = await destinatarios(equipos);
    p = await enviarPush(dest, tit, cuerpo);
    if (correo) c = await enviarCorreos(dest.correos, asunto || tit, mail || { tipo, titulo: tit, parrafos: [cuerpo] });
    err = p.error || c.error || null;
  } catch (e) { err = String((e && (e.message || JSON.stringify(e.data || e))) || e).slice(0, 300); }
  await cerrar(id, { push: p.sent || 0, correos: c.enviados || 0, error: err });
  return { ok: !err, push: p.sent || 0, correos: c.enviados || 0, telefonos: dest ? (dest.todos ? null : dest.sessKeys.length) : 0, error: err || undefined };
}

// ---------- avisos de partido ----------
async function partidoInfo(pid) {
  const r = await sb('partidos?select=id,tor,tipo,disciplina,cat,fecha,hora,sede,local_id,visita_id,gl,gv,estado&id=eq.' + enc(pid));
  const p = r && r[0]; if (!p) return null;
  const ids = [p.local_id, p.visita_id].filter(Boolean);
  const eq = ids.length ? await sb('equipos?select=id,nombre&id=in.(' + ids.map(enc).join(',') + ')') : [];
  const nom = id => titulo(((eq || []).find(e => e.id === id) || {}).nombre || '');
  p.nL = nom(p.local_id); p.nV = nom(p.visita_id);
  p.dn = DISC[p.disciplina] || titulo(p.disciplina || '');
  p.cn = CATN[p.cat] || '';
  p.etiqueta = p.dn + (p.cn ? ' · ' + p.cn : '');
  p.gen = p.tipo === 'gen' || !p.local_id || !p.visita_id;
  return p;
}
// Equipos que reciben el aviso: los dos del partido o, en una fecha general (natación, carrera…), todos los de su categoría
async function equiposDe(p) {
  if (!p.gen) return [p.local_id, p.visita_id];
  if (!p.cat) return null; // todas las categorías: todos los socios
  const eqs = await sb('equipos?select=id&tor=eq.olimpiadas2026&cat=eq.' + enc(p.cat));
  return (eqs || []).map(e => e.id);
}
function lugar(p) { return [p.hora, p.sede].filter(Boolean).join(' · '); }
function filasPartido(p, fechaTxtCompleta) {
  return [['Fecha', fechaTxtCompleta || fechaTxt(p.fecha)], ['Hora', p.hora || 'Por confirmar'], ['Cancha', p.sede || 'Por confirmar'], ['Deporte', p.dn], ['Categoría', p.cn || 'Todas las categorías']];
}
function botonesCal(p) {
  const ev = evento(p), g = googleUrl(ev);
  return [g ? { txt: 'Agregar a Google Calendar', url: g, icono: 'cal' } : null, { txt: 'Agregar a iPhone u Outlook', url: icsUrl(p.id), icono: 'cal' }].filter(Boolean);
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export async function avisoResultado(pid, autor) {
  const p = await partidoInfo(pid);
  if (!p || p.gen || p.estado !== 'fin' || p.gl == null || p.gv == null) return { ok: true, omitido: true };
  const marcador = p.nL + ' ' + p.gl + ' - ' + p.gv + ' ' + p.nV;
  return avisar({
    clave: 'res:' + pid + ':' + p.gl + '-' + p.gv, tipo: 'resultado', partido_id: pid, autor,
    alcance: 'equipos ' + p.local_id + ',' + p.visita_id, equipos: [p.local_id, p.visita_id],
    titulo: 'Resultado · ' + p.etiqueta, cuerpo: marcador,
    asunto: 'Resultado · ' + marcador,
    mail: { tipo: 'resultado', titulo: 'Se registró el resultado de tu partido', preheader: marcador,
      duelo: { local: p.nL, visita: p.nV, centro: p.gl + ' - ' + p.gv, marcador: true },
      filas: [['Deporte', p.dn], ['Categoría', p.cn], ['Fecha', cap(fechaTxt(p.fecha))]],
      parrafos: ['La tabla de posiciones ya está actualizada en GTC Sports, con los puntos de este partido.'],
      botones: [{ txt: 'Ver la tabla', url: APP }], sinAbrir: true }
  });
}
export async function avisoCambio(pid, autor) {
  const p = await partidoInfo(pid);
  if (!p || p.estado === 'fin' || !p.fecha || p.fecha < hoyGye()) return { ok: true, omitido: true };
  const cuando = fechaTxt(p.fecha) + (lugar(p) ? ' · ' + lugar(p) : '');
  const quien = p.gen ? p.etiqueta : p.nL + ' vs ' + p.nV;
  return avisar({
    clave: 'cam:' + pid + ':' + p.fecha + '|' + (p.hora || '') + '|' + (p.sede || ''), tipo: 'cambio', partido_id: pid, autor,
    alcance: p.gen ? 'categoría ' + (p.cat || 'todas') : 'equipos ' + p.local_id + ',' + p.visita_id, equipos: await equiposDe(p),
    titulo: 'Cambio en tu ' + (p.gen ? 'fecha' : 'partido') + ' · ' + p.dn, cuerpo: quien + ': ahora ' + cuando,
    asunto: 'Cambio de horario o cancha · ' + quien,
    mail: { tipo: 'cambio', titulo: p.gen ? 'Cambió la fecha de ' + p.etiqueta : 'Tu partido cambió de horario o cancha', preheader: quien + ': ahora ' + cuando,
      duelo: p.gen ? null : { local: p.nL, visita: p.nV, centro: 'vs' },
      filas: filasPartido(p, cap(fechaTxt(p.fecha))),
      parrafos: ['La Comisión de Deportes reprogramó ' + (p.gen ? 'esta fecha' : 'este partido') + '. Estos son los datos nuevos; si ya lo tenías en tu calendario, agrégalo otra vez con la nueva hora.'],
      botones: botonesCal(p) }
  });
}
export async function recordatoriosDelDia() {
  const hoy = hoyGye();
  const ps = await sb('partidos?select=id,tipo,local_id,visita_id&fecha=eq.' + hoy + '&estado=neq.fin&tor=eq.olimpiadas2026&order=hora.asc&limit=200');
  const out = [];
  for (const x of ps || []) {
    if (x.tipo !== 'gen' && (!x.local_id || !x.visita_id)) continue;
    const p = await partidoInfo(x.id); if (!p) continue;
    const quien = p.gen ? p.etiqueta : p.nL + ' vs ' + p.nV;
    const r = await avisar({
      clave: 'rec:' + p.id + ':' + p.fecha, tipo: 'recordatorio', partido_id: p.id, autor: 'automático',
      alcance: p.gen ? 'categoría ' + (p.cat || 'todas') : 'equipos ' + p.local_id + ',' + p.visita_id, equipos: await equiposDe(p),
      titulo: (p.gen ? 'Hoy compites · ' : 'Hoy juegas · ') + p.dn, cuerpo: quien + (lugar(p) ? ' · ' + lugar(p) : ''),
      asunto: (p.gen ? 'Hoy compites · ' : 'Hoy juegas · ') + quien,
      mail: { tipo: 'recordatorio', etiqueta: p.gen ? 'Hoy compites' : 'Hoy juegas', titulo: p.gen ? 'Hoy es la fecha de ' + p.etiqueta : 'Hoy es tu partido de ' + p.etiqueta,
        preheader: quien + (lugar(p) ? ' · ' + lugar(p) : ''),
        duelo: p.gen ? null : { local: p.nL, visita: p.nV, centro: p.hora || 'vs' },
        filas: filasPartido(p, 'Hoy, ' + fechaTxt(p.fecha)),
        parrafos: ['Agrégalo a tu calendario con un toque para recibir un recordatorio una hora antes.'],
        botones: botonesCal(p) }
    });
    out.push({ id: p.id, ...r });
  }
  return { fecha: hoy, partidos: out.length, detalle: out };
}
