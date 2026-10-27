// Módulo de torneos de Deportes (réplica de Tournament Planner) — arranque, sesión, lista de torneos y menú.
import { h, limpiar, modal, toast, confirmar, fCorta, campo, diasEntre, descargar } from './ui.js';
import { S, api, alRender, render, guardar, guardarPendiente, cambio, puedeEscribir, pintarEstado } from './estado.js';
import * as M from './motor.js';
import { vistaResumen } from './resumen.js';
import { abrirPropiedades } from './props.js';
import { vistaJugadores, vistaInscritos } from './jugadores.js';
import { vistaCuadros } from './cuadros.js';
import { vistaPartidos, vistaProgramacion } from './partidos.js';
import { vistaNotas, vistaAvisos, vistaInformes, abrirPublicar } from './informes.js';

const raiz = document.getElementById('raiz');
const VISTAS = [
  ['resumen', 'Resumen', vistaResumen], ['jugadores', 'Jugadores', vistaJugadores], ['inscritos', 'Inscritos', vistaInscritos],
  ['cuadros', 'Cuadros', vistaCuadros], ['partidos', 'Partidos', vistaPartidos], ['programacion', 'Programación', vistaProgramacion],
  ['notas', 'Notas', vistaNotas], ['avisos', 'Avisos', vistaAvisos], ['informes', 'Informes', vistaInformes]
];

function sesionGuardada() {
  try { const s = JSON.parse(sessionStorage.getItem('gtc_tp') || 'null'); if (s && s.token) return Object.assign(S, s); } catch (e) { }
  // misma sesión de administración que la app (gtcsports.ec): no hace falta volver a entrar
  try { const a = JSON.parse(localStorage.getItem('gtc_sesion') || 'null'); if (a && a.token && a.rol) Object.assign(S, { token: a.token, rol: a.rol, nombre: a.nombre || '', correo: a.correo || '' }); } catch (e) { }
}

function pantallaLogin() {
  const d = { correo: '', clave: '' }, err = h('div');
  const enviar = async e => {
    e.preventDefault(); limpiar(err);
    const r = await api('login', d);
    if (!r.ok) { err.append(h('div', { class: 'error' }, r.msg || 'No se pudo entrar.')); return; }
    Object.assign(S, { token: r.token, nombre: r.nombre, rol: r.rol, correo: r.correo });
    sessionStorage.setItem('gtc_tp', JSON.stringify({ token: r.token, nombre: r.nombre, rol: r.rol, correo: r.correo }));
    if (S.T) { render(); if (S.sucio) guardar(); } else cargarLista(); // la sesión venció con un torneo abierto: seguir donde estaba
  };
  return h('form', { class: 'login', onsubmit: enviar },
    h('h1', null, 'Torneos'), h('p', { class: 'sub' }, 'GTC Sports · Deportes'),
    h('div', { class: 'grid2', style: { gridTemplateColumns: '1fr' } }, campo(d, 'correo', 'Correo', { tipo: 'email' }), campo(d, 'clave', 'Clave', { tipo: 'password' })),
    err, h('div', { class: 'fila', style: { marginTop: '14px' } }, h('button', { class: 'btn pri', type: 'submit' }, 'Entrar')));
}

async function cargarLista() {
  const r = await api('tp_list');
  if (!r.ok) { if (r.status !== 401) toast(r.msg || 'No se pudo cargar la lista de torneos. ¿Ya existe la tabla tp_torneos en Supabase?', 'error'); S.lista = []; }
  else S.lista = r.torneos;
  S.T = null; S.id = null; render();
}

