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
import crypto from 'node:crypto';

const URL = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ROLES_WRITE = ['superadmin', 'deportes'];
const ROLES_READ = ['superadmin', 'deportes', 'comision', 'directorio'];

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
      if (!rows || !rows.length) return res.status(200).json({ ok: false, campo: 'cedula', msg: 'No encontramos esa cédula. Verifica los datos o escribe a deportes@gtcsports.ec.' });
      const match = rows.filter(j => socioIgual(socio, j.socio));
      if (!match.length) return res.status(200).json({ ok: false, campo: 'socio', msg: 'La cédula existe, pero el código de socio no coincide. Revisa tu número de socio o escribe a deportes@gtcsports.ec.' });
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
      // 2) borrar los datos personales de contacto del socio (tabla cuentas)
      try {
        await sb('cuentas?auth_uid=eq.' + encodeURIComponent(uid), { method: 'DELETE', prefer: 'return=minimal' });
        if (email) await sb('cuentas?auth_email=eq.' + encodeURIComponent(email), { method: 'DELETE', prefer: 'return=minimal' });
      } catch (e) { /* si no hay fila, continuar: lo esencial es eliminar la identidad de acceso */ }
      // 3) borrar la identidad de acceso (Apple / Google / correo) en Supabase Auth
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
      const ev = await sb('eventos?select=tipo,sesion,rol,socio,nombre,vista,plataforma,standalone,created_at&created_at=gte.' + encodeURIComponent(desde) + '&order=created_at.desc&limit=5000');
      const sesiones = {}, vistas = {}, plat = {}, tipos = {}, instal = {}, porDia = {}, socios = {};
      (ev || []).forEach(e => {
        tipos[e.tipo] = (tipos[e.tipo] || 0) + 1;
        if (e.sesion) sesiones[e.sesion] = 1;
        if (e.tipo === 'vista' && e.vista) vistas[e.vista] = (vistas[e.vista] || 0) + 1;
        if (e.plataforma) plat[e.plataforma] = (plat[e.plataforma] || 0) + 1;
        if (e.tipo === 'instalar' || e.tipo === 'instalado') { instal[e.plataforma || 'web'] = (instal[e.plataforma || 'web'] || 0) + 1; }
        const d = (e.created_at || '').slice(0, 10); if (d) porDia[d] = (porDia[d] || 0) + 1;
        if ((e.tipo === 'login' || e.tipo === 'login_socio') && e.nombre) socios[e.nombre] = (socios[e.nombre] || 0) + 1;
      });
      const top = o => Object.keys(o).map(k => [k, o[k]]).sort((a, b) => b[1] - a[1]);
      return res.status(200).json({
        ok: true, dias, total: (ev || []).length, sesiones: Object.keys(sesiones).length,
        tipos, vistas: top(vistas).slice(0, 20), plataformas: plat, instalaciones: instal,
        porDia: Object.keys(porDia).sort().map(d => [d, porDia[d]]),
        topSocios: top(socios).slice(0, 20),
        recientes: (ev || []).slice(0, 40)
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
    if (accion === 'cuentas_list') {
      if (sess.r !== 'superadmin') return res.status(403).json({ ok: false, msg: 'Solo el superadministrador puede ver los contactos.' });
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
      return res.status(200).json({ ok: true, estado });
    }

    if (accion === 'partido_edit') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const cur = await sb('partidos?select=id,cat,local_id,visita_id,tor&id=eq.' + encodeURIComponent(pid));
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
      return res.status(200).json({ ok: true, cambianEquipos });
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
      const row = { tor: body.tor || 'olimpiadas2026', tipo: body.tipo || 'vs', gl: null, gv: null, estado: 'pre' };
      ['disciplina', 'cat', 'fase', 'fecha', 'hora', 'sede', 'local_id', 'visita_id'].forEach(k => {
        if (body[k] != null && String(body[k]) !== '') row[k] = body[k];
      });
      if (!row.disciplina || !row.fecha || !row.local_id || !row.visita_id)
        return res.status(400).json({ ok: false, msg: 'Faltan datos: disciplina, fecha y ambos equipos.' });
      if (row.local_id === row.visita_id)
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
