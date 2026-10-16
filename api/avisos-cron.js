// GTC Sports — recordatorio diario de partidos (Vercel Cron, 07:00 de Guayaquil).
// Avisa por push y correo a los integrantes de los dos equipos de cada partido del día, con hora y cancha.
// Cada recordatorio queda en gtc_avisos_log: aunque esta ruta se llame varias veces, sale una sola vez por partido.
import { recordatoriosDelDia } from '../lib/avisos.js';

export default async function handler(req, res) {
  const cron = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  const ua = String(req.headers['user-agent'] || '');
  if (cron ? auth !== 'Bearer ' + cron : ua.indexOf('vercel-cron') < 0) return res.status(401).json({ ok: false });
  try {
    const r = await recordatoriosDelDia();
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && (e.message || JSON.stringify(e.data || e))) || e).slice(0, 300) });
  }
}
