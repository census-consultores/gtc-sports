// GTC Sports — API del módulo de torneos (réplica de Tournament Planner). La llama /api/gtc-admin.
// Cada torneo es un documento en tp_torneos (como un archivo .TP). Solo la SECRET key lo lee o escribe (RLS sin políticas).
// Acciones con token de administración (rol deportes o superadmin para escribir):
//   tp_list   {token}                         -> lista de torneos
//   tp_get    {token, id}                     -> documento completo
//   tp_save   {token, id?, rev?, data}        -> guarda (control de versión: rev); recalcula la vista pública
//   tp_del    {token, id}
//   tp_buscar {token, q}                      -> socios (nóminas y cuentas) para inscribir
//   tp_aviso  {token, id, tipo, ...}          -> push + correo a jugadores: pago | horario | resultado | sorteo | libre
// Públicas (la app de socios):
//   tp_publicos {}                            -> torneos publicados (sin datos personales)
//   tp_publico  {id, access_token?}           -> cuadros, partidos y tablas. En curso: solo socios con sesión; nombres de menores solo con sesión.
import { avisar, fechaTxt, hoyGye } from './avisos.js';
import { publico, resolver, nombreIns, personasDe, nombreRonda, DEPORTES } from '../tp/motor.js';

const MAX_BYTES = 3 * 1024 * 1024;
const enc = encodeURIComponent;
const LISTA = 'id,nombre,grupo,deporte,desde,hasta,estado,publicado,rev,updated_at,actualizado_por';

function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30); }
function fecha(x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null; }

export async function tpPublicas(accion, body, res, { sb, authUser }) {
  if (accion === 'tp_publicos') {
    const rows = await sb('tp_torneos?select=id,nombre,grupo,deporte,desde,hasta,estado&publicado=is.true&estado=neq.borrador&order=desde.desc.nullslast&limit=500');
    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.status(200).json({ ok: true, torneos: rows || [] });
  }
  if (accion === 'tp_publico') {
    const rows = await sb('tp_torneos?select=id,estado,publico&publicado=is.true&estado=neq.borrador&id=eq.' + enc(String(body.id || '')));
    const t = rows && rows[0];
    if (!t || !t.publico) return res.status(404).json({ ok: false, msg: 'Torneo no disponible.' });
    let socio = false;
    if (body.access_token) {
      const u = await authUser(String(body.access_token));
      if (u) { const c = await sb('cuentas?select=id&auth_uid=eq.' + enc(u.id) + '&limit=1'); socio = !!(c && c.length); }
    }
    res.setHeader('Cache-Control', 'no-store');
    // mismo criterio que el resto de la app: los torneos en curso son para socios con sesión; los finalizados son públicos
    if (t.estado !== 'finalizado' && !socio) return res.status(200).json({ ok: true, bloqueado: true, info: t.publico.info });
    const p = t.publico;
    if (!socio) Object.values(p.jugadores || {}).forEach(j => { if (j.m) { j.n = 'Nombre reservado'; j.club = ''; } });
    return res.status(200).json({ ok: true, torneo: p, estado: t.estado });
  }
  return null;
}

