// GTC Sports — función serverless de administración (Vercel + Supabase)
// Usa la SECRET key de Supabase (bypassa RLS). Variables en Vercel:
//   SUPABASE_URL, SUPABASE_SECRET_KEY
// Acciones (POST JSON {accion, ...}):
//   login            {correo, clave}                       -> {ok, token, nombre, rol, correo}
//   resultado        {token, partido_id, gl, gv, goles[], tarjetas[]}
//   partido_edit     {token, partido_id, fecha, hora, sede, local_id, visita_id}
//   jugador_add      {token, equipo_id, nombre, num, socio, cedula, invitado}
//   jugador_edit     {token, id, ...campos}
//   jugador_del      {token, id}
//   analitica        {token, dias}                         -> resumen de eventos
import crypto from 'node:crypto';

const URL = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY || 'gtc-fallback';
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
  if (sign(p) !== sig) return null;
  let obj; try { obj = JSON.parse(unb64u(p)); } catch (e) { return null; }
  if (!obj || obj.exp < Date.now()) return null;
  return obj; // {c, r, exp}
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

export default async function handler(req, res) {
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

    // ---- escrituras ----
    if (!puedeEscribir) return res.status(403).json({ ok: false, msg: 'Tu rol puede ver todo pero no editar. Solo Deportes y el superadministrador registran resultados y cambios.' });

    if (accion === 'resultado') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const gl = body.gl == null || body.gl === '' ? null : parseInt(body.gl, 10);
      const gv = body.gv == null || body.gv === '' ? null : parseInt(body.gv, 10);
      const estado = (gl != null && gv != null) ? 'fin' : 'pre';
      await sb('partidos?id=eq.' + encodeURIComponent(pid), {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ gl, gv, estado, updated_at: new Date().toISOString() })
      });
      // reemplazar goles y tarjetas de ese partido
      await sb('goles?partido_id=eq.' + encodeURIComponent(pid), { method: 'DELETE', prefer: 'return=minimal' });
      await sb('tarjetas?partido_id=eq.' + encodeURIComponent(pid), { method: 'DELETE', prefer: 'return=minimal' });
      const goles = (body.goles || []).filter(g => g.jugador_id && +g.cantidad > 0)
        .map(g => ({ partido_id: pid, jugador_id: g.jugador_id, equipo_id: g.equipo_id || null, cantidad: parseInt(g.cantidad, 10) }));
      const tarjetas = (body.tarjetas || []).filter(t => t.jugador_id && +t.cantidad > 0)
        .flatMap(t => Array.from({ length: parseInt(t.cantidad, 10) }, () => ({ partido_id: pid, jugador_id: t.jugador_id, equipo_id: t.equipo_id || null, tipo: t.tipo || 'amarilla' })));
      if (goles.length) await sb('goles', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(goles) });
      if (tarjetas.length) await sb('tarjetas', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(tarjetas) });
      return res.status(200).json({ ok: true, estado });
    }

    if (accion === 'partido_edit') {
      const pid = String(body.partido_id || '');
      if (!pid) return res.status(400).json({ ok: false, msg: 'Falta el partido.' });
      const patch = {};
      ['fecha', 'hora', 'sede', 'local_id', 'visita_id', 'cat', 'fase', 'disciplina'].forEach(k => {
        if (body[k] != null && body[k] !== '') patch[k] = body[k];
      });
      patch.updated_at = new Date().toISOString();
      await sb('partidos?id=eq.' + encodeURIComponent(pid), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'jugador_add') {
      const row = {
        equipo_id: body.equipo_id, nombre: String(body.nombre || '').trim(),
        num: body.num || null, socio: body.socio ? String(body.socio).replace(/\D/g, '') : null,
        cedula: body.cedula ? String(body.cedula).replace(/\D/g, '') : null,
        invitado: !!body.invitado, activo: true, orden: body.orden || 999
      };
      if (!row.equipo_id || !row.nombre) return res.status(400).json({ ok: false, msg: 'Falta equipo o nombre.' });
      const r = await sb('jugadores', { method: 'POST', body: JSON.stringify(row) });
      return res.status(200).json({ ok: true, jugador: (r || [])[0] });
    }

    if (accion === 'jugador_edit') {
      const id = String(body.id || ''); if (!id) return res.status(400).json({ ok: false, msg: 'Falta el jugador.' });
      const patch = {};
      ['nombre', 'num', 'socio', 'cedula', 'invitado', 'activo', 'equipo_id', 'orden'].forEach(k => {
        if (body[k] !== undefined) patch[k] = (k === 'socio' || k === 'cedula') && body[k] ? String(body[k]).replace(/\D/g, '') : body[k];
      });
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
