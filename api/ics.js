// GTC Sports — calendario .ics de partidos (público: solo datos que la app ya muestra).
//   /api/ics?ids=p0326,p0327   → los partidos elegidos (un archivo para importar)
//   /api/ics?equipo=<id>       → suscripción a todos los partidos del equipo (se actualiza sola)
// Hora de Guayaquil; los eventos sin hora quedan como de todo el día.
import { evento, ics } from '../lib/cal.js';

const URL = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
const COLS = 'id,tor,tipo,disciplina,cat,fecha,hora,sede,local_id,visita_id';
async function sb(path) {
  const r = await fetch(URL + '/rest/v1/' + path, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}
const okId = s => /^[A-Za-z0-9_-]{1,64}$/.test(s);

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    let rows = [], nombre = 'GTC Sports';
    if (q.equipo && okId(String(q.equipo))) {
      const eid = String(q.equipo);
      const eq = await sb('equipos?select=id,nombre,cat&id=eq.' + eid);
      if (!eq.length) return res.status(404).send('Equipo no encontrado');
      const e = eq[0];
      rows = await sb(`partidos?select=${COLS}&or=(local_id.eq.${eid},visita_id.eq.${eid})&order=fecha.asc&limit=500`);
      const gen = await sb(`partidos?select=${COLS}&tipo=eq.gen&tor=eq.olimpiadas2026&or=(cat.is.null,cat.eq.${encodeURIComponent(e.cat || '-')})&limit=200`);
      rows = rows.concat(gen);
      nombre = 'GTC Sports · ' + String(e.nombre || '').replace(/\s+/g, ' ').trim();
    } else {
      const ids = String(q.ids || '').split(',').map(s => s.trim()).filter(okId).slice(0, 300);
      if (!ids.length) return res.status(400).send('Indica los partidos (ids) o el equipo.');
      rows = await sb(`partidos?select=${COLS}&id=in.(${ids.join(',')})&order=fecha.asc`);
      nombre = ids.length === 1 ? 'GTC Sports · partido' : 'GTC Sports · partidos';
    }
    const eqIds = [...new Set(rows.flatMap(p => [p.local_id, p.visita_id]).filter(Boolean))];
    const eqs = eqIds.length ? await sb('equipos?select=id,nombre&id=in.(' + eqIds.map(encodeURIComponent).join(',') + ')') : [];
    const tit = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
    const nom = id => tit((eqs.find(e => e.id === id) || {}).nombre || '');
    const evs = rows.map(p => evento({ ...p, nL: nom(p.local_id), nV: nom(p.visita_id) }));
    const body = ics(evs, nombre);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="gtc-sports.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(body);
  } catch (e) {
    console.error('ics', e);
    return res.status(500).send('No se pudo generar el calendario.');
  }
}
