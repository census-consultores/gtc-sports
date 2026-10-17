// GTC Sports — función serverless de administración (Vercel + Supabase)
// Usa la SECRET key de Supabase (bypassa RLS). Variables en Vercel:
//   SUPABASE_URL, SUPABASE_SECRET_KEY
// Acciones (POST JSON {accion, ...}):
//   login            {correo, clave}                       -> {ok, token, nombre, rol, correo}
//   resultado        {token, partido_id, gl, gv, goles[], tarjetas[], detalle?}  (detalle = planilla por sets: tenis, pádel, ping pong, pickleball, beach volley)
//   partido_edit     {token, partido_id, fecha, hora, sede, local_id, visita_id}  (si cambian los equipos, borra goles/tarjetas de los equipos salientes)
//   partido_del      {token, partido_id}                    (borra el partido; goles y tarjetas en cascada)
//   equipo_add       {token, tor, nombre, cat?, delegado?}  (Olimpiadas: tor=olimpiadas2026 + cat)
//   equipo_edit      {token, id, nombre?, delegado?}
//   equipo_del       {token, id}                            (borra equipo, sus partidos, goles, tarjetas, puestos y nómina)
//   torneo_add       {token, nombre, disciplina, desde, hasta}   (campeonato de un deporte)
//   torneo_edit      {token, id, nombre, desde, hasta, estado}
//   equipo_add       {token, tor, nombre}
//   prueba_guardar   {token, disciplina: natacion|carrera, cat, filas:[{prueba, posicion, equipo_id}]}
//   jugador_add      {token, equipo_id, nombre, num, socio, cedula, invitado}
//   jugador_edit     {token, id, ...campos}
//   jugador_del      {token, id}
//   analitica        {token, dias}                         -> resumen de eventos
//   buscar_socio     {socio, cedula}  (público)            -> {ok, personas[]}  (la cédula vive en jugadores.ced_real, no legible por anon)
//   registrar_cuenta {access_token, socio, cedula, ...}     (sesión de Supabase Auth obligatoria)
//   jugador_cedulas  {token, equipo_id}                    -> {ok, cedulas:{id:cedula}}
//   aviso_enviar     {token, alcance: todos|categoria|equipo, cat?, equipo_id?, titulo, mensaje, correo?}  (Comisión, Deportes, superadmin)
//   aviso_contar     {token, alcance, ...}                 -> {telefonos, correos} (sin enviar)
//   aviso_prueba     {token, titulo, mensaje}              -> correo de prueba solo a quien envía
//   avisos_list      {token}                               -> últimos avisos enviados (push + correo)
// resultado y partido_edit avisan solos a los dos equipos (push + correo) salvo avisar:false.
import crypto from 'node:crypto';
import { avisar, avisoResultado, avisoCambio, destinatarios, enviarCorreos } from '../lib/avisos.js';

const URL = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ROLES_WRITE = ['superadmin', 'deportes'];
const ROLES_READ = ['superadmin', 'deportes', 'comision', 'directorio'];
const CATS_MENORES = ['I1', 'I2', 'I3', 'I4', 'J1', 'J2', 'J3'];

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function b64u(s) { return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return Buffer.from(s, 'base64').toString(); }
function sign(payload) { return crypto.createHmac('sha256', SECRET).update(payload).digest('hex'); }
function makeToken(correo, rol) {
  const p = b64u(JSON.stringify({ c: correo, r: rol, exp: Date.now() + 12 * 3600 * 1000 }));
  return p + '.' + sign(p);
}
function readToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [p, sig] = token.split('.');
  const exp = sign(p);
  if (!sig || sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  let obj; try { obj = JSON.parse(unb64u(p)); } catch (e) { return null; }
  if (!obj || obj.exp < Date.now()) return null;
  return obj; // {c, r, exp}
}

// Planilla por sets: solo se guarda una estructura acotada (la valida y calcula el panel).
function limpiarDetalle(d) {
  if (d == null) return null;
  if (typeof d !== 'object' || !Array.isArray(d.m) || d.m.length > 3) return false;
  const lado = x => (x === 'l' || x === 'v') ? x : null;
  const ids = a => (Array.isArray(a) ? a : []).slice(0, 4).map(String).filter(x => /^[A-Za-z0-9_-]{1,64}$/.test(x));
  const out = { v: 1, wo: lado(d.wo), m: [] };
  if (lado(d.dg)) out.dg = d.dg;
  for (const m of d.m) {
    if (!m || !/^(S1|S2|D|P1|P2|P3|M)$/.test(String(m.k))) return false;
    const s = Array.isArray(m.s) ? m.s : [];
    if (s.length > 3) return false;
    const sets = [];
    for (const x of s) {
      if (!Array.isArray(x) || x.length !== 2) return false;
      const a = parseInt(x[0], 10), b = parseInt(x[1], 10);
      if (!(a >= 0 && a <= 99 && b >= 0 && b <= 99)) return false;
      sets.push([a, b]);
    }
    out.m.push({ k: String(m.k), jl: ids(m.jl), jv: ids(m.jv), s: sets, wo: lado(m.wo) });
  }
  return out;
}

async function sb(path, opts = {}) {
  const r = await fetch(URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json', Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) throw { status: r.status, data };
  return data;
}

// Verifica un access_token de Supabase Auth (socio) y devuelve {id, email} o null
async function authUser(at) {
  if (!at) return null;
  try {
    const ur = await fetch(URL + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + at } });
    if (!ur.ok) return null;
    const uj = await ur.json();
    return uj && uj.id ? { id: uj.id, email: String(uj.email || '').toLowerCase() } : null;
  } catch (e) { return null; }
}
// Código de socio tolerante: ignora ceros a la izquierda y el sufijo -01/-02 de los hijos
function baseNum(x) { return String(x == null ? '' : x).replace(/\D/g, '').replace(/^0+/, ''); }
function socioIgual(a, b) {
  const na = baseNum(a), nb = baseNum(b); if (!na || !nb) return false; if (na === nb) return true;
  if (nb.length > na.length && nb.slice(0, na.length) === na && nb.length - na.length <= 2) return true;
  if (na.length > nb.length && na.slice(0, nb.length) === nb && na.length - nb.length <= 2) return true;
  return false;
}
function cedNorm(c) { c = String(c || '').replace(/\D/g, ''); if (c.length === 9) c = '0' + c; return c; }

