// GTC Sports — función serverless de notificaciones (Vercel + Resend)
// Remitente: notificaciones@gtcsports.ec (dominio verificado en Resend)
// Variables en Vercel: RESEND_API_KEY (secreta), GTC_APP_URL
import { Resend } from 'resend';
import crypto from 'node:crypto';
import { plantilla } from '../lib/correo.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'GTC Sports <notificaciones@gtcsports.ec>';
const REPLY = ['deportes@guayaquiltenisclub.ec', 'john.arias@censusconsultores.com.ec'];
const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
const BAJA = { 'List-Unsubscribe': '<mailto:deportes@guayaquiltenisclub.ec?subject=Baja%20de%20avisos%20GTC%20Sports>' };
// Solo el equipo del Club (token firmado por /api/gtc-admin, roles Deportes o superadmin) puede enviar correos.
const SECRET = process.env.SUPABASE_SECRET_KEY;
function tokenOk(token) {
  if (!SECRET || !token || String(token).indexOf('.') < 0) return false;
  const [p, sig] = String(token).split('.');
  const exp = crypto.createHmac('sha256', SECRET).update(p).digest('hex');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return false;
  try {
    const o = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return !!o && o.exp > Date.now() && (o.r === 'superadmin' || o.r === 'deportes');
  } catch (e) { return false; }
}
// Todos los correos usan la plantilla única de lib/correo.js (escudo de GTC Sports y «Plataforma desarrollada por» Census Legal Tech).
const PLANTILLAS = {
  prueba: (d) => ({ asunto: 'Prueba · GTC Sports', datos: { tipo: 'prueba', titulo: '¡El correo funciona!', parrafos: [`Hola${d.nombre ? ' ' + d.nombre : ''}, este es un correo de prueba de GTC Sports. Si lo estás leyendo, la conexión con el dominio gtcsports.ec quedó lista.`] } }),
  acceso: (d) => ({ asunto: 'Tu acceso a GTC Sports', datos: { tipo: 'acceso', titulo: 'Tu acceso a GTC Sports', parrafos: [`Hola${d.nombre ? ' ' + d.nombre : ''}, entra a GTC Sports para ver tus torneos y recibir los avisos de tus partidos.`], botones: [{ txt: 'Entrar a GTC Sports', url: APP }], sinAbrir: true } }),
  'proximo-partido': (d) => ({ asunto: `Hoy juegas · ${d.local || ''} vs ${d.visitante || ''}`, datos: { tipo: 'recordatorio', titulo: 'Tu próximo partido', duelo: { local: d.local || '', visita: d.visitante || '', centro: d.hora || 'vs' }, filas: [['Fecha', d.fecha], ['Hora', d.hora], ['Cancha', d.sede]] } }),
  resultado: (d) => ({ asunto: `Resultado · ${d.local || ''} ${d.gl ?? ''}-${d.gv ?? ''} ${d.visitante || ''}`, datos: { tipo: 'resultado', titulo: 'Resultado registrado', duelo: { local: d.local || '', visita: d.visitante || '', centro: `${d.gl ?? ''} - ${d.gv ?? ''}`, marcador: true }, filas: [['Deporte', d.disciplina], ['Categoría', d.categoria]], botones: [{ txt: 'Ver la tabla', url: APP }], sinAbrir: true } })
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plantilla: tipo, destinatario, datos = {}, token } = req.body || {};
    if (!tokenOk(token)) return res.status(401).json({ error: 'No autorizado' });
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(destinatario || ''))) return res.status(400).json({ error: 'Destinatario no válido' });
    if (!tipo || !destinatario) return res.status(400).json({ error: 'Faltan plantilla o destinatario' });
    const fn = PLANTILLAS[tipo];
    if (!fn) return res.status(400).json({ error: 'Plantilla no válida' });
    const t = fn(datos || {});
    const asunto = String(t.asunto || '').replace(/[\r\n]+/g, ' ').slice(0, 150);
    const html = plantilla(t.datos);
    const { data, error } = await resend.emails.send({ from: FROM, to: destinatario, replyTo: REPLY, subject: asunto, html, headers: BAJA });
    if (error) return res.status(502).json({ error });
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