export async function tpAdmin(accion, body, res, { sb, sess, puedeLeer, puedeEscribir }) {
  if (!puedeLeer) return res.status(403).json({ ok: false, msg: 'Sin permiso.' });
  const soloEscritura = ['tp_save', 'tp_del', 'tp_aviso', 'tp_buscar'];
  if (soloEscritura.includes(accion) && !puedeEscribir) return res.status(403).json({ ok: false, msg: 'Solo Deportes puede modificar torneos.' });
  res.setHeader('Cache-Control', 'no-store');

  if (accion === 'tp_list') {
    const rows = await sb('tp_torneos?select=' + LISTA + '&order=desde.desc.nullslast&limit=500');
    return res.status(200).json({ ok: true, torneos: rows || [] });
  }
  if (accion === 'tp_get') {
    const rows = await sb('tp_torneos?select=id,rev,data,updated_at,actualizado_por&id=eq.' + enc(String(body.id || '')));
    if (!rows || !rows[0]) return res.status(404).json({ ok: false, msg: 'Torneo no encontrado.' });
    // Comisión y Directorio solo leen: sin cédulas, contactos, pagos, fechas de nacimiento ni notas.
    if (!puedeEscribir) { const d = rows[0].data; (d.jugadores || []).forEach(j => { for (const k of ['cedula', 'email', 'tel', 'pagos', 'nac', 'notas']) delete j[k]; }); (d.inscripciones || []).forEach(i => { delete i.notas; }); d.notas = []; }
    return res.status(200).json({ ok: true, ...rows[0] });
  }
  if (accion === 'tp_save') {
    const data = body.data;
    if (!data || typeof data !== 'object' || !data.info || !Array.isArray(data.cuadros)) return res.status(400).json({ ok: false, msg: 'Documento de torneo inválido.' });
    const txt = JSON.stringify(data);
    if (txt.length > MAX_BYTES) return res.status(413).json({ ok: false, msg: 'El torneo es demasiado grande para guardarlo.' });
    const info = data.info;
    const nombre = String(info.nombre || '').trim().slice(0, 120);
    if (nombre.length < 3) return res.status(400).json({ ok: false, msg: 'Escribe el nombre del torneo.' });
    if (!DEPORTES[info.deporte]) return res.status(400).json({ ok: false, msg: 'Deporte no válido.' });
    if (!fecha(info.desde)) return res.status(400).json({ ok: false, msg: 'Falta la fecha de inicio.' });
    let pub = null;
    try { pub = data.publicado ? publico(data) : null; } catch (e) { return res.status(400).json({ ok: false, msg: 'No se pudo calcular la vista pública: ' + String(e.message || e).slice(0, 120) }); }
    const now = new Date().toISOString();
    const row = { nombre, grupo: String(info.grupo || '').trim().slice(0, 60) || null, deporte: info.deporte, desde: info.desde, hasta: [fecha(info.hasta) || info.desde].concat((data.dias || []).filter(fecha)).sort().pop(), estado: ['borrador', 'curso', 'finalizado'].includes(data.estado) ? data.estado : 'curso', publicado: !!data.publicado, data, publico: pub, updated_at: now, actualizado_por: sess.c };
    if (!body.id) {
      row.id = 'tp-' + (slug(nombre) || 'torneo') + '-' + Date.now().toString(36).slice(-5);
      row.rev = 1; row.creado_por = sess.c;
      const r = await sb('tp_torneos', { method: 'POST', body: JSON.stringify(row) });
      if (!r || !r.length) return res.status(500).json({ ok: false, msg: 'No se pudo crear el torneo.' });
      return res.status(200).json({ ok: true, id: row.id, rev: 1 });
    }
    const rev = parseInt(body.rev, 10) || 0;
    row.rev = rev + 1;
    // Solo se guarda si nadie más guardó antes (rev igual): evita pisar cambios hechos desde otra computadora.
    const r = await sb('tp_torneos?id=eq.' + enc(String(body.id)) + '&rev=eq.' + rev, { method: 'PATCH', body: JSON.stringify(row) });
    if (!r || !r.length) {
      const cur = await sb('tp_torneos?select=rev,actualizado_por,updated_at&id=eq.' + enc(String(body.id)));
      if (!cur || !cur[0]) return res.status(404).json({ ok: false, msg: 'Torneo no encontrado.' });
      return res.status(409).json({ ok: false, conflicto: true, msg: 'Otra persona guardó cambios en este torneo (' + (cur[0].actualizado_por || '') + '). Recarga para ver la versión actual.', rev: cur[0].rev });
    }
    return res.status(200).json({ ok: true, id: body.id, rev: row.rev });
  }
  if (accion === 'tp_del') {
    await sb('tp_torneos?id=eq.' + enc(String(body.id || '')), { method: 'DELETE', prefer: 'return=minimal' });
    return res.status(200).json({ ok: true });
  }
  if (accion === 'tp_buscar') {
    const q = String(body.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.status(200).json({ ok: true, personas: [] });
    const dig = q.replace(/\D/g, '');
    const filtros = [];
    if (dig.length >= 3) { filtros.push('socio.ilike.' + dig + '*'); if (dig.length >= 6) filtros.push('ced_real.like.' + dig + '*'); }
    filtros.push('nombre.ilike.*' + q.replace(/[*,()]/g, ' ') + '*');
    const js = await sb('jugadores?select=nombre,socio,ced_real&activo=eq.true&or=(' + filtros.map(enc).join(',') + ')&limit=40');
    const cs = await sb('cuentas?select=nombre,nombres,socio,cedula,fecha_nacimiento,correo,whatsapp&or=(' + ['nombre.ilike.*' + q.replace(/[*,()]/g, ' ') + '*', 'nombres.ilike.*' + q.replace(/[*,()]/g, ' ') + '*'].concat(dig.length >= 3 ? ['socio.ilike.' + dig + '*'] : []).concat(dig.length >= 6 ? ['cedula.like.' + dig + '*'] : []).map(enc).join(',') + ')&limit=40');
    const por = {};
    (js || []).forEach(j => { const k = j.ced_real || j.nombre; por[k] = { nombre: j.nombre, socio: j.socio || '', cedula: j.ced_real || '' }; });
    (cs || []).forEach(c => { const k = c.cedula || c.nombre; por[k] = { ...(por[k] || {}), nombre: c.nombres || c.nombre || (por[k] || {}).nombre, socio: c.socio || (por[k] || {}).socio || '', cedula: c.cedula || (por[k] || {}).cedula || '', nac: c.fecha_nacimiento || undefined, email: c.correo || undefined, tel: c.whatsapp || undefined }; });
    return res.status(200).json({ ok: true, personas: Object.values(por).slice(0, 30) });
  }
  if (accion === 'tp_aviso') {
    const rows = await sb('tp_torneos?select=id,data&id=eq.' + enc(String(body.id || '')));
    const T = rows && rows[0] && rows[0].data;
    if (!T) return res.status(404).json({ ok: false, msg: 'Guarda el torneo antes de enviar avisos.' });
    const lista = construirAvisos(T, rows[0].id, body);
    if (lista.error) return res.status(400).json({ ok: false, msg: lista.error });
    let push = 0, correos = 0, repetidos = 0; const errores = [];
    for (const a of lista) {
      const r = await avisar({ ...a, autor: sess.c });
      if (r.repetido) repetidos++; push += r.push || 0; correos += r.correos || 0; if (r.error) errores.push(r.error);
    }
    return res.status(200).json({ ok: true, avisos: lista.length, repetidos, push, correos, error: errores[0] });
  }
  return res.status(400).json({ ok: false, msg: 'Acción no válida.' });
}

// ---------- avisos ----------
const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
function canchaNombre(T, id) { for (const s of T.sedes || []) for (const c of s.canchas || []) if (c.id === id) return c.nombre; return ''; }
function etiqueta(T, c) { const ev = T.eventos.find(e => e.id === c.evento); return [DEPORTES[T.info.deporte], ev && ev.nombre].filter(Boolean).join(' · '); }
export function construirAvisos(T, tid, body) {
  const tipo = String(body.tipo || '');
  const R = resolver(T), out = [];
  const cuadroDe = k => T.cuadros.find(c => c.id === String(k).split(':')[0]);
  const vs = p => nombreIns(T, T.inscripciones.find(i => i.id === p.a)) + ' vs ' + nombreIns(T, T.inscripciones.find(i => i.id === p.b));
  const datosPartido = p => { const c = cuadroDe(p.k); const ronda = nombreRonda(c, p.r); return { c, ronda, cuando: fechaTxt(p.fecha) + (p.hora ? ' · ' + p.hora : '') + (p.cancha ? ' · cancha ' + canchaNombre(T, p.cancha) : '') }; };
  if (tipo === 'pago') {
    const ins = T.inscripciones.find(i => i.id === body.ins);
    if (!ins) return { error: 'Inscripción no encontrada.' };
    const ev = T.eventos.find(e => e.id === ins.evento) || {};
    out.push({ clave: 'tpp:' + tid + ':' + ins.id, tipo: 'tp-inscripcion', alcance: 'torneo ' + tid, personas: personasDe(T, [ins.id]),
      titulo: 'Inscripción confirmada · ' + T.info.nombre, cuerpo: (ev.nombre || '') + ': Deportes validó tu pago. Te avisaremos cuando salga el horario.',
      mail: { tipo: 'anuncio', titulo: 'Tu inscripción está confirmada', parrafos: ['Deportes validó tu pago para ' + T.info.nombre + ' (' + (ev.nombre || '') + ').', 'Te avisaremos cuando se publique el sorteo y el horario de tu primer partido.'], botones: [{ txt: 'Abrir GTC Sports', url: APP }] } });
  } else if (tipo === 'horario' || tipo === 'resultado') {
    const ps = R.partidos.filter(p => p.listo && (body.k ? p.k === body.k : true) && (tipo === 'horario' ? (p.fecha && p.hora && !p.decidido && p.fecha >= hoyGye()) : p.decidido && (p.g || p.est)));
    if (body.k && !ps.length) return { error: tipo === 'horario' ? 'El partido no tiene fecha y hora, o ya se jugó.' : 'El partido no tiene resultado.' };
    for (const p of ps) {
      const d = datosPartido(p), quien = vs(p);
      if (tipo === 'horario') {
        out.push({ clave: 'tph:' + tid + ':' + p.k + ':' + p.fecha + '|' + p.hora + '|' + (p.cancha || ''), tipo: 'tp-horario', alcance: 'torneo ' + tid, personas: personasDe(T, [p.a, p.b]),
          titulo: 'Tu partido · ' + etiqueta(T, d.c), cuerpo: quien + ': ' + d.cuando,
          mail: { tipo: 'cambio', titulo: 'Horario de tu partido', preheader: quien + ': ' + d.cuando, filas: [['Torneo', T.info.nombre], ['Categoría', etiqueta(T, d.c)], ['Ronda', d.ronda], ['Partido', quien], ['Fecha', fechaTxt(p.fecha)], ['Hora', p.hora], ['Cancha', canchaNombre(T, p.cancha) || 'Por confirmar']], parrafos: ['Si el horario cambia, te avisaremos de nuevo.'], botones: [{ txt: 'Ver el cuadro', url: APP }] } });
      } else {
        const marcador = p.est ? ({ wo: 'W.O.', wom: 'W.O. médico', ret: 'Retiro', dis: 'Descalificación', np: 'No jugado' }[p.est] || p.est) : (p.sets || []).map(s => s.join('-')).join(' ');
        const gana = p.g === 't' ? 'Empate' : 'Gana ' + nombreIns(T, T.inscripciones.find(i => i.id === (p.g === 'a' ? p.a : p.b)));
        out.push({ clave: 'tpr:' + tid + ':' + p.k + ':' + marcador + ':' + p.g, tipo: 'tp-resultado', alcance: 'torneo ' + tid, personas: personasDe(T, [p.a, p.b]),
          titulo: 'Resultado · ' + etiqueta(T, d.c), cuerpo: quien + ': ' + marcador + '. ' + gana + '.',
          mail: { tipo: 'resultado', titulo: 'Se registró el resultado de tu partido', preheader: quien + ': ' + marcador, filas: [['Torneo', T.info.nombre], ['Categoría', etiqueta(T, d.c)], ['Ronda', d.ronda], ['Marcador', marcador], ['Resultado', gana]], botones: [{ txt: 'Ver el cuadro', url: APP }], sinAbrir: true } });
      }
    }
  } else if (tipo === 'sorteo') {
    const evs = body.evento ? [body.evento] : T.eventos.map(e => e.id);
    for (const ev of evs) {
      const e = T.eventos.find(x => x.id === ev); if (!e) continue;
      const ins = T.inscripciones.filter(i => i.evento === ev && T.cuadros.some(c => c.evento === ev && (c.lineas || []).includes(i.id))).map(i => i.id);
      if (!ins.length) continue;
      out.push({ clave: 'tps:' + tid + ':' + ev + ':' + Date.now().toString(36).slice(0, -3), tipo: 'tp-sorteo', alcance: 'torneo ' + tid, personas: personasDe(T, ins),
        titulo: 'Sorteo publicado · ' + T.info.nombre, cuerpo: e.nombre + ': ya puedes ver el cuadro y tus rivales en GTC Sports.',
        mail: { tipo: 'anuncio', titulo: 'Ya salió el sorteo de ' + e.nombre, parrafos: ['El cuadro de ' + e.nombre + ' en ' + T.info.nombre + ' ya está publicado en GTC Sports.'], botones: [{ txt: 'Ver el cuadro', url: APP }] } });
    }
  } else if (tipo === 'libre') {
    const tit = String(body.titulo || '').trim().slice(0, 80), msg = String(body.mensaje || '').trim().slice(0, 600);
    if (tit.length < 3 || msg.length < 3) return { error: 'Escribe el título y el mensaje.' };
    const ins = T.inscripciones.filter(i => (!body.evento || i.evento === body.evento) && i.estado !== 'WD').map(i => i.id);
    if (!ins.length) return { error: 'No hay inscritos a quienes avisar.' };
    out.push({ clave: 'tpl:' + tid + ':' + Date.now(), tipo: 'tp-libre', alcance: 'torneo ' + tid + (body.evento ? ' · ' + body.evento : ''), personas: personasDe(T, ins), titulo: tit, cuerpo: msg, mail: { tipo: 'anuncio', titulo: tit, parrafos: msg.split(/\n+/) } });
  } else return { error: 'Tipo de aviso no válido.' };
  return out;
}

// Recordatorio del día (lo llama el cron de las 7:00): partidos de hoy de los torneos en curso.
export async function recordatoriosTP(sb) {
  const hoy = hoyGye();
  const rows = await sb('tp_torneos?select=id,data&estado=eq.curso&desde=lte.' + hoy + '&hasta=gte.' + hoy + '&limit=50');
  let n = 0;
  for (const t of rows || []) {
    const T = t.data, R = resolver(T);
    for (const p of R.partidos.filter(q => q.fecha === hoy && q.hora && q.listo && !q.decidido)) {
      const c = T.cuadros.find(x => x.id === p.c);
      const quien = nombreIns(T, T.inscripciones.find(i => i.id === p.a)) + ' vs ' + nombreIns(T, T.inscripciones.find(i => i.id === p.b));
      const cuando = p.hora + (p.cancha ? ' · cancha ' + canchaNombre(T, p.cancha) : '');
      await avisar({ clave: 'tpd:' + t.id + ':' + p.k + ':' + hoy, tipo: 'tp-recordatorio', alcance: 'torneo ' + t.id, autor: 'automático', personas: personasDe(T, [p.a, p.b]),
        titulo: 'Hoy juegas · ' + etiqueta(T, c), cuerpo: quien + ' · ' + cuando,
        mail: { tipo: 'recordatorio', etiqueta: 'Hoy juegas', titulo: 'Hoy es tu partido de ' + T.info.nombre, preheader: quien + ' · ' + cuando, filas: [['Categoría', etiqueta(T, c)], ['Partido', quien], ['Hora', p.hora], ['Cancha', canchaNombre(T, p.cancha) || 'Por confirmar']], botones: [{ txt: 'Ver el cuadro', url: APP }] } });
      n++;
    }
  }
  return { partidosTP: n };
}