function pantallaLista() {
  const grupos = {};
  S.lista.forEach(t => { const g = t.grupo || M.DEPORTES[t.deporte] || 'Otros'; (grupos[g] = grupos[g] || []).push(t); });
  Object.values(grupos).forEach(l => l.sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || ''))));
  const orden = Object.keys(grupos).sort((a, b) => String(grupos[b][0].desde || '').localeCompare(String(grupos[a][0].desde || '')));
  const estado = t => t.estado === 'finalizado' ? h('span', { class: 'chip' }, 'Finalizado') : t.estado === 'borrador' ? h('span', { class: 'chip oro' }, 'Borrador') : h('span', { class: 'chip ok' }, 'En curso');
  return h('div', { style: { maxWidth: '980px', margin: '0 auto', padding: '26px 20px' } },
    h('div', { class: 'fila' }, h('div', null, h('h1', null, 'Torneos'), h('p', { class: 'sub' }, 'Crea y administra los torneos de tenis, pádel, beach tenis, ping pong y pickleball. Cada torneo funciona como en Tournament Planner.')), h('div', { class: 'esp' }),
      puedeEscribir() && h('button', { class: 'btn oro', onclick: nuevoTorneo }, 'Nuevo torneo'),
      h('button', { class: 'btn', onclick: () => { sessionStorage.removeItem('gtc_tp'); S.token = null; render(); } }, 'Salir')),
    !S.lista.length ? h('div', { class: 'vacio' }, 'Todavía no hay torneos. Crea el primero con «Nuevo torneo».') :
      h('div', { class: 'lista-torneos' }, orden.map(g => h('div', { class: 'grupo' }, h('h2', null, g),
        h('table', { class: 't' }, h('thead', null, h('tr', null, ['Torneo', 'Deporte', 'Fechas', 'Estado', 'App', 'Última edición', ''].map(x => h('th', null, x)))),
          h('tbody', null, grupos[g].map(t => h('tr', null,
            h('td', null, h('a', { href: '#', onclick: e => { e.preventDefault(); abrir(t.id); } }, t.nombre)),
            h('td', null, M.DEPORTES[t.deporte] || t.deporte), h('td', null, fCorta(t.desde) + (t.hasta && t.hasta !== t.desde ? ' – ' + fCorta(t.hasta) : '')),
            h('td', null, estado(t)), h('td', null, t.publicado ? h('span', { class: 'chip azul' }, 'Publicado') : h('span', { class: 'chip' }, 'Oculto')),
            h('td', { style: { color: 'var(--muted)', fontSize: '12px' } }, t.updated_at ? new Date(t.updated_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : ''),
            h('td', { style: { textAlign: 'right' } }, puedeEscribir() && h('button', { class: 'btn mini peligro', onclick: () => borrar(t) }, 'Eliminar'))))))))));
}

async function borrar(t) {
  if (!await confirmar('¿Eliminar el torneo «' + t.nombre + '»? Se borran sus jugadores, cuadros y resultados. No se puede deshacer.', 'Eliminar')) return;
  const r = await api('tp_del', { id: t.id });
  if (r.ok) { toast('Torneo eliminado.'); cargarLista(); } else toast(r.msg || 'No se pudo eliminar.', 'error');
}

