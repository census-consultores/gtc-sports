// GTC Sports — eventos de calendario de los partidos (Google Calendar y archivo .ics para iPhone, Android y Outlook).
// Hora de Guayaquil (UTC-5, sin horario de verano). Duración por defecto: 1 hora; sin hora → evento de todo el día.
export const APP = process.env.GTC_APP_URL || 'https://gtcsports.ec';
const DISC = { futbol: 'Fútbol', tenis: 'Tenis', natacion: 'Natación', carrera: 'Carrera', pingpong: 'Ping Pong', beachtenis: 'Beach Tenis', padel: 'Pádel', beachvolley: 'Beach Volley', cuarenta: 'Cuarenta', basquet: 'Baloncesto', pickleball: 'Pickleball' };
const CATN = { I1: 'Infantil 1', I2: 'Infantil 2', I3: 'Infantil 3', I4: 'Infantil 4', J1: 'Juvenil 1', J2: 'Juvenil 2', J3: 'Juvenil 3', SEN: 'Senior', MAS: 'Máster', DAM: 'Damas' };
function titulo(s) { return String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()); }

function horaDe(h) { const m = String(h || '').match(/(\d{1,2})\s*[:hH.]\s*(\d{2})/); if (!m) return null; const hh = +m[1], mm = +m[2]; return (hh < 24 && mm < 60) ? [hh, mm] : null; }
const z = n => String(n).padStart(2, '0');
function utcStamp(d) { return d.getUTCFullYear() + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) + 'T' + z(d.getUTCHours()) + z(d.getUTCMinutes()) + '00Z'; }

// p: fila de partidos + nombres de equipos (nL, nV). Devuelve el evento listo para Google o .ics.
export function evento(p) {
  const dn = DISC[p.disciplina] || titulo(p.disciplina || '');
  const cn = CATN[p.cat] || (p.cat ? p.cat : 'Todas las categorías');
  const gen = p.tipo === 'gen' || !p.local_id || !p.visita_id;
  const nombre = gen ? `${dn} · ${cn}` : `${dn}: ${p.nL || 'Local'} vs ${p.nV || 'Visitante'}`;
  const hm = horaDe(p.hora);
  let ini = null, fin = null, dia = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha || ''))) {
    if (hm) { ini = new Date(Date.UTC(+p.fecha.slice(0, 4), +p.fecha.slice(5, 7) - 1, +p.fecha.slice(8, 10), hm[0] + 5, hm[1])); fin = new Date(ini.getTime() + 3600000); }
    else dia = p.fecha.replace(/-/g, '');
  }
  const lugar = [p.sede, 'Guayaquil Tenis Club'].filter(Boolean).join(' · ');
  const det = [`Olimpiadas GTC 2026 · ${dn}${gen ? '' : ' · ' + cn}`, 'Detalles y resultados: ' + APP].join('\n');
  return { id: p.id, nombre, ini, fin, dia, lugar, det };
}
export function googleUrl(ev) {
  let dates;
  if (ev.ini) dates = utcStamp(ev.ini) + '/' + utcStamp(ev.fin);
  else if (ev.dia) { const d = new Date(Date.UTC(+ev.dia.slice(0, 4), +ev.dia.slice(4, 6) - 1, +ev.dia.slice(6, 8) + 1)); dates = ev.dia + '/' + d.toISOString().slice(0, 10).replace(/-/g, ''); }
  else return null;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.nombre, dates, details: ev.det, location: ev.lugar, ctz: 'America/Guayaquil' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
export function icsUrl(ids) { return APP + '/api/ics?ids=' + encodeURIComponent([].concat(ids).join(',')); }

function icsTxt(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function fold(line) { // líneas de máximo 75 octetos (RFC 5545)
  const out = []; let cur = '', len = 0;
  for (const ch of line) { const b = Buffer.byteLength(ch); if (len + b > 73) { out.push(cur); cur = ' ' + ch; len = 1 + b; } else { cur += ch; len += b; } }
  out.push(cur); return out.join('\r\n');
}
export function ics(eventos, nombreCal) {
  const now = utcStamp(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Census Legal Tech//GTC Sports//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsTxt(nombreCal || 'GTC Sports'), 'X-WR-TIMEZONE:America/Guayaquil', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  eventos.forEach(ev => {
    if (!ev.ini && !ev.dia) return;
    L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@gtcsports.ec', 'DTSTAMP:' + now);
    if (ev.ini) L.push('DTSTART:' + utcStamp(ev.ini), 'DTEND:' + utcStamp(ev.fin));
    else { const d = new Date(Date.UTC(+ev.dia.slice(0, 4), +ev.dia.slice(4, 6) - 1, +ev.dia.slice(6, 8) + 1)); L.push('DTSTART;VALUE=DATE:' + ev.dia, 'DTEND;VALUE=DATE:' + d.toISOString().slice(0, 10).replace(/-/g, '')); }
    L.push('SUMMARY:' + icsTxt(ev.nombre), 'LOCATION:' + icsTxt(ev.lugar), 'DESCRIPTION:' + icsTxt(ev.det), 'URL:' + APP);
    if (ev.ini) L.push('BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTxt(ev.nombre), 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
