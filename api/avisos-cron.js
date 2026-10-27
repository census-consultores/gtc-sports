// GTC Sports — recordatorio diario de partidos (Vercel Cron, 07:00 de Guayaquil).
// Avisa por push y correo a los integrantes de los dos equipos de cada partido del día, con hora y cancha.
// Cada recordatorio queda en gtc_avisos_log: aunque esta ruta se llame varias veces, sale una sola vez por partido.
import { recordatoriosDelDia } from '../lib/avisos.js';
import { recordatoriosTP } from '../lib/tp-api.js';

const SB = process.env.SUPABASE_URL || 'https://zwuieoenhwychdbzrsif.supabase.co';
async function sb(path) {
  const r = await fetch(SB + '/rest/v1/' + path, { headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY } });
  if (!r.ok) throw { status: r.status, data: await r.text() };
  return r.json();
}

export default async function handler(req, res) {
  const cron = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  const ua = String(req.headers['user-agent'] || '');
  if (cron ? auth !== 'Bearer ' + cron : ua.indexOf('vercel-cron') < 0) return res.status(401).json({ ok: false });
  try {
    const r = await recordatoriosDelDia();
    // torneos del módulo de torneos: si la tabla aún no existe o falla, no frena los recordatorios de las Olimpiadas
    let tp = {}; try { tp = await recordatoriosTP(sb); } catch (e) { tp = { errorTP: String((e && (e.message || JSON.stringify(e.data || e))) || e).slice(0, 200) }; }
    return res.status(200).json({ ok: true, ...r, ...tp });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && (e.message || JSON.stringify(e.data || e))) || e).slice(0, 300) });
  }
}