// Nuevo torneo (Tournament > New), con opción de importar propiedades de otro (Import Properties / Save As New)
function nuevoTorneo() {
  const d = { nombre: '', grupo: '', deporte: 'padel', desde: '', hasta: '', copiar: '' };
  const copia = { org: true, dir: true, eventos: true, horarios: true, sedes: true, cuotas: true, formatos: true, oficiales: true, rr: true, opc: true };
  const m = modal({ titulo: 'Nuevo torneo' });
  const err = h('div');
  const grupos = [...new Set(S.lista.map(t => t.grupo).filter(Boolean))];
  m.cuerpo.append(
    h('div', { class: 'grid2' },
      campo(d, 'nombre', 'Nombre del torneo (incluye el año)', { ph: 'Abierto de Pádel GTC 2026' }),
      h('label', { class: 'f' }, 'Categoría del torneo (agrupa los torneos en la app)', h('input', { list: 'gruposTP', value: d.grupo, placeholder: 'Pádel, Olimpiadas, Mundialito +44…', onchange: e => { d.grupo = e.target.value; } }), h('datalist', { id: 'gruposTP' }, grupos.map(g => h('option', { value: g })))),
      campo(d, 'deporte', 'Deporte', { opciones: M.DEPORTES }),
      campo(d, 'desde', 'Fecha de inicio', { tipo: 'date' }), campo(d, 'hasta', 'Fecha de fin', { tipo: 'date' })),
    h('h3', null, 'Copiar propiedades de otro torneo (opcional)'),
    campo(d, 'copiar', 'Torneo de origen', { opciones: { '': 'No copiar', ...Object.fromEntries(S.lista.map(t => [t.id, t.nombre])) } }),
    h('div', { class: 'fila', style: { marginTop: '6px' } }, [['org', 'Organizador'], ['dir', 'Dirección'], ['eventos', 'Categorías'], ['horarios', 'Horarios'], ['sedes', 'Sedes y canchas'], ['cuotas', 'Cuotas'], ['formatos', 'Formatos de puntuación'], ['oficiales', 'Oficiales'], ['rr', 'Round robin'], ['opc', 'Opciones']].map(([k, t]) => campo(copia, k, t, { tipo: 'check' }))),
    h('p', { class: 'sub', style: { marginTop: '8px' } }, 'No se copian jugadores, inscripciones, cuadros ni resultados.'), err);
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', {
    class: 'btn pri', onclick: async () => {
      limpiar(err);
      if (d.nombre.trim().length < 3) return err.append(h('div', { class: 'error' }, 'Escribe el nombre del torneo.'));
      if (!d.desde) return err.append(h('div', { class: 'error' }, 'Elige la fecha de inicio.'));
      const hasta = d.hasta && d.hasta >= d.desde ? d.hasta : d.desde;
      const T = M.nuevoTorneo({ nombre: d.nombre.trim(), grupo: d.grupo.trim(), deporte: d.deporte, desde: d.desde, hasta });
      T.dias = diasEntre(d.desde, hasta); T.dias.forEach(x => { T.franjas[x] = M.generarFranjas('09:00', 75, '23:55', 10); });
      if (d.copiar) {
        const o = await api('tp_get', { id: d.copiar });
        if (o.ok) copiarPropiedades(T, o.data, copia);
      }
      S.T = T; S.id = null; S.rev = 0; S.vista = 'resumen'; S.conflicto = false;
      const r = await guardar();
      if (!r || !r.ok) { S.T = null; return; }
      m.cerrar(); render(); abrirPropiedades('info');
    }
  }, 'Crear torneo'));
}
function copiarPropiedades(T, O, c) {
  if (c.org) ['organizador', 'tel', 'email', 'arbitro', 'arbitroTel', 'arbitroEmail', 'web'].forEach(x => { T.info[x] = O.info[x]; });
  if (c.dir) ['sede', 'direccion', 'ciudad', 'pais', 'zona'].forEach(x => { T.info[x] = O.info[x]; });
  if (c.eventos) T.eventos = JSON.parse(JSON.stringify(O.eventos || [])).map(e => ({ ...e, noDisp: {} }));
  if (c.horarios && (O.dias || []).length === T.dias.length) T.dias.forEach((d, i) => { T.franjas[d] = (O.franjas[O.dias[i]] || []).slice(); });
  if (c.sedes) T.sedes = JSON.parse(JSON.stringify(O.sedes || T.sedes));
  if (c.cuotas) T.cuotas = JSON.parse(JSON.stringify(O.cuotas || T.cuotas));
  if (c.formatos) T.formatos = JSON.parse(JSON.stringify(O.formatos || T.formatos));
  if (c.oficiales) T.oficiales = JSON.parse(JSON.stringify(O.oficiales || []));
  if (c.rr) T.rr = JSON.parse(JSON.stringify(O.rr || T.rr));
  if (c.opc) { T.opc = { ...T.opc, ...(O.opc || {}) }; T.prog = { ...T.prog, ...(O.prog || {}) }; }
}

