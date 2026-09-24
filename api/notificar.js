// GTC Sports — función serverless de notificaciones (Vercel + Resend)
// Remitente: notificaciones@gtcsports.ec (dominio verificado en Resend)
// Variables en Vercel: RESEND_API_KEY (secreta), GTC_APP_URL
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'GTC Sports <notificaciones@gtcsports.ec>';
const REPLY = ['deportes@guayaquiltenisclub.ec', 'john.arias@censusconsultores.com.ec'];
const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
const NAVY = '#1B2050';

function base(titulo, cuerpo) {
  return `<!doctype html><html><body style="margin:0;background:#eef0f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1c2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:24px 12px">
  <tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(20,25,60,.08)">
    <tr><td style="background:${NAVY};padding:22px 26px;color:#fff;font-weight:800;font-size:19px;letter-spacing:-.01em">
      GTC <span style="color:#C9A227">SPORTS</span></td></tr>
    <tr><td style="padding:26px 26px 8px;font-size:19px;font-weight:800;color:${NAVY}">${titulo}</td></tr>
    <tr><td style="padding:0 26px 24px;font-size:14px;line-height:1.7;color:#3a3d55">${cuerpo}</td></tr>
    <tr><td style="padding:18px 26px;border-top:1px solid #eceef3;font-size:11px;color:#8a8fa6;line-height:1.6">
      Guayaquil Tenis Club · Comisión de Deportes<br>
      Este correo se envió desde <b>notificaciones@gtcsports.ec</b>. Para dejar de recibirlos, escribe a deportes@gtcsports.ec.
    </td></tr>
  </table></td></tr></table></body></html>`;
}
function boton(txt, url) {
  return `<div style="margin:20px 0"><a href="${url}" style="background:${NAVY};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:11px;display:inline-block">${txt}</a></div>`;
}

const PLANTILLAS = {
  prueba: (d) => ({
    asunto: 'Prueba · GTC Sports',
    html: base('¡El correo funciona! ✅', `Hola${d.nombre ? ' ' + d.nombre : ''}, este es un correo de prueba de <b>GTC Sports</b>. Si lo estás leyendo, la conexión con el dominio <b>gtcsports.ec</b> quedó lista.` + boton('Abrir GTC Sports', APP))
  }),
  acceso: (d) => ({
    asunto: 'Tu acceso a GTC Sports',
    html: base('Tu acceso', `Hola${d.nombre ? ' ' + d.nombre : ''}, entra a GTC Sports para ver tus torneos y recibir los avisos de tus partidos.` + boton('Entrar a GTC Sports', APP))
  }),
  'proximo-partido': (d) => ({
    asunto: `Hoy juegas · ${d.local || ''} vs ${d.visitante || ''}`,
    html: base('Tu próximo partido', `<b>${d.local || ''}</b> vs <b>${d.visitante || ''}</b><br>${d.fecha || ''} · ${d.hora || ''} · ${d.sede || ''}` + boton('Ver el partido', APP))
  }),
  resultado: (d) => ({
    asunto: `Resultado · ${d.local || ''} ${d.gl ?? ''}-${d.gv ?? ''} ${d.visitante || ''}`,
    html: base('Resultado registrado', `<b>${d.local || ''} ${d.gl ?? ''} - ${d.gv ?? ''} ${d.visitante || ''}</b><br>${d.disciplina || ''} · ${d.categoria || ''}` + boton('Ver la tabla', APP))
  })
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plantilla, destinatario, datos = {} } = req.body || {};
    if (!plantilla || !destinatario) return res.status(400).json({ error: 'Faltan plantilla o destinatario' });
    const fn = PLANTILLAS[plantilla];
    if (!fn) return res.status(400).json({ error: 'Plantilla no válida' });
    const { asunto, html } = fn(datos);
    const { data, error } = await resend.emails.send({ from: FROM, to: destinatario, replyTo: REPLY, subject: asunto, html });
    if (error) return res.status(502).json({ error });
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
