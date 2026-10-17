// GTC Sports — plantilla ÚNICA de todos los correos (avisos automáticos, anuncios, pruebas y accesos).
// HTML de correo: tablas y estilos en línea (Gmail, Outlook y Apple Mail), ancho máximo 560 px.
export const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
const LOGO = 'https://www.gtcsports.ec/icon-192.png';            // escudo del Guayaquil Tenis Club
const CENSUS = 'https://www.gtcsports.ec/census-legal-tech.png'; // Census Legal Tech (dorado sobre fondo oscuro)
const NAVY = '#1B2050', DEEP = '#0C1030', GOLD = '#C9A227', INK = '#1A1C2E', MUTED = '#5B6079', LINE = '#E7E5DD', SOFT = '#F6F5F0';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escH(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Etiqueta de color por tipo de aviso
const TIPOS = {
  recordatorio: { txt: 'Hoy juegas', bg: '#E8F3EC', fg: '#1E7A46' },
  resultado: { txt: 'Resultado', bg: '#EEF0FA', fg: '#2E3A86' },
  cambio: { txt: 'Cambio de horario o cancha', bg: '#FBF0D6', fg: '#8A6410' },
  anuncio: { txt: 'Anuncio de la Comisión', bg: '#EEF0FA', fg: '#2E3A86' },
  prueba: { txt: 'Correo de prueba', bg: '#F0F0F0', fg: '#5B6079' },
  acceso: { txt: 'Tu acceso', bg: '#EEF0FA', fg: '#2E3A86' }
};

function boton(b, i) {
  const pri = i === 0;
  return `<a href="${escH(b.url)}" style="display:inline-block;margin:0 8px 10px 0;padding:12px 18px;border-radius:11px;font-family:${FONT};font-size:14px;font-weight:700;text-decoration:none;` +
    (pri ? `background:${NAVY};color:#ffffff;border:1px solid ${NAVY}` : `background:#ffffff;color:${NAVY};border:1px solid #CFD2DE`) + `">${escH(b.txt)}</a>`;
}

/* datos:
   tipo       recordatorio | resultado | cambio | anuncio | prueba | acceso
   titulo     frase principal (h1)
   duelo      { local, visita, centro }  → tarjeta del partido (centro = marcador o "vs")
   filas      [[etiqueta, valor], …]      → Fecha, Hora, Cancha, Categoría…
   parrafos   [texto, …]                  → párrafos justificados
   botones    [{txt, url}, …]             → el primero es el principal
   preheader  texto que muestra la bandeja de entrada junto al asunto */
export function plantilla(d) {
  const t = TIPOS[d.tipo] || TIPOS.anuncio;
  const pre = escH(d.preheader || d.titulo || '');
  const duelo = d.duelo ? `
    <tr><td style="padding:4px 28px 6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};border:1px solid ${LINE};border-radius:14px">
        <tr>
          <td width="40%" align="center" style="padding:18px 8px;font-family:${FONT};font-size:16px;font-weight:800;color:${INK};line-height:1.3">${escH(d.duelo.local)}</td>
          <td width="20%" align="center" style="padding:18px 4px;font-family:${FONT};font-size:${d.duelo.marcador ? '26px' : '14px'};font-weight:800;color:${d.duelo.marcador ? NAVY : MUTED};white-space:nowrap">${escH(d.duelo.centro || 'vs')}</td>
          <td width="40%" align="center" style="padding:18px 8px;font-family:${FONT};font-size:16px;font-weight:800;color:${INK};line-height:1.3">${escH(d.duelo.visita)}</td>
        </tr>
      </table>
    </td></tr>` : '';
  const filas = (d.filas || []).filter(f => f && f[1]).map(f => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;color:${MUTED};width:38%">${escH(f[0])}</td>
          <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;font-weight:700;color:${INK}">${escH(f[1])}</td>
        </tr>`).join('');
  const tablaFilas = filas ? `<tr><td style="padding:10px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table></td></tr>` : '';
  const parr = (d.parrafos || []).filter(Boolean).map(p => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.65;color:#3A3D55;text-align:justify">${escH(p)}</p>`).join('');
  const bts = (d.botones || []).concat(d.sinAbrir ? [] : [{ txt: 'Abrir GTC Sports', url: APP }]).map(boton).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escH(d.titulo || 'GTC Sports')}</title></head>
<body style="margin:0;padding:0;background:#EEF0F4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td style="background:${NAVY};padding:20px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px"><img src="${LOGO}" width="52" height="52" alt="Guayaquil Tenis Club" style="display:block;border-radius:12px;border:0"></td>
      <td style="font-family:${FONT}">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.01em;color:#ffffff;line-height:1">GTC <span style="color:${GOLD}">SPORTS</span></div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#AEB3CF;margin-top:6px">Guayaquil Tenis Club · Olimpiadas 2026</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:${GOLD};line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="padding:26px 28px 4px">
    <span style="display:inline-block;padding:5px 11px;border-radius:20px;background:${t.bg};color:${t.fg};font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">${escH(d.etiqueta || t.txt)}</span>
    <h1 style="margin:14px 0 6px;font-family:${FONT};font-size:23px;line-height:1.25;font-weight:800;color:${NAVY};letter-spacing:-.01em">${escH(d.titulo || '')}</h1>
  </td></tr>
  ${duelo}
  ${tablaFilas}
  <tr><td style="padding:16px 28px 6px">${parr}</td></tr>
  <tr><td style="padding:4px 28px 18px">${bts}</td></tr>
  <tr><td style="padding:0 28px 22px;font-family:${FONT};font-size:11.5px;line-height:1.6;color:#8A8FA6;text-align:justify">
    Guayaquil Tenis Club · Comisión de Deportes. Recibes este correo porque formas parte de las Olimpiadas GTC 2026 y autorizaste las comunicaciones del Club en GTC Sports. Para dejar de recibirlos, responde a este correo o escribe a deportes@guayaquiltenisclub.ec.
  </td></tr>
  <tr><td align="center" style="background:${DEEP};padding:20px 28px 22px">
    <div style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};margin-bottom:10px">Plataforma desarrollada por</div>
    <img src="${CENSUS}" width="170" alt="Census Legal Tech" style="display:block;margin:0 auto;border:0;max-width:170px;height:auto">
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