export async function abrir(id, mismaVista) {
  if (S.T && S.id !== id && !(await guardarPendiente()) && !(await confirmar('Hay cambios sin guardar en el torneo abierto. ¿Salir igual y perderlos?', 'Salir sin guardar'))) return;
  const r = await api('tp_get', { id });
  if (!r.ok) return toast(r.msg || 'No se pudo abrir el torneo.', 'error');
  S.T = migrar(r.data); S.id = r.id; S.rev = r.rev; S.conflicto = false; S.sucio = false; S.ultimoGuardado = null; S._R = null; S._base = JSON.stringify(S.T.res);
  if (!mismaVista) { S.vista = 'resumen'; S.evento = S.T.eventos[0] && S.T.eventos[0].id; S.cuadro = null; }
  render();
}
// Conflicto: otra computadora guardó antes. Se recarga su versión y se vuelven a aplicar encima
// los resultados y horarios cambiados en esta computadora; lo demás queda en la copia descargable.
async function recargarConflicto() {
  const local = S.T, base = JSON.parse(S._base || '{}'), igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const cambiados = Object.keys(local.res).filter(k => !igual(local.res[k], base[k])), borrados = Object.keys(base).filter(k => !(k in local.res));
  await abrir(S.id, true);
  if (S.T === local) return;
  cambiados.forEach(k => { S.T.res[k] = local.res[k]; }); borrados.forEach(k => { delete S.T.res[k]; });
  if (cambiados.length || borrados.length) { cambio(); toast((cambiados.length + borrados.length) + ' resultado(s) u horario(s) de esta computadora se aplicaron sobre la versión actual. Revisa otros cambios que hayas hecho (jugadores, cuadros).'); }
}
// Completa campos que un documento viejo no tenga.
function migrar(T) { const base = M.nuevoTorneo({ deporte: T.info.deporte }); for (const k of Object.keys(base)) if (T[k] == null) T[k] = base[k]; T.prog = { ...base.prog, ...T.prog }; T.opc = { ...base.opc, ...T.opc }; return T; }

function pantallaTorneo() {
  const T = S.T;
  const vista = VISTAS.find(v => v[0] === S.vista) || VISTAS[0];
  const main = h('main');
  try { main.append(vista[2]()); } catch (e) { console.error(e); main.append(h('div', { class: 'error' }, 'Error al mostrar esta vista: ' + e.message)); }
  return h('div', { class: 'app' },
    h('div', { class: 'top' },
      h('div', { class: 'marca' }, 'GTC ', h('b', null, 'Torneos')),
      h('div', { class: 'tor' }, h('span', { class: 'n' }, T.info.nombre), h('span', { class: 'estado' }, M.DEPORTES[T.info.deporte] + ' · ' + fCorta(T.info.desde) + (T.info.hasta !== T.info.desde ? ' – ' + fCorta(T.info.hasta) : ''))),
      h('span', { class: 'guardado', id: 'estadoGuardado' }),
      S.conflicto && h('button', { onclick: recargarConflicto }, 'Recargar y aplicar mis resultados'),
      S.conflicto && h('button', { onclick: () => descargar('copia-' + (S.id || 'torneo') + '.json', JSON.stringify(T), 'application/json') }, 'Descargar mi copia'),
      puedeEscribir() && h('button', { onclick: () => abrirPropiedades() }, 'Propiedades'),
      puedeEscribir() && h('button', { class: 'oro', onclick: () => abrirPublicar() }, T.publicado ? 'Publicado' : 'Publicar'),
      h('button', { onclick: async () => { if (!(await guardarPendiente()) && !(await confirmar('Hay cambios sin guardar. ¿Salir igual y perderlos?', 'Salir sin guardar'))) return; cargarLista(); } }, 'Torneos')),
    h('nav', { class: 'nav' }, h('small', null, 'Torneo'), VISTAS.slice(0, 3).map(btn), h('div', { class: 'sep' }), h('small', null, 'Juego'), VISTAS.slice(3, 6).map(btn), h('div', { class: 'sep' }), h('small', null, 'Gestión'), VISTAS.slice(6).map(btn)),
    main);
  function btn(v) { return h('button', { class: S.vista === v[0] ? 'on' : '', onclick: () => { S.vista = v[0]; render(); } }, v[1]); }
}

alRender(() => {
  const scroll = document.querySelector('main') && document.querySelector('main').scrollTop;
  limpiar(raiz);
  if (!S.token) raiz.append(pantallaLogin());
  else if (!S.T) raiz.append(pantallaLista());
  else { raiz.append(pantallaTorneo()); pintarEstado(); const m = document.querySelector('main'); if (m && scroll) m.scrollTop = scroll; }
});
// Atajos de teclado como TP: F2 jugadores, F6 partidos/cuadros, F7 programación, F8 inscritos
document.addEventListener('keydown', e => {
  if (!S.T || document.querySelector('.velo')) return;
  const mapa = { F2: 'jugadores', F6: S.vista === 'cuadros' ? 'partidos' : 'cuadros', F7: 'programacion', F8: 'inscritos' };
  if (mapa[e.key]) { e.preventDefault(); S.vista = mapa[e.key]; render(); }
});
sesionGuardada();
if (S.token) cargarLista(); else render();