export default async function handler(req, res) {
  // CORS: la app nativa (capacitor://localhost) llama a este endpoint de forma cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!URL || !KEY) return res.status(500).json({ error: 'Faltan variables de entorno de Supabase' });
  try {
    const body = req.body || {};
    const accion = body.accion;

    // ---- LOGIN ----
    if (accion === 'login') {
      const correo = String(body.correo || '').trim().toLowerCase();
      const clave = String(body.clave || '');
      if (!correo) return res.status(400).json({ ok: false, campo: 'correo', msg: 'Escribe tu correo.' });
      if (!clave) return res.status(400).json({ ok: false, campo: 'clave', msg: 'Escribe tu clave.' });
      const rows = await sb('usuarios_admin?select=correo,nombre,rol,clave_hash,activo&correo=eq.' + encodeURIComponent(correo));
      const u = (rows || [])[0];
      if (!u || u.activo === false || u.clave_hash !== sha256(clave))
        return res.status(200).json({ ok: false, campo: 'clave', msg: 'Correo o clave incorrectos.' });
      return res.status(200).json({ ok: true, token: makeToken(u.correo, u.rol), nombre: u.nombre, rol: u.rol, correo: u.correo });
    }

    // ---- BUSCAR SOCIO (público): valida código de socio + cédula sin exponer cédulas al cliente ----
    if (accion === 'buscar_socio') {
      // exige haberse identificado antes (Apple, Google o código por correo): frena la enumeración anónima
      const who = await authUser(String(body.access_token || ''));
      if (!who) return res.status(200).json({ ok: false, campo: 'cedula', msg: 'Tu sesión expiró. Vuelve a entrar con Apple, Google o tu correo.' });
      const socio = baseNum(body.socio);
      const cedula = cedNorm(body.cedula);
      if (!socio) return res.status(200).json({ ok: false, campo: 'socio', msg: 'Escribe tu código de socio.' });
      if (cedula.length !== 10) return res.status(200).json({ ok: false, campo: 'cedula', msg: 'La cédula debe tener 10 dígitos.' });
      const rows = await sb('jugadores?select=id,nombre,num,socio,invitado,equipo_id&activo=eq.true&ced_real=eq.' + encodeURIComponent(cedula));
      if (!rows || !rows.length) return res.status(200).json({ ok: false, campo: 'cedula', msg: 'No encontramos esa cédula. Verifica los datos o escribe a deportes@guayaquiltenisclub.ec.' });
      const match = rows.filter(j => socioIgual(socio, j.socio));
      if (!match.length) return res.status(200).json({ ok: false, campo: 'socio', msg: 'La cédula existe, pero el código de socio no coincide. Revisa tu número de socio o escribe a deportes@guayaquiltenisclub.ec.' });
      return res.status(200).json({ ok: true, personas: match.map(j => ({ id: j.id, nombre: j.nombre, num: j.num, socio: j.socio, invitado: !!j.invitado, equipo_id: j.equipo_id })) });
    }

    // ---- REGISTRAR CUENTA: exige la sesión de Supabase Auth del socio y que socio + cédula coincidan ----
    if (accion === 'registrar_cuenta') {
      const u = await authUser(String(body.access_token || ''));
      if (!u) return res.status(401).json({ ok: false, msg: 'sesion' });
      const cedula = cedNorm(body.cedula);
      if (cedula.length !== 10) return res.status(200).json({ ok: false, msg: 'cedula' });
      const js = await sb('jugadores?select=nombre,equipo_id,socio&activo=eq.true&ced_real=eq.' + encodeURIComponent(cedula));
      const j = (js || []).filter(x => socioIgual(body.socio, x.socio))[0];
      if (!j) return res.status(200).json({ ok: false, msg: 'no-match' });
      // si la cédula ya está vinculada a OTRA identidad, no se sobrescribe
      const prev = await sb('cuentas?select=auth_uid&cedula=eq.' + encodeURIComponent(cedula) + '&limit=1');
      if (prev && prev[0] && prev[0].auth_uid && prev[0].auth_uid !== u.id) return res.status(200).json({ ok: false, msg: 'otra-cuenta' });
      const now = new Date().toISOString();
      const row = {
        cedula, socio: j.socio || null, nombre: body.nombre || j.nombre,
        equipo_id: j.equipo_id || null, cat: body.cat || null,
        plataforma: body.plataforma || null, last_login: now,
        auth_uid: u.id, auth_email: u.email || null
      };
      if (body.correo) row.correo = String(body.correo).trim().slice(0, 120);
      if (body.whatsapp) row.whatsapp = String(body.whatsapp).replace(/[^\d+]/g, '').slice(0, 20);
      if (body.consent) { row.consent = true; row.consent_fecha = now; }
      if (body.nombres) row.nombres = String(body.nombres).trim().slice(0, 120);
      if (body.fecha_nacimiento) row.fecha_nacimiento = String(body.fecha_nacimiento).slice(0, 10);
      if (body.auth_provider) row.auth_provider = String(body.auth_provider).slice(0, 20);
      if (Array.isArray(body.deportes)) row.deportes = body.deportes.slice(0, 20).map(x => String(x).slice(0, 20));
      if (body.perfil_completo) row.perfil_completo = true;
      try {
        await sb('cuentas?on_conflict=cedula', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(row) });
      } catch (e) { return res.status(200).json({ ok: false }); }
      return res.status(200).json({ ok: true });
    }

    // ---- ELIMINAR CUENTA (el propio socio, verificado con su token de Supabase Auth) ----
    if (accion === 'eliminar_cuenta') {
      const at = String(body.access_token || '');
      if (!at) return res.status(400).json({ ok: false, msg: 'Falta la sesión.' });
      // 1) verificar que el token pertenece a quien pide el borrado
      let uid = null, email = null;
      try {
        const ur = await fetch(URL + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + at } });
        if (!ur.ok) throw 0;
        const uj = await ur.json();
        uid = uj && uj.id; email = ((uj && uj.email) || '').toLowerCase();
      } catch (e) {
        return res.status(401).json({ ok: false, msg: 'Tu sesión no es válida. Vuelve a entrar e inténtalo de nuevo.' });
      }
      if (!uid) return res.status(401).json({ ok: false, msg: 'Tu sesión no es válida.' });
      // 2) dar de baja los avisos de ese teléfono y de esa cuenta, y anonimizar su analítica
      try {
        const cs = await sb('cuentas?select=socio&auth_uid=eq.' + encodeURIComponent(uid));
        const claves = new Set(); if (email) claves.add(email);
        (cs || []).forEach(c => { if (c.socio) { claves.add(String(c.socio)); const b = baseNum(c.socio); if (b) claves.add(b); } });
        for (const k of claves) await sb('gtc_push_tokens?sess_key=eq.' + encodeURIComponent(k), { method: 'DELETE', prefer: 'return=minimal' });
        const pt = String(body.push_token || '');
        if (pt) await sb('gtc_push_tokens?token=eq.' + encodeURIComponent(pt), { method: 'DELETE', prefer: 'return=minimal' });
        for (const k of claves) if (k.indexOf('@') < 0) await sb('eventos?socio=eq.' + encodeURIComponent(k), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ socio: null, nombre: null, cedula: null }) });
      } catch (e) { /* continuar con la eliminación */ }
      // 3) borrar los datos personales de contacto del socio (tabla cuentas)
      try {
        await sb('cuentas?auth_uid=eq.' + encodeURIComponent(uid), { method: 'DELETE', prefer: 'return=minimal' });
        if (email) await sb('cuentas?auth_email=eq.' + encodeURIComponent(email), { method: 'DELETE', prefer: 'return=minimal' });
      } catch (e) { /* si no hay fila, continuar: lo esencial es eliminar la identidad de acceso */ }
      // 4) borrar la identidad de acceso (Apple / Google / correo) en Supabase Auth
      try {
        const dr = await fetch(URL + '/auth/v1/admin/users/' + encodeURIComponent(uid), {
          method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
        });
        if (!dr.ok && dr.status !== 404) { const t = await dr.text(); throw { status: dr.status, data: t }; }
      } catch (e) {
        return res.status(200).json({ ok: false, msg: 'No pudimos completar la eliminación en este momento. Inténtalo de nuevo en unos minutos.' });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- NÓMINAS DE MENORES: administración = completas; socio con sesión = solo quienes tienen goles o tarjetas ----
    if (accion === 'nominas') {
      const adm = readToken(body.token);
      const esAdm = adm && ROLES_READ.indexOf(adm.r) >= 0;
      const u = esAdm ? null : await authUser(String(body.access_token || ''));
      if (!esAdm && !u) return res.status(401).json({ ok: false, msg: 'Inicia sesión.' });
      const eqs = await sb('equipos?select=id&cat=in.(' + CATS_MENORES.join(',') + ')');
      const ids = (eqs || []).map(e => e.id); if (!ids.length) return res.status(200).json({ ok: true, jugadores: [] });
      const lista = ids.map(encodeURIComponent).join(',');
      let filtro = '';
      if (!esAdm) {
        const g = await sb('goles?select=jugador_id&equipo_id=in.(' + lista + ')&limit=5000');
        const t = await sb('tarjetas?select=jugador_id&equipo_id=in.(' + lista + ')&limit=5000');
        const js = [...new Set([...(g || []), ...(t || [])].map(x => x.jugador_id).filter(Boolean))];
        if (!js.length) return res.status(200).json({ ok: true, jugadores: [] });
        filtro = '&id=in.(' + js.map(encodeURIComponent).join(',') + ')';
      }
      const cols = esAdm ? 'id,equipo_id,nombre,num,socio,invitado,orden' : 'id,equipo_id,nombre,num';
      const rows = await sb('jugadores?select=' + cols + '&activo=eq.true&equipo_id=in.(' + lista + ')' + filtro + '&order=orden,id&limit=5000');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, jugadores: rows || [] });
    }

    // ---- VINCULAR EL TELÉFONO A LA SESIÓN (avisos push): la identidad la decide el servidor ----
    if (accion === 'push_vincular') {
      const pt = String(body.push_token || '').slice(0, 400);
      if (!pt) return res.status(400).json({ ok: false });
      let clave = null;
      const adm = readToken(body.token);
      if (adm && adm.c) clave = String(adm.c).toLowerCase();
      else {
        const u = await authUser(String(body.access_token || ''));
        if (!u) return res.status(401).json({ ok: false });
        const cs = await sb('cuentas?select=socio&auth_uid=eq.' + encodeURIComponent(u.id) + '&limit=1');
        clave = (cs && cs[0] && cs[0].socio) ? String(cs[0].socio) : (u.email || null);
      }
      if (!clave) return res.status(200).json({ ok: true });
      await sb('gtc_push_tokens?token=eq.' + encodeURIComponent(pt), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ sess_key: clave, updated_at: new Date().toISOString() }) });
      return res.status(200).json({ ok: true });
    }

    // resto de acciones requieren token
    const sess = readToken(body.token);
    if (!sess) return res.status(401).json({ ok: false, msg: 'Sesión expirada. Vuelve a entrar.' });
    const puedeEscribir = ROLES_WRITE.indexOf(sess.r) >= 0;
    const puedeLeer = ROLES_READ.indexOf(sess.r) >= 0;

    // ---- ANALÍTICA (lectura) ----
    if (accion === 'analitica') {
      if (!puedeLeer) return res.status(403).json({ ok: false, msg: 'Sin permiso.' });
      const dias = Math.min(90, Math.max(1, parseInt(body.dias || 30, 10)));
      const desde = new Date(Date.now() - dias * 86400000).toISOString();
      // Supabase entrega como máximo 1000 filas por consulta: se pide por páginas hasta traer todo el periodo.
      const ev = [];
      for (let from = 0; from < 60000; from += 1000) {
        const r = await fetch(URL + '/rest/v1/eventos?select=tipo,sesion,rol,socio,nombre,vista,plataforma,ua,created_at&created_at=gte.' + encodeURIComponent(desde) + '&order=created_at.desc',
          { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Range-Unit': 'items', Range: from + '-' + (from + 999) } });
        if (!r.ok) break;
        const rows = await r.json();
        ev.push(...rows);
        if (rows.length < 1000) break;
      }
      // Fuera de la cuenta: pruebas automáticas, robots y la cuenta demo del revisor de Apple (socio 9999).
      const PRUEBA = /headless|playwright|bot\b|bot\/|crawl|spider|vercel|lighthouse|preview/i;
      const demo = new Set(ev.filter(e => /^0*9999$/.test(String(e.socio || ''))).map(e => e.sesion));
      const limpio = ev.filter(e => e.sesion && !PRUEBA.test(e.ua || '') && !demo.has(e.sesion));
      // Equipo GTC: dispositivos que entraron con un rol de administración (no se cuentan como socios).
      const equipo = new Set(limpio.filter(e => ['superadmin', 'deportes', 'comision', 'directorio'].indexOf(e.rol) >= 0).map(e => e.sesion));
      const soc = limpio.filter(e => !equipo.has(e.sesion));
      // Desde el 16-oct-2026 la app registra 'android'/'ios' solo dentro de la app instalada (antes también el navegador del teléfono).
      // Para los registros anteriores se reconoce la app por su navegador interno: '; wv)' en Android y sin 'Safari/' en iPhone.
      const CORTE = '2026-10-16T12:30:00Z';
      const esApp = e => (e.plataforma === 'android' || e.plataforma === 'ios') && (e.created_at >= CORTE || (e.plataforma === 'android' ? /; wv\)/.test(e.ua || '') : !/Safari\//.test(e.ua || '') && !/FBAN|FBAV|Instagram|WhatsApp|GSA\//.test(e.ua || '')));
      const disp = { android: new Set(), ios: new Set(), web: new Set() }, vistas = {}, porDia = {}, socios = new Set(), quien = {};
      let pv = 0, logins = 0;
      soc.forEach(e => {
        const pl = esApp(e) ? e.plataforma : 'web';
        disp[pl].add(e.sesion);
        if (e.tipo === 'vista') { pv++; if (e.vista) vistas[e.vista] = (vistas[e.vista] || 0) + 1; }
        if (e.tipo === 'login_socio') { logins++; if (e.nombre) quien[e.nombre] = (quien[e.nombre] || 0) + 1; }
        if (e.rol === 'socio' && e.socio) socios.add(String(e.socio).replace(/^0+/, ''));
        const d = new Date(new Date(e.created_at).getTime() - 5 * 3600000).toISOString().slice(0, 10);
        (porDia[d] = porDia[d] || new Set()).add(e.sesion);
      });
      const eqVistas = limpio.filter(e => equipo.has(e.sesion) && e.tipo === 'vista').length;
      const top = o => Object.keys(o).map(k => [k, o[k]]).sort((x, y) => y[1] - x[1]);
      let cuentas = null, avisos = null;
      try { const c = await fetch(URL + '/rest/v1/cuentas?select=id', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact', Range: '0-0' } }); cuentas = parseInt(String(c.headers.get('content-range') || '').split('/')[1], 10); } catch (e) { }
      const avPl = { ios: 0, android: 0 };
      try { const t = await sb('gtc_push_tokens?select=platform&limit=10000'); (t || []).forEach(x => { if (avPl[x.platform] != null) avPl[x.platform]++; }); avisos = (t || []).length; } catch (e) { }
      const primero = ev.length ? ev[ev.length - 1].created_at : null;
      return res.status(200).json({
        ok: true, v: 2, dias, desde: primero,
        telefonos: { android: disp.android.size, ios: disp.ios.size }, web: disp.web.size,
        socios: socios.size, logins, paginas: pv,
        cuentas: isNaN(cuentas) ? null : cuentas, avisos: isNaN(avisos) ? null : avisos, avisosPl: avPl,
        vistas: top(vistas).slice(0, 12), topSocios: top(quien).slice(0, 20),
        porDia: Object.keys(porDia).sort().map(d => [d, porDia[d].size]),
        equipo: { dispositivos: equipo.size, paginas: eqVistas },
        excluidos: ev.length - limpio.length, total: ev.length
      });
    }

    // ---- SRI: cédula -> nombre completo (catastro RUC) ----
    if (accion === 'sri_batch') {
      if (!puedeLeer) return res.status(403).json({ ok: false, msg: 'Sin permiso.' });
      const ceds = (body.cedulas || []).slice(0, 60);
      const SRI = 'https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPersonaDesdeRucPorIdentificacion?numeroRuc=';
      async function one(c) {
        const ruc = String(c).replace(/\D/g, '');
        if (ruc.length !== 10) return [c, null];
        try {
          const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
          const r = await fetch(SRI + ruc + '001', { headers: { Accept: 'application/json' }, signal: ac.signal });
          clearTimeout(t);
          if (!r.ok) return [c, null];
          const j = await r.json();
          return [c, j && j.nombreCompleto ? j.nombreCompleto : null];
        } catch (e) { return [c, null]; }
      }
      const q = ceds.slice(); const out = {};
      async function worker() { while (q.length) { const c = q.shift(); const [k, v] = await one(c); out[k] = v; } }
      await Promise.all(Array.from({ length: 8 }, worker));
      return res.status(200).json({ ok: true, names: out });
    }

    // ---- CUENTAS / CONTACTOS (lectura, solo superadmin por ser datos personales) ----
    if (accion === 'aviso_enviar' || accion === 'aviso_contar' || accion === 'aviso_prueba') {
      if (['superadmin', 'deportes', 'comision'].indexOf(sess.r) < 0) return res.status(403).json({ ok: false, msg: 'Solo la Comisión, Deportes y el superadministrador pueden enviar avisos.' });
      const tit = String(body.titulo || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
      const msj = String(body.mensaje || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (accion === 'aviso_prueba') {
        if (tit.length < 3 || msj.length < 5) return res.status(400).json({ ok: false, msg: 'Escribe un título y un mensaje.' });
        const c = await enviarCorreos([String(sess.c || '')], '[Prueba] ' + tit, { tipo: 'prueba', etiqueta: 'Prueba · así lo verán los socios', titulo: tit, preheader: msj, parrafos: [msj] });
        return res.status(200).json({ ok: !c.error && c.enviados > 0, correo: sess.c, msg: c.error ? 'No se pudo enviar la prueba.' : undefined });
      }
      const alc = String(body.alcance || '');
      let equipos = null, alcTxt = 'todos';
      if (alc === 'categoria') {
        const cat = String(body.cat || '');
        if (!/^[A-Z0-9]{2,4}$/.test(cat)) return res.status(400).json({ ok: false, msg: 'Elige la categoría.' });
        const eqs = await sb('equipos?select=id&cat=eq.' + encodeURIComponent(cat) + '&tor=eq.olimpiadas2026');
        equipos = (eqs || []).map(e => e.id); alcTxt = 'categoría ' + cat;
        if (!equipos.length) return res.status(400).json({ ok: false, msg: 'Esa categoría no tiene equipos.' });
      } else if (alc === 'equipo') {
        const eid = String(body.equipo_id || '');
        const eqs = eid ? await sb('equipos?select=id&id=eq.' + encodeURIComponent(eid)) : [];
        if (!eqs || !eqs.length) return res.status(400).json({ ok: false, msg: 'Elige el equipo.' });
        equipos = [eid]; alcTxt = 'equipo ' + eid;
      } else if (alc !== 'todos') return res.status(400).json({ ok: false, msg: 'Elige a quién va el aviso.' });
      if (accion === 'aviso_contar') {
        const d = await destinatarios(equipos);
        let tel = d.sessKeys.length;
        if (d.todos) { const t = await sb('gtc_push_tokens?select=token&limit=10000'); tel = (t || []).length; }
        return res.status(200).json({ ok: true, telefonos: tel, correos: d.correos.length });
      }
      if (tit.length < 3 || msj.length < 5) return res.status(400).json({ ok: false, msg: 'Escribe un título y un mensaje.' });
      const CATN = { I1: 'Infantil 1', I2: 'Infantil 2', I3: 'Infantil 3', I4: 'Infantil 4', J1: 'Juvenil 1', J2: 'Juvenil 2', J3: 'Juvenil 3', SEN: 'Senior', MAS: 'Máster', DAM: 'Damas' };
      let alcNombre = 'Todos los socios';
      if (alc === 'categoria') alcNombre = 'Categoría ' + (CATN[body.cat] || body.cat);
      if (alc === 'equipo') { const en = await sb('equipos?select=nombre&id=eq.' + encodeURIComponent(String(body.equipo_id))); alcNombre = 'Equipo ' + String(((en || [])[0] || {}).nombre || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()); }
      const r = await avisar({
        clave: 'anu:' + Date.now().toString(36) + ':' + crypto.randomBytes(3).toString('hex'), tipo: 'anuncio', alcance: alcTxt, autor: sess.c,
        equipos, titulo: tit, cuerpo: msj, asunto: tit, correo: body.correo !== false,
        mail: { tipo: 'anuncio', titulo: tit, preheader: msj, parrafos: [msj], filas: [['Para', alcNombre]] }
      });
      return res.status(200).json({ ...r, ok: true, aviso: r.error || null });
    }
    if (accion === 'avisos_list') {
      if (!puedeLeer) return res.status(403).json({ ok: false, msg: 'Sin acceso.' });
      const rows = await sb('gtc_avisos_log?select=tipo,partido_id,alcance,autor,titulo,cuerpo,push,correos,error,creado&order=creado.desc&limit=40');
      return res.status(200).json({ ok: true, avisos: rows || [] });
    }

    if (accion === 'cuentas_list') {
      if (sess.r !== 'superadmin' && sess.r !== 'directorio') return res.status(403).json({ ok: false, msg: 'Solo el superadministrador y el Directorio pueden ver los contactos.' });
      const rows = await sb('cuentas?select=nombre,socio,equipo_id,cat,correo,whatsapp,consent,plataforma,created_at,last_login&order=last_login.desc&limit=3000');
      return res.status(200).json({ ok: true, cuentas: rows || [] });
    }

    // ---- escrituras ----
    if (!puedeEscribir) return res.status(403).json({ ok: false, msg: 'Tu rol puede ver todo pero no editar. Solo Deportes y el superadministrador registran resultados y cambios.' });

    if (accion === 'resultado') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const gl = body.gl == null || body.gl === '' ? null : parseInt(body.gl, 10);
      const gv = body.gv == null || body.gv === '' ? null : parseInt(body.gv, 10);
      if ((gl != null && !(gl >= 0)) || (gv != null && !(gv >= 0))) return res.status(400).json({ ok: false, msg: 'Marcador no válido.' });
      const estado = (gl != null && gv != null) ? 'fin' : 'pre';
      const patch = { gl, gv, estado, updated_at: new Date().toISOString() };
      if ('detalle' in body) {
        const det = limpiarDetalle(body.detalle);
        if (det === false) return res.status(400).json({ ok: false, msg: 'La planilla del partido no es válida.' });
        patch.detalle = estado === 'fin' ? det : null;
      } else {
        // Panel sin planilla (app 1.1.2 o deportes sin sets): el marcador nuevo invalida la planilla anterior.
        patch.detalle = null;
      }
      await sb('partidos?id=eq.' + encodeURIComponent(pid), {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify(patch)
      });
      // reemplazar goles y tarjetas de ese partido
      await sb('goles?partido_id=eq.' + encodeURIComponent(pid), { method: 'DELETE', prefer: 'return=minimal' });
      await sb('tarjetas?partido_id=eq.' + encodeURIComponent(pid), { method: 'DELETE', prefer: 'return=minimal' });
      const goles = (body.goles || []).filter(g => g.jugador_id && +g.cantidad > 0)
        .map(g => ({ partido_id: pid, jugador_id: g.jugador_id, equipo_id: g.equipo_id || null, cantidad: parseInt(g.cantidad, 10) }));
      const tarjetas = (body.tarjetas || []).filter(t => t.jugador_id && +t.cantidad > 0)
        .flatMap(t => Array.from({ length: parseInt(t.cantidad, 10) }, () => ({ partido_id: pid, jugador_id: t.jugador_id, equipo_id: t.equipo_id || null, tipo: t.tipo === 'roja' ? 'roja' : 'amarilla' })));
      if (goles.length) await sb('goles', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(goles) });
      if (tarjetas.length) await sb('tarjetas', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(tarjetas) });
      // Aviso automático a los dos equipos (una sola vez por marcador; si se corrige, sale el marcador nuevo)
      let aviso = null;
      if (estado === 'fin' && body.avisar !== false) {
        try { aviso = await avisoResultado(pid, sess.c); } catch (e) { aviso = { ok: false, error: 'No se pudo enviar el aviso.' }; }
      }
      return res.status(200).json({ ok: true, estado, aviso });
    }

    if (accion === 'partido_edit') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const cur = await sb('partidos?select=id,cat,local_id,visita_id,tor,fecha,hora,sede&id=eq.' + encodeURIComponent(pid));
      if (!cur || !cur.length) return res.status(404).json({ ok: false, msg: 'El partido no existe.' });
      const p0 = cur[0];
      const patch = {};
      ['fecha', 'hora', 'sede', 'local_id', 'visita_id', 'cat', 'fase', 'disciplina'].forEach(k => {
        if (body[k] != null && body[k] !== '') patch[k] = body[k];
      });
      const nl = patch.local_id || p0.local_id, nv = patch.visita_id || p0.visita_id;
      const cambianEquipos = nl !== p0.local_id || nv !== p0.visita_id;
      if (cambianEquipos) {
        if (nl === nv) return res.status(400).json({ ok: false, msg: 'El local y el visitante no pueden ser el mismo equipo.' });
        const eqs = await sb('equipos?select=id,cat,tor&id=in.(' + [nl, nv].map(encodeURIComponent).join(',') + ')');
        if (!eqs || eqs.length !== 2) return res.status(400).json({ ok: false, msg: 'Alguno de los equipos no existe.' });
        const tor = p0.tor || 'olimpiadas2026';
        if (eqs.some(e => (e.tor || 'olimpiadas2026') !== tor)) return res.status(400).json({ ok: false, msg: 'Los equipos deben ser del mismo torneo del partido.' });
        if (tor === 'olimpiadas2026' && eqs.some(e => e.cat !== (patch.cat || p0.cat))) return res.status(400).json({ ok: false, msg: 'Los dos equipos deben ser de la categoría del partido.' });
      }
      patch.updated_at = new Date().toISOString();
      if (cambianEquipos) patch.detalle = null; // la planilla tenía jugadores de los equipos anteriores
      await sb('partidos?id=eq.' + encodeURIComponent(pid), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
      if (cambianEquipos) {
        // goles y tarjetas de jugadores de los equipos que salieron del partido ya no corresponden
        const fuera = 'not.in.(' + [nl, nv].map(encodeURIComponent).join(',') + ')';
        await sb('goles?partido_id=eq.' + encodeURIComponent(pid) + '&equipo_id=' + fuera, { method: 'DELETE', prefer: 'return=minimal' });
        await sb('tarjetas?partido_id=eq.' + encodeURIComponent(pid) + '&equipo_id=' + fuera, { method: 'DELETE', prefer: 'return=minimal' });
      }
      // Cambio de fecha, hora o cancha: aviso inmediato a los dos equipos
      const cambiaHorario = ['fecha', 'hora', 'sede'].some(k => patch[k] != null && String(patch[k]) !== String(p0[k] == null ? '' : p0[k]));
      let aviso = null;
      if (cambiaHorario && body.avisar !== false) {
        try { aviso = await avisoCambio(pid, sess.c); } catch (e) { aviso = { ok: false, error: 'No se pudo enviar el aviso.' }; }
      }
      return res.status(200).json({ ok: true, cambianEquipos, aviso });
    }

    if (accion === 'partido_del') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const cur = await sb('partidos?select=id&id=eq.' + encodeURIComponent(pid));
      if (!cur || !cur.length) return res.status(404).json({ ok: false, msg: 'El partido ya no existe.' });
      // goles y tarjetas se borran en cascada (FK ON DELETE CASCADE)
      await sb('partidos?id=eq.' + encodeURIComponent(pid), { method: 'DELETE', prefer: 'return=minimal' });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'partido_add') {
      const row = { tor: body.tor || 'olimpiadas2026', tipo: body.tipo === 'gen' ? 'gen' : 'vs', gl: null, gv: null, estado: 'pre' };
      ['disciplina', 'cat', 'fase', 'fecha', 'hora', 'sede', 'local_id', 'visita_id'].forEach(k => {
        if (body[k] != null && String(body[k]) !== '') row[k] = body[k];
      });
      // Fecha general (natación, carrera…): compiten todos los equipos de la categoría (o de todas), sin local ni visitante.
      if (row.tipo === 'gen') {
        delete row.local_id; delete row.visita_id; row.fase = 'general';
        if (!row.disciplina || !row.fecha) return res.status(400).json({ ok: false, msg: 'Faltan datos: disciplina y fecha.' });
      } else
      if (!row.disciplina || !row.fecha || !row.local_id || !row.visita_id)
        return res.status(400).json({ ok: false, msg: 'Faltan datos: disciplina, fecha y ambos equipos.' });
      if (row.tipo !== 'gen' && row.local_id === row.visita_id)
        return res.status(400).json({ ok: false, msg: 'El equipo local y el visitante no pueden ser el mismo.' });
      // id correlativo pXXXX (a partir del mayor existente); si no se puede, uno único por tiempo
      let id = 'p' + Date.now().toString(36);
      try {
        const ex = await sb('partidos?select=id&id=like.p*&order=id.desc&limit=1');
        if (ex && ex[0] && /^p\d+$/.test(ex[0].id))
          id = 'p' + String(parseInt(ex[0].id.slice(1), 10) + 1).padStart(4, '0');
      } catch (e) { /* usa el id por tiempo */ }
      row.id = id;
      const r = await sb('partidos', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, partido: (r || [])[0] });
    }

    // ---- CAMPEONATOS INDIVIDUALES (un deporte, nombre libre) ----
    const CAMP_DISC = ['futbol', 'padel', 'tenis', 'pickleball', 'beachvolley'];
    const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));

    if (accion === 'torneo_add') {
      const nombre = String(body.nombre || '').trim().slice(0, 60);
      const disciplina = String(body.disciplina || '');
      if (nombre.length < 3) return res.status(400).json({ ok: false, msg: 'Escribe el nombre del campeonato.' });
      if (CAMP_DISC.indexOf(disciplina) < 0) return res.status(400).json({ ok: false, msg: 'Deporte no válido.' });
      if (!fechaOk(body.desde)) return res.status(400).json({ ok: false, msg: 'Falta la fecha de inicio.' });
      const row = {
        id: 'c-' + (slug(nombre) || 'campeonato') + '-' + Date.now().toString(36).slice(-5),
        nombre, disciplina, estado: 'curso', desde: body.desde,
        hasta: fechaOk(body.hasta) ? body.hasta : body.desde, creado_por: sess.c
      };
      const r = await sb('torneos', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, torneo: (r || [])[0] || row });
    }

    if (accion === 'torneo_edit') {
      const id = String(body.id || '');
      if (!id || id === 'olimpiadas2026') return res.status(400).json({ ok: false, msg: 'Campeonato no válido.' });
      const patch = {};
      if (body.nombre && String(body.nombre).trim().length >= 3) patch.nombre = String(body.nombre).trim().slice(0, 60);
      if (fechaOk(body.desde)) patch.desde = body.desde;
      if (fechaOk(body.hasta)) patch.hasta = body.hasta;
      if (body.estado === 'curso' || body.estado === 'finalizado') patch.estado = body.estado;
      await sb('torneos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true });
    }

    const CATS_OLI = ['I1', 'I2', 'I3', 'I4', 'J1', 'J2', 'J3', 'SEN', 'MAS', 'DAM'];
    if (accion === 'equipo_add') {
      const tor = String(body.tor || '');
      const nombre = String(body.nombre || '').trim().slice(0, 50);
      const delegado = String(body.delegado || '').trim().slice(0, 80) || null;
      if (nombre.length < 2) return res.status(400).json({ ok: false, msg: 'Escribe el nombre del equipo.' });
      let id, row;
      if (tor === 'olimpiadas2026') {
        const cat = String(body.cat || '');
        if (CATS_OLI.indexOf(cat) < 0) return res.status(400).json({ ok: false, msg: 'Elige la categoría del equipo.' });
        id = cat.toLowerCase() + '-' + (slug(nombre) || 'equipo');
        row = { id, tor, cat, nombre: nombre.toUpperCase(), delegado };
      } else {
        if (!tor) return res.status(400).json({ ok: false, msg: 'Campeonato no válido.' });
        const t = await sb('torneos?select=id&id=eq.' + encodeURIComponent(tor));
        if (!t || !t.length) return res.status(404).json({ ok: false, msg: 'El campeonato no existe.' });
        id = tor + '-' + (slug(nombre) || 'equipo');
        row = { id, tor, cat: 'GEN', nombre: nombre.toUpperCase(), delegado };
      }
      const ex = await sb('equipos?select=id&id=eq.' + encodeURIComponent(id));
      if (ex && ex.length) return res.status(400).json({ ok: false, msg: 'Ya existe un equipo con ese nombre en esa categoría.' });
      const r = await sb('equipos', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, equipo: (r || [])[0] || row });
    }

    if (accion === 'equipo_edit') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ ok: false, msg: 'Falta el equipo.' });
      const patch = {};
      if (body.nombre != null) {
        const n = String(body.nombre).trim().slice(0, 50);
        if (n.length < 2) return res.status(400).json({ ok: false, msg: 'Escribe el nombre del equipo.' });
        patch.nombre = n.toUpperCase();
      }
      if (body.delegado != null) patch.delegado = String(body.delegado).trim().slice(0, 80) || null;
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, msg: 'No hay cambios.' });
      await sb('equipos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'equipo_del') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ ok: false, msg: 'Falta el equipo.' });
      const e = await sb('equipos?select=id&id=eq.' + encodeURIComponent(id));
      if (!e || !e.length) return res.status(404).json({ ok: false, msg: 'El equipo ya no existe.' });
      const q = encodeURIComponent(id);
      const ps = await sb('partidos?select=id&or=(local_id.eq.' + q + ',visita_id.eq.' + q + ')');
      // 1) sus partidos (goles y tarjetas de esos partidos caen en cascada)
      if (ps && ps.length) await sb('partidos?or=(local_id.eq.' + q + ',visita_id.eq.' + q + ')', { method: 'DELETE', prefer: 'return=minimal' });
      // 2) restos con referencia directa al equipo
      await sb('goles?equipo_id=eq.' + q, { method: 'DELETE', prefer: 'return=minimal' });
      await sb('tarjetas?equipo_id=eq.' + q, { method: 'DELETE', prefer: 'return=minimal' });
      await sb('resultados_prueba?equipo_id=eq.' + q, { method: 'DELETE', prefer: 'return=minimal' });
      // 3) el equipo (su nómina se borra en cascada)
      await sb('equipos?id=eq.' + q, { method: 'DELETE', prefer: 'return=minimal' });
      return res.status(200).json({ ok: true, partidos: (ps || []).length });
    }

    // ---- NATACIÓN / CARRERA: puestos por prueba (reemplaza los de esa disciplina y categoría) ----
    if (accion === 'prueba_guardar') {
      const disc = String(body.disciplina || '');
      const cat = String(body.cat || '');
      if (['natacion', 'carrera'].indexOf(disc) < 0) return res.status(400).json({ ok: false, msg: 'Disciplina no válida.' });
      if (!/^[A-Z0-9]{2,4}$/.test(cat)) return res.status(400).json({ ok: false, msg: 'Categoría no válida.' });
      const filas = (Array.isArray(body.filas) ? body.filas : [])
        .map(f => ({ tor: 'olimpiadas2026', disciplina: disc, cat, prueba: String(f.prueba || '').slice(0, 12), posicion: parseInt(f.posicion, 10), equipo_id: String(f.equipo_id || '') }))
        .filter(f => f.prueba && f.posicion >= 1 && f.posicion <= 6 && f.equipo_id);
      const ids = [...new Set(filas.map(f => f.equipo_id))];
      if (ids.length) {
        const eqs = await sb('equipos?select=id,cat&id=in.(' + ids.map(encodeURIComponent).join(',') + ')');
        const ok = new Set((eqs || []).filter(e => e.cat === cat).map(e => e.id));
        if (ids.some(id => !ok.has(id))) return res.status(400).json({ ok: false, msg: 'Hay equipos que no pertenecen a esta categoría.' });
      }
      const claves = new Set();
      for (const f of filas) { const k = f.prueba + '|' + f.posicion; if (claves.has(k)) return res.status(400).json({ ok: false, msg: 'Un puesto está repetido en la misma prueba.' }); claves.add(k); }
      await sb('resultados_prueba?tor=eq.olimpiadas2026&disciplina=eq.' + disc + '&cat=eq.' + cat, { method: 'DELETE', prefer: 'return=minimal' });
      if (filas.length) await sb('resultados_prueba', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(filas) });
      return res.status(200).json({ ok: true, n: filas.length });
    }

    if (accion === 'jugador_cedulas') {
      const eq = String(body.equipo_id || ''); if (!eq) return res.status(400).json({ ok: false, msg: 'Falta el equipo.' });
      const rows = await sb('jugadores?select=id,ced_real&equipo_id=eq.' + encodeURIComponent(eq));
      const out = {}; (rows || []).forEach(r => { if (r.ced_real) out[r.id] = r.ced_real; });
      return res.status(200).json({ ok: true, cedulas: out });
    }

    if (accion === 'jugador_add') {
      const row = {
        equipo_id: body.equipo_id, nombre: String(body.nombre || '').trim(),
        num: body.num || null, socio: body.socio ? String(body.socio).replace(/\D/g, '') : null,
        ced_real: cedNorm(body.cedula).length === 10 ? cedNorm(body.cedula) : null,
        invitado: !!body.invitado, activo: true, orden: body.orden || 999
      };
      if (!row.equipo_id || !row.nombre) return res.status(400).json({ ok: false, msg: 'Falta equipo o nombre.' });
      const r = await sb('jugadores', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, jugador: (r || [])[0] });
    }

    if (accion === 'jugador_edit') {
      const id = String(body.id || ''); if (!id) return res.status(400).json({ ok: false, msg: 'Falta el jugador.' });
      const patch = {};
      ['nombre', 'num', 'socio', 'invitado', 'activo', 'equipo_id', 'orden'].forEach(k => {
        if (body[k] !== undefined) patch[k] = (k === 'socio') && body[k] ? String(body[k]).replace(/\D/g, '') : body[k];
      });
      // la cédula solo se cambia si llega una válida (10 dígitos); vacía = no tocar
      if (cedNorm(body.cedula).length === 10) patch.ced_real = cedNorm(body.cedula);
      await sb('jugadores?id=eq.' + encodeURIComponent(id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'jugador_del') {
      const id = String(body.id || ''); if (!id) return res.status(400).json({ ok: false, msg: 'Falta el jugador.' });
      // borrado suave: activo=false (conserva historial de goles)
      await sb('jugadores?id=eq.' + encodeURIComponent(id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ activo: false }) });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, msg: 'Acción no válida.' });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.data || String(e) });
  }
}
