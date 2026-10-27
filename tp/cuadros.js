// Cuadros (Draws): asistente, sorteo, dibujo de eliminación y round robin, enlaces, ajuste de posiciones,
// ventana del partido (resultado) y planificación de un partido (F7).
import { h, limpiar, modal, confirmar, campo, toast, fCorta } from './ui.js';
import { S, api, cambio, render, guardar, R, puedeEscribir } from './estado.js';
import * as M from './motor.js';
import { registrarAviso } from './jugadores.js';

const T_ = () => S.T;
const insDe = id => S.T.inscripciones.find(i => i.id === id);
export function nomEntrada(x, corto) {
  if (!x) return '';
  if (x === 'BYE') return 'Bye';
  const i = insDe(x); if (!i) return '?';
  return M.nombreIns(S.T, i, corto);
}
function siembraTxt(x, c) { const i = insDe(x); const s = i && i.siembra && i.siembra[c.etapa === 'qual' ? 'qual' : 'main']; return s ? ' [' + s + ']' : ''; }
export function canchaN(id) { for (const s of S.T.sedes) for (const k of s.canchas) if (k.id === id) return k.nombre; return ''; }
export function marcador(p, desde) {
  if (p.est === 'np') return 'No jugado';
  const est = { wo: 'W.O.', wom: 'W.O. méd.', ret: 'Ret.', dis: 'Desc.' }[p.est];
  const inv = desde === 'b';
  const s = (p.sets || []).map(([a, b]) => inv ? b + '-' + a : a + '-' + b).join(' ');
  return [s, est].filter(Boolean).join(' ');
}

export function vistaCuadros() {
  const T = S.T;
  if (!T.eventos.length) return h('div', null, h('h1', null, 'Cuadros'), h('div', { class: 'vacio' }, 'Crea las categorías en Propiedades > Categorías.'));
  if (!T.eventos.some(e => e.id === S.evento)) S.evento = T.eventos[0].id;
  const ev = T.eventos.find(e => e.id === S.evento);
  const cs = T.cuadros.filter(c => c.evento === ev.id).sort((a, b) => a.orden - b.orden);
  if (!cs.some(c => c.id === S.cuadro)) S.cuadro = cs[0] && cs[0].id;
  const c = cs.find(x => x.id === S.cuadro);
  const Rr = R(), e = c && Rr.cuadros[c.id];
  const tieneEnlaces = c && T.enlaces.some(l => l.a && l.a.c === c.id);
  return h('div', null,
    h('div', { class: 'fila' }, h('h1', null, 'Cuadros'), h('div', { class: 'esp' }),
      h('select', { onchange: x => { S.evento = x.target.value; S.cuadro = null; render(); } }, T.eventos.map(x => h('option', { value: x.id, selected: x.id === ev.id }, x.nombre)))),
    puedeEscribir() && h('div', { class: 'fila no-print', style: { margin: '6px 0 10px' } },
      h('button', { class: 'btn pri', onclick: () => asistente(ev) }, 'Nuevo cuadro (asistente)'),
      h('button', { class: 'btn oro', disabled: !cs.length, onclick: () => sorteo(ev) }, 'Sortear'),
      c && h('button', { class: 'btn', onclick: () => propiedadesCuadro(c) }, 'Propiedades del cuadro'),
      cs.length > 0 && h('button', { class: 'btn', onclick: () => enlaces(ev) }, 'Enlaces'),
      c && c.tipo === 'rr' && h('button', { class: 'btn', onclick: () => ajustar(c) }, 'Ajustar posiciones'),
      c && h('button', { class: 'btn', onclick: () => limpiarCuadro(c) }, 'Limpiar'),
      c && h('button', { class: 'btn peligro', onclick: async () => { if (await confirmar('¿Borrar el cuadro «' + c.nombre + '» con sus enlaces, horarios y resultados?', 'Borrar')) { M.borrarCuadro(T, c.id); S.cuadro = null; cambio(); } } }, 'Borrar cuadro')),
    !cs.length ? h('div', { class: 'vacio' }, 'Esta categoría no tiene cuadros. Usa «Nuevo cuadro (asistente)».') : [
      h('div', { class: 'tabs' }, cs.map(x => h('button', { class: x.id === c.id ? 'on' : '', onclick: () => { S.cuadro = x.id; render(); } }, x.nombre, x.visible === false ? ' (oculto)' : ''))),
      h('p', { class: 'sub' }, M.TIPOS_CUADRO[c.tipo] || (c.tipo === 'grafo' ? 'Consolación feed-in' : c.tipo), ' · ', M.ETAPAS[c.etapa] || c.etapa, ' · tamaño ', c.tam, ' · formato: ', M.formatoDe(T, c).nombre,
        c.separacionPendiente ? h('span', { class: 'chip pend', style: { marginLeft: '8px' } }, 'La separación no se pudo optimizar del todo') : null),
      c.tipo === 'rr' ? dibujarRR(c, e) : c.tipo === 'grafo' ? dibujarGrafo(c, e) : dibujarElim(c, e, tieneEnlaces)
    ]);
}

// ---------- dibujo ----------
function cajaPartido(c, p, rivalVacio) {
  const T = S.T, gana = p.decidido && p.g;
  const lado = (x, k) => h('div', { class: 'lado' + (gana === k ? ' gana' : '') },
    h('span', null, x ? nomEntrada(x, true) + (x !== 'BYE' ? siembraTxt(x, c) : '') : h('span', { style: { color: 'var(--muted-2)' } }, rivalVacio || '—')),
    h('span', { class: 'sc' }, gana === k || (p.decidido && p.g === 't') ? marcador(p, k) : ''));
  const meta = [T.opc.numPartido && p.num ? '#' + p.num : '', p.fecha ? fCorta(p.fecha) : '', p.hora || '', T.opc.cancha && p.cancha ? canchaN(p.cancha) : '', p.obsoleto ? '⚠ resultado anterior anulado' : ''].filter(Boolean).join(' · ');
  return h('div', { class: 'match' + (p.bye ? ' bye' : '') + (p.enCancha ? ' vivo' : ''), onclick: p.bye ? null : () => ventanaPartido(p.k) }, lado(p.a, 'a'), lado(p.b, 'b'), meta && h('div', { class: 'meta' }, meta));
}
function dibujarElim(c, e, enlazado) {
  const T = S.T, N = c.tam, rondas = M.numRondas(c);
  const col0 = h('div', { class: 'ronda' }, h('h4', null, 'Líneas'), h('div', { class: 'slots' }, Array.from({ length: N }, (_, l) => {
    const x = e.lineas[l], base = c.lineas[l];
    const lk = T.enlaces.find(k => k.a && k.a.c === c.id && k.a.linea === l);
    const txt = x ? (x === 'BYE' ? 'Bye' + (T.opc.byeNum ? ' ' + (c.lineas.slice(0, l + 1).filter(y => y === 'BYE').length || '') : '') : nomEntrada(x) + siembraTxt(x, c)) : lk ? origenTxt(lk.de) : '— libre —';
    const extra = x && x !== 'BYE' && (c.cols || ['club']).map(k => { const j = T.jugadores.find(y => y.id === (insDe(x) || {}).j1); return j && j[k] ? j[k] : ''; }).filter(Boolean).join(' · ');
    return h('div', { class: 'linea', title: 'Línea ' + (l + 1), onclick: puedeEscribir() && !lk ? () => elegirLinea(c, l) : null, style: { fontWeight: x && x !== 'BYE' && siembraTxt(x, c) && T.opc.negrita ? 700 : 400 } }, (l + 1) + '. ' + txt, extra ? h('span', { style: { color: 'var(--muted-2)', marginLeft: '6px' } }, extra) : null, base && lk ? '' : '');
  })));
  const cols = [col0];
  for (let r = 0; r < rondas; r++) {
    const ps = e.partidos.filter(p => p.r === r);
    cols.push(h('div', { class: 'ronda' }, h('h4', null, M.nombreRonda(c, r)), h('div', { class: 'slots' }, ps.map(p => cajaPartido(c, p)))));
  }
  if (e.ganador && e.ganador !== 'BYE') cols.push(h('div', { class: 'ronda' }, h('h4', null, c.puesto ? c.puesto + '.º puesto' : 'Ganador'), h('div', { class: 'slots' }, h('div', { class: 'match' }, h('div', { class: 'lado gana' }, nomEntrada(e.ganador))))));
  if (e.clasificados) cols.push(h('div', { class: 'ronda' }, h('h4', null, 'Clasificados'), h('div', { class: 'slots' }, e.clasificados.map((x, i) => h('div', { class: 'linea' }, 'Q' + (i + 1) + '. ' + (x ? nomEntrada(x) : '—'))))));
  return h('div', { class: 'bracket' }, cols);
}
function dibujarGrafo(c, e) {
  const porR = {}; e.partidos.forEach(p => { (porR[p.r] = porR[p.r] || []).push(p); });
  return h('div', { class: 'bracket' }, Object.keys(porR).sort((a, b) => a - b).map(r => h('div', { class: 'ronda' }, h('h4', null, 'Ronda ' + (+r + 1)), h('div', { class: 'slots' }, porR[r].map(p => cajaPartido(c, p, 'Pendiente'))))),
    e.ganador && e.ganador !== 'BYE' ? h('div', { class: 'ronda' }, h('h4', null, 'Ganador de la consolación'), h('div', { class: 'slots' }, h('div', { class: 'match' }, h('div', { class: 'lado gana' }, nomEntrada(e.ganador))))) : null);
}
function dibujarRR(c, e) {
  const T = S.T, L = e.lineas, n = c.tam;
  const pk = {}; e.partidos.forEach(p => { pk[p.k] = p; });
  const tabla = h('table', { class: 'rr' }, h('tr', null, h('th'), h('th', null, 'Participante'), Array.from({ length: n }, (_, j) => h('th', null, j + 1))));
  for (let i = 0; i < n; i++) {
    const x = L[i];
    const tr = h('tr', null, h('th', null, i + 1), h('td', { class: 'nom', onclick: puedeEscribir() && !T.enlaces.some(k => k.a && k.a.c === c.id && k.a.linea === i) ? () => elegirLinea(c, i) : null, style: { cursor: puedeEscribir() ? 'pointer' : 'default' } }, x ? (x === 'BYE' ? 'Bye' : nomEntrada(x) + siembraTxt(x, c)) : (origenEnlace(c, i) || '— libre —')));
    for (let j = 0; j < n; j++) {
      if (i === j) { tr.append(h('td', { class: 'x' })); continue; }
      const lo = Math.min(i, j), hi = Math.max(i, j);
      const ps = [pk[c.id + ':g:' + lo + ':' + hi], c.idaVuelta ? pk[c.id + ':g:' + hi + ':' + lo] : null].filter(Boolean);
      tr.append(h('td', { class: ps.length ? 'm' : '' }, ps.map(p => {
        const desde = L[i] === p.a ? 'a' : 'b';
        const txt = p.decidido ? marcador(p, desde) : (T.opc.rondasRR ? 'R' + (p.r + 1) : '') + (p.hora ? ' ' + p.hora : '');
        return h('div', { onclick: () => ventanaPartido(p.k), style: { fontWeight: p.decidido && ((p.g === 'a' && desde === 'a') || (p.g === 'b' && desde === 'b')) ? 700 : 400 } }, txt || '·');
      })));
    }
    tabla.append(tr);
  }
  const t = e.tabla;
  return h('div', null, tabla,
    h('h3', null, 'Posiciones', t.manual ? h('span', { class: 'chip oro', style: { marginLeft: '8px' } }, 'MR · ajuste manual') : null, t.empate && t.completo ? h('span', { class: 'chip rojo', style: { marginLeft: '8px' } }, 'Empate sin resolver: usa «Ajustar posiciones»') : null),
    h('table', { class: 't', style: { maxWidth: '760px' } }, h('thead', null, h('tr', null, ['', 'Participante', 'PJ', 'G', 'E', 'P', 'Pts', 'Sets', 'Games'].map(x => h('th', null, x)))),
      h('tbody', null, t.filas.map(f => h('tr', null, h('td', null, f.pos), h('td', null, nomEntrada(f.id)), h('td', null, f.pj), h('td', null, f.pg), h('td', null, f.pe), h('td', null, f.pp), h('td', null, h('b', null, f.pts)), h('td', null, f.sf + ' - ' + f.sc), h('td', null, f.gf + ' - ' + f.gc))))),
    t.completo && !t.empate && h('p', { class: 'sub' }, 'Grupo terminado: los clasificados pasan solos a su cuadro enlazado.'));
}
function origenEnlace(c, l) { const lk = S.T.enlaces.find(k => k.a && k.a.c === c.id && k.a.linea === l); return lk ? origenTxt(lk.de) : ''; }
export function origenTxt(de) {
  const T = S.T, cn = id => (T.cuadros.find(c => c.id === id) || {}).nombre || '?';
  if (de.t === 'pos') return cn(de.c) + ' #' + de.n;
  if (de.t === 'l' || de.t === 'w') { const [cid, r, i] = de.k.split(':'); const c = T.cuadros.find(x => x.id === cid); return (de.t === 'l' ? 'Perdedor ' : 'Ganador ') + (c ? (c.nombre + ' · ' + M.nombreRonda(c, +r) + ' ' + (+i + 1)) : ''); }
  if (de.t === 'fm') return 'Perdedor del primer partido · líneas ' + (2 * de.i + 1) + '-' + (2 * de.i + 2) + ' (' + cn(de.c) + ')';
  if (de.t === 'l2') return 'Perdedor del segundo partido (' + cn(de.c) + ')';
  if (de.t === 'q') return 'Clasificado ' + (de.i + 1) + ' (' + cn(de.c) + ')';
  if (de.t === 'best') return 'Mejor ' + de.n + '.º de los grupos';
  return '';
}
function elegirLinea(c, l) {
  const T = S.T, m = modal({ titulo: c.nombre + ' · línea ' + (l + 1), clase: 'chico' });
  const usadas = new Set(T.cuadros.filter(x => x.evento === c.evento && x.etapa === c.etapa).flatMap(x => x.lineas));
  const libres = T.inscripciones.filter(i => i.evento === c.evento && M.inscripcionActiva(i) && !usadas.has(i.id));
  const poner = v => { c.lineas[l] = v; M.borrarResultadosDe(T, []); cambio(); m.cerrar(); };
  m.cuerpo.append(h('p', { class: 'sub' }, 'Sorteo manual: elige quién va en esta línea. Solo aparecen inscripciones con pago validado que no están en otro cuadro de la etapa.'),
    h('div', { style: { maxHeight: '45vh', overflow: 'auto' } }, libres.map(i => h('button', { class: 'btn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '4px' }, onclick: () => poner(i.id) }, M.nombreIns(T, i) + siembraTxt(i.id, c)))));
  m.pie.append(c.lineas[l] && h('button', { class: 'btn', style: { marginRight: 'auto' }, onclick: () => poner(null) }, 'Vaciar línea'), h('button', { class: 'btn', onclick: () => poner('BYE') }, 'Bye'), h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'));
}

// ---------- asistente (Draw Wizard) ----------
const DESC = {
  elim: 'Eliminación directa, con playoff (3.º-4.º o 3.º a 8.º) y consolación opcionales.', rr: 'Todos contra todos en un solo grupo.',
  gruposElim: 'Varios grupos todos contra todos; los primeros pasan a un cuadro de eliminación.', gruposRR: 'Varios grupos; los clasificados juegan otro todos contra todos.',
  qualMain: 'Una clasificación por eliminación; los clasificados entran al cuadro principal con los aceptados directos.', rr2: 'Todos contra todos, ida y vuelta.',
  monrad: 'Eliminación con consolación integrada: se definen todas las posiciones.', compass: 'Cuadros Este, Oeste, Norte, Sur…: cada jugador juega al menos 3 partidos.',
  qual: 'Eliminación que se detiene tras unas rondas y deja clasificados.', rrPlayoff: '2 grupos de 4 y playoffs por los puestos 1 a 8.', matchplay: 'Grupos de 4: dos partidos cada uno (y partido por el 3.er puesto).',
  feed: 'Feed-in continuo: un perdedor de primera ronda todavía puede quedar 3.º.'
};
function asistente(ev) {
  const T = S.T;
  const nIns = T.inscripciones.filter(i => i.evento === ev.id && (i.lista || 'main') === 'main' && i.estado !== 'WD').length;
  const d = { tipo: 'elim', evento: ev.id, etapa: 'main', tam: M.potencia2(Math.max(2, nIns)), nombre: ev.nombre, playoff: '', consolacion: 'none', ultimoFeed: '', consPlayoff: '', grupos: Math.max(1, Math.round(nIns / 4)) || 2, tamGrupo: 4, numeros: false, pasan: 1, extraPlayoff: false, mejor2: false, mejor3: false, tamPlayoff: '', qIn: 16, qOut: 4, formato: '', cols: ['club'] };
  const m = modal({ titulo: 'Asistente de cuadros · ' + ev.nombre, clase: 'ancho' });
  const cont = h('div');
  const tam = (desde, hasta) => Object.fromEntries([2, 4, 8, 16, 32, 64, 128, 256, 512].filter(x => x >= desde && x <= hasta).map(x => [x, x]));
  const pint = () => {
    limpiar(cont);
    const t = d.tipo;
    cont.append(h('div', { class: 'grid2' }, campo(d, 'tipo', 'Tipo de cuadro', { opciones: M.TIPOS_CUADRO, alCambiar: pint }), campo(d, 'etapa', 'Etapa', { opciones: Object.fromEntries(ev.etapas.filter(s => !['reserve', 'exclude'].includes(s.tipo)).map(s => [s.id, M.ETAPAS[s.tipo] || s.id])) }), campo(d, 'nombre', 'Nombre')),
      h('p', { class: 'sub', style: { margin: '6px 0 12px' } }, DESC[t] + ' · ' + nIns + ' inscripciones en el cuadro principal.'));
    const g = h('div', { class: 'grid2' });
    if (['elim', 'monrad', 'compass', 'feed', 'qualMain'].includes(t)) g.append(campo(d, 'tam', 'Tamaño', { opciones: tam(t === 'compass' ? 8 : 2, t === 'compass' ? 64 : 512), num: true }));
    if (t === 'rr' || t === 'rr2') g.append(campo(d, 'tam', 'Tamaño del grupo', { opciones: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 3, i + 3])), num: true }));
    if (t === 'matchplay') g.append(campo(d, 'tam', 'Participantes (múltiplo de 4, hasta 32)', { opciones: Object.fromEntries([4, 8, 12, 16, 20, 24, 28, 32].map(x => [x, x])), num: true }));
    if (['elim', 'qualMain'].includes(t)) g.append(campo(d, 'playoff', 'Playoff', { opciones: { '': 'Ninguno', 34: '3.º y 4.º', 3458: '3.º-4.º y 5.º a 8.º' } }), campo(d, 'consolacion', 'Consolación', { opciones: M.CONSOLACIONES, alCambiar: pint }));
    if (['elim', 'qualMain'].includes(t) && d.consolacion === 'feed') g.append(campo(d, 'ultimoFeed', 'Último ingreso a la consolación', { opciones: { '': 'Hasta cuartos', 0: 'Solo 1.ª ronda', 1: 'Hasta 2.ª ronda', 2: 'Hasta 3.ª ronda', 3: 'Hasta 4.ª ronda' } }));
    if (['elim', 'qualMain'].includes(t) && ['r1', 'fm', 'custom'].includes(d.consolacion)) g.append(campo(d, 'consPlayoff', 'Playoff de la consolación', { opciones: { '': 'Ninguno', 34: '3.º y 4.º' } }));
    if (t === 'gruposElim' || t === 'gruposRR') g.append(campo(d, 'grupos', 'Número de grupos', { tipo: 'number', min: 1, max: 64, alCambiar: pint }), campo(d, 'tamGrupo', 'Tamaño de cada grupo', { opciones: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 3, i + 3])), num: true, alCambiar: pint }), campo(d, 'numeros', 'Numerar grupos (1, 2, 3) en vez de letras', { tipo: 'check' }),
      campo(d, 'pasan', 'Clasifican por grupo', { opciones: { 1: '1 (solo el ganador)', 2: '2 (1.º y 2.º)', 3: '3', 4: '4' }, num: true }),
      t === 'gruposElim' && campo(d, 'extraPlayoff', 'Playoff extra para los puestos 2.º a 4.º', { tipo: 'check' }), campo(d, 'mejor2', 'Enlace «mejor 2.º» (manual)', { tipo: 'check' }), campo(d, 'mejor3', 'Enlace «mejor 3.º» (manual)', { tipo: 'check' }),
      t === 'gruposElim' && campo(d, 'playoff', 'Partido por el 3.er puesto en el playoff', { opciones: { '': 'No', 34: 'Sí' } }),
      h('p', { class: 'sub' }, 'Capacidad: ' + d.grupos * d.tamGrupo + ' participantes. Los grupos con menos inscritos quedan con un lugar libre (bye).'));
    if (t === 'qual' || t === 'qualMain') g.append(campo(d, 'qIn', 'Participantes de la clasificación', { opciones: tam(4, 128), num: true }), campo(d, 'qOut', 'Clasificados', { opciones: tam(1, 64), num: true }));
    g.append(campo(d, 'formato', 'Formato de puntuación', { opciones: { '': 'El de la etapa / torneo', ...Object.fromEntries(T.formatos.map(f => [f.id, f.nombre])) } }));
    cont.append(g, h('h3', null, 'Columnas visibles en el cuadro'), h('div', { class: 'fila' }, [['socio', 'Código de socio'], ['nivel', 'Nivel'], ['nac', 'Nacimiento'], ['rating', 'Rating'], ['ranking', 'Ranking'], ['club', 'Club'], ['ciudad', 'Ciudad']].map(([k, n]) => h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: d.cols.includes(k), onchange: e => { d.cols = e.target.checked ? d.cols.concat(k) : d.cols.filter(x => x !== k); } }), n))));
  };
  pint();
  m.cuerpo.append(cont);
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => {
    if ((d.tipo === 'qual' || d.tipo === 'qualMain') && +d.qOut >= +d.qIn) return toast('Los clasificados deben ser menos que los participantes.', 'error');
    const op = { ...d, ultimoFeed: d.ultimoFeed === '' ? null : +d.ultimoFeed, formato: d.formato || null };
    const nuevos = M.crearCuadros(T, op);
    nuevos.forEach(x => { x.cols = d.cols; });
    S.cuadro = nuevos[0] && nuevos[0].id;
    cambio(); m.cerrar(); toast(nuevos.length + (nuevos.length === 1 ? ' cuadro creado.' : ' cuadros creados.') + ' Ahora usa «Sortear».');
  } }, 'Crear'));
}
function propiedadesCuadro(c) {
  const T = S.T, x = { nombre: c.nombre, formato: c.formato || '', visible: c.visible !== false, sede: c.sede || '', tam: c.tam };
  const m = modal({ titulo: 'Propiedades · ' + c.nombre, clase: 'chico' });
  m.cuerpo.append(h('div', { class: 'grid2', style: { gridTemplateColumns: '1fr' } }, campo(x, 'nombre', 'Nombre'), campo(x, 'formato', 'Formato de puntuación', { opciones: { '': 'El de la etapa / torneo', ...Object.fromEntries(T.formatos.map(f => [f.id, f.nombre])) } }),
    campo(x, 'sede', 'Sede del cuadro (para programar)', { opciones: { '': 'Cualquiera', ...Object.fromEntries(T.sedes.map(s => [s.id, s.nombre])) } }), campo(x, 'visible', 'Visible en la app (al publicar)', { tipo: 'check' }),
    c.tipo !== 'grafo' && campo(x, 'tam', 'Tamaño (cambiarlo borra el sorteo, enlaces y resultados de este cuadro)', { tipo: 'number', min: 2 })));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: async () => {
    if (+x.tam !== c.tam) {
      if (c.tipo === 'elim' && (x.tam & (x.tam - 1))) return toast('En eliminación el tamaño debe ser potencia de 2.', 'error');
      if (!await confirmar('Cambiar el tamaño borra el sorteo, los enlaces y los resultados de este cuadro. ¿Continuar?')) return;
      c.tam = +x.tam; c.lineas = Array(c.tam).fill(null); M.borrarResultadosDe(T, [c.id]); T.enlaces = T.enlaces.filter(l => !(l.a && l.a.c === c.id) && l.de.c !== c.id && !(l.de.k && l.de.k.startsWith(c.id + ':')));
    }
    c.nombre = x.nombre; c.formato = x.formato || null; c.visible = x.visible; c.sede = x.sede || null; cambio(); m.cerrar();
  } }, 'Guardar'));
}
async function limpiarCuadro(c) {
  const T = S.T, d = { horarios: true, resultados: true, jugadores: false };
  const m = modal({ titulo: 'Limpiar · ' + c.nombre, clase: 'chico' });
  m.cuerpo.append(campo(d, 'resultados', 'Borrar resultados', { tipo: 'check' }), campo(d, 'horarios', 'Borrar horarios y canchas', { tipo: 'check' }), campo(d, 'jugadores', 'Sacar a los jugadores (deshacer el sorteo)', { tipo: 'check' }));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn peligro', onclick: () => {
    Object.keys(T.res).forEach(k => { if (k.split(':')[0] !== c.id) return; const r = T.res[k]; if (d.resultados) ['s', 'g', 'est', 'ab', 'dur', 'fin'].forEach(z => delete r[z]); if (d.horarios) ['fecha', 'hora', 'cancha', 'num', 'enCancha'].forEach(z => delete r[z]); if (!Object.keys(r).length) delete T.res[k]; });
    if (d.jugadores) { c.lineas = Array(c.tam).fill(null); T.enlaces = T.enlaces.filter(l => !(l.de.t === 'q' && l.a && l.a.c === c.id)); }
    cambio(); m.cerrar();
  } }, 'Limpiar'));
}

// ---------- sorteo (Make Draws) ----------
function sorteo(ev) {
  const T = S.T;
  const etapas = [...new Set(T.cuadros.filter(c => c.evento === ev.id).map(c => c.etapa))];
  const d = { etapa: (T.cuadros.find(c => c.id === S.cuadro) || {}).etapa || etapas[0], separacion: 'none', soloPrimera: false, sepParejas: false };
  const m = modal({ titulo: 'Sorteo · ' + ev.nombre, clase: 'ancho' });
  const cont = h('div'), res = h('div');
  let antes = null;
  const sorteables = () => T.cuadros.filter(c => c.evento === ev.id && c.etapa === d.etapa && c.tipo !== 'grafo' && !T.enlaces.some(l => l.a && l.a.c === c.id && l.de.t !== 'q'));
  const pint = () => {
    limpiar(cont);
    const cs = sorteables();
    const activas = T.inscripciones.filter(i => i.evento === ev.id && (i.lista || 'main') === (d.etapa === 'qual' ? 'qual' : 'main') && M.inscripcionActiva(i)).length;
    const pend = T.inscripciones.filter(i => i.evento === ev.id && i.pago !== 'pagada' && i.estado !== 'WD').length;
    cont.append(h('div', { class: 'grid2' }, campo(d, 'etapa', 'Etapa', { opciones: Object.fromEntries(etapas.map(x => [x, M.ETAPAS[x] || x])), alCambiar: pint }),
      campo(d, 'separacion', 'Separación', { opciones: { none: 'Ninguna (al azar)', club: 'Club', ciudad: 'Ciudad', pais: 'País', nivel: 'Nivel', disponibilidad: 'Disponibilidad' } }),
      campo(d, 'soloPrimera', 'Separar solo en primera ronda', { tipo: 'check' }), ev.tipo === 'D' ? null : campo(d, 'sepParejas', 'Separar parejas de dobles', { tipo: 'check' })),
      h('p', { class: 'sub', style: { marginTop: '8px' } }, 'Cuadros a sortear: ' + (cs.map(c => c.nombre).join(', ') || 'ninguno (los cuadros con enlaces se llenan solos)') + ' · ' + activas + ' inscripciones activas.', pend ? h('span', { class: 'chip pend', style: { marginLeft: '6px' } }, pend + ' con pago pendiente no entran') : null));
  };
  pint();
  m.cuerpo.append(cont, res);
  const hacer = () => {
    const cs = sorteables(); if (!cs.length) return toast('No hay cuadros para sortear en esta etapa.', 'error');
    if (!antes) antes = JSON.stringify({ c: cs.map(c => [c.id, c.lineas]), e: T.enlaces, r: T.res });
    const r = M.sortear(T, cs.map(c => c.id), { separacion: d.separacion, soloPrimera: d.soloPrimera, sepParejas: d.sepParejas });
    limpiar(res);
    if (!r.ok) return res.append(h('div', { class: 'error' }, r.msg));
    S._R = null;
    res.append(cs.some(c => c.separacionPendiente) ? h('div', { class: 'aviso' }, 'No se pudo optimizar del todo la separación: quedan cruces del mismo grupo.') : null,
      h('div', { class: 'grid2' }, cs.map(c => h('div', { class: 'card' }, h('b', null, c.nombre), h('table', { class: 't' }, h('tbody', null, c.lineas.map((x, l) => h('tr', null, h('td', { style: { width: '36px' } }, l + 1), h('td', null, x ? nomEntrada(x) + (x !== 'BYE' ? siembraTxt(x, c) : '') : h('span', { style: { color: 'var(--muted-2)' } }, origenEnlace(c, l) || (String(x).startsWith('Q') ? 'Clasificado' : '—')))))))))));
    botones();
  };
  const botones = () => {
    limpiar(m.pie);
    m.pie.append(h('button', { class: 'btn', onclick: () => { if (antes) { const a = JSON.parse(antes); a.c.forEach(([id, l]) => { const c = T.cuadros.find(x => x.id === id); if (c) c.lineas = l; }); T.enlaces = a.e; T.res = a.r; S._R = null; } m.cerrar(); render(); } }, 'Cancelar'),
      h('button', { class: 'btn', onclick: hacer }, antes ? 'Volver a sortear' : 'Sortear'),
      antes && h('button', { class: 'btn pri', onclick: () => { m.cerrar(); cambio(); toast('Sorteo guardado. Puedes avisar a los jugadores desde «Avisos».'); } }, 'Aceptar y guardar'));
  };
  botones();
}

// ---------- enlaces (Draw > Links) ----------
function enlaces(ev) {
  const T = S.T, Rr = R();
  const cs = T.cuadros.filter(c => c.evento === ev.id).map(c => c.id);
  const ls = T.enlaces.filter(l => (l.a && cs.includes(l.a.c)) || (l.de.cs && l.de.cs.some(x => cs.includes(x))));
  const m = modal({ titulo: 'Enlaces · ' + ev.nombre, clase: 'ancho' });
  const estado = l => {
    if (!l.a) return h('span', { class: 'chip oro' }, 'Manual');
    const v = Rr.cuadros[l.a.c] && Rr.cuadros[l.a.c].lineas[l.a.linea];
    return v ? h('span', { class: 'chip ok' }, 'Adelantado') : h('span', { class: 'chip' }, 'Pendiente');
  };
  m.cuerpo.append(ls.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Origen', 'Destino', 'Estado', 'Participante', ''].map(x => h('th', null, x)))), h('tbody', null, ls.map(l => {
    const dest = l.a ? (T.cuadros.find(c => c.id === l.a.c) || {}).nombre + ' · línea ' + (l.a.linea + 1) : '—';
    const v = l.a && Rr.cuadros[l.a.c] && Rr.cuadros[l.a.c].lineas[l.a.linea];
    return h('tr', null, h('td', null, origenTxt(l.de)), h('td', null, dest), h('td', null, estado(l)), h('td', null, v ? nomEntrada(v) : ''),
      h('td', null, l.de.t === 'best' && h('button', { class: 'btn mini', onclick: () => { m.cerrar(); mejores(l); } }, 'Elegir y colocar')));
  }))) : h('div', { class: 'vacio' }, 'Esta categoría no tiene enlaces.'),
    h('p', { class: 'sub j', style: { marginTop: '10px' } }, 'Los enlaces de ganadores, perdedores y posiciones avanzan solos cuando el partido o el grupo termina. Los enlaces «mejor 2.º / 3.º» son manuales: se comparan los grupos y Deportes coloca al elegido.'));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => m.cerrar() }, 'Listo'));
}
function mejores(l) {
  const T = S.T, Rr = R();
  const cand = l.de.cs.map(cid => { const t = Rr.cuadros[cid] && Rr.cuadros[cid].tabla; const f = t && t.completo && t.filas[l.de.n - 1]; return f ? { ...f, grupo: (T.cuadros.find(c => c.id === cid) || {}).nombre, prom: f.pj ? f.pts / f.pj : 0 } : null; }).filter(Boolean)
    .sort((a, b) => b.prom - a.prom || (b.sf - b.sc) - (a.sf - a.sc) || (b.gf - b.gc) - (a.gf - a.gc));
  const destinos = T.cuadros.filter(c => c.evento === T.cuadros.find(x => x.id === l.de.cs[0]).evento && c.etapa !== T.cuadros.find(x => x.id === l.de.cs[0]).etapa && c.tipo !== 'grafo');
  const d = { sel: cand[0] && cand[0].id, c: destinos[0] && destinos[0].id, linea: 1 };
  const m = modal({ titulo: 'Mejor ' + l.de.n + '.º de los grupos' });
  m.cuerpo.append(cand.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['', 'Grupo', 'Participante', 'Pts/PJ', 'Sets', 'Games'].map(x => h('th', null, x)))), h('tbody', null, cand.map(f => h('tr', null, h('td', null, h('input', { type: 'radio', name: 'mej', checked: d.sel === f.id, onchange: () => { d.sel = f.id; } })), h('td', null, f.grupo), h('td', null, nomEntrada(f.id)), h('td', null, f.prom.toFixed(2)), h('td', null, f.sf + '-' + f.sc), h('td', null, f.gf + '-' + f.gc))))) : h('div', { class: 'vacio' }, 'Los grupos aún no terminan.'),
    h('div', { class: 'grid2', style: { marginTop: '10px' } }, campo(d, 'c', 'Colocar en el cuadro', { opciones: Object.fromEntries(destinos.map(c => [c.id, c.nombre])) }), campo(d, 'linea', 'Línea', { tipo: 'number', min: 1 })),
    h('p', { class: 'sub' }, 'Con grupos de distinto tamaño se compara por puntos por partido jugado.'));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', disabled: !cand.length, onclick: () => {
    const c = T.cuadros.find(x => x.id === d.c); const li = +d.linea - 1; if (!c || li < 0 || li >= c.tam) return toast('Línea fuera del cuadro.', 'error');
    c.lineas[li] = d.sel; cambio(); m.cerrar();
  } }, 'Colocar'));
}
function ajustar(c) {
  const T = S.T, e = R().cuadros[c.id];
  const orden = e.tabla.filas.map(f => f.id);
  const m = modal({ titulo: 'Ajustar posiciones · ' + c.nombre, clase: 'chico' });
  const lista = h('div');
  const pint = () => { limpiar(lista); orden.forEach((x, i) => lista.append(h('div', { class: 'fila', style: { padding: '4px 0' } }, h('b', { style: { width: '24px' } }, i + 1), nomEntrada(x), h('div', { class: 'esp' }),
    h('button', { class: 'btn mini', disabled: !i, onclick: () => { orden.splice(i - 1, 0, orden.splice(i, 1)[0]); pint(); } }, '↑'), h('button', { class: 'btn mini', disabled: i === orden.length - 1, onclick: () => { orden.splice(i + 1, 0, orden.splice(i, 1)[0]); pint(); } }, '↓')))); };
  pint();
  m.cuerpo.append(h('p', { class: 'sub j' }, 'Para empates que se definen por sorteo u otra regla del reglamento. El orden manual queda marcado «MR».'), lista);
  m.pie.append(h('button', { class: 'btn', style: { marginRight: 'auto' }, onclick: () => { delete T.ajustes[c.id]; cambio(); m.cerrar(); } }, 'Calcular (quitar ajuste)'), h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => { T.ajustes[c.id] = orden.slice(); cambio(); m.cerrar(); } }, 'Guardar orden'));
}

// ---------- ventana del partido (Match Information) ----------
export function ventanaPartido(k) {
  const T = S.T, p = R().porClave[k]; if (!p) return;
  const c = T.cuadros.find(x => x.id === p.c), f = M.formatoDe(T, c), Rk = T.res[k] || {};
  const n = +f.bestOf || 3;
  const sets = Array.from({ length: n }, (_, i) => { const s = (p.sets || [])[i]; return s ? [s[0], s[1]] : [null, null]; });
  const d = { est: p.est || '', g: p.g || '', cancha: p.cancha || '', dur: Rk.dur || '', juez: Rk.juez || '', nota: Rk.nota || '', destacado: !!Rk.destacado, avisar: true };
  let tab = 'res';
  const m = modal({ titulo: c.nombre + ' · ' + M.nombreRonda(c, p.r) + (p.num ? ' · #' + p.num : ''), clase: '' });
  const tabs = h('div', { class: 'tabs' }), cont = h('div'), err = h('div');
  const ganadorAuto = () => { const v = M.evaluarMarcador(f, sets.filter(s => s[0] != null && s[1] != null)); return v.ok ? v.g : null; };
  const pint = () => {
    limpiar(tabs); limpiar(cont);
    [['res', 'Resultado'], ['ck', 'Llegada'], ['av', 'Avisado'], ['nota', 'Nota']].forEach(([x, t]) => tabs.append(h('button', { class: tab === x ? 'on' : '', onclick: () => { tab = x; pint(); } }, t)));
    if (tab === 'res') {
      const tabla = h('table', { class: 'sets' }, h('tr', null, h('td'), sets.map((_, i) => h('td', { style: { fontSize: '11px', color: 'var(--muted)', textAlign: 'center' } }, i === n - 1 && f.ultimo !== f.tipo ? 'Set ' + (i + 1) + '*' : 'Set ' + (i + 1)))));
      ['a', 'b'].forEach((lado, li) => tabla.append(h('tr', null, h('td', { style: { paddingRight: '12px', fontWeight: (d.g || ganadorAuto()) === lado ? 700 : 400 } }, nomEntrada(p[lado])),
        sets.map((s, i) => h('td', null, h('input', { type: 'number', min: 0, max: 99, value: s[li] ?? '', disabled: !puedeEscribir(), oninput: e => { s[li] = e.target.value === '' ? null : +e.target.value; },
          onchange: e => {
            const v = e.target.value === '' ? null : +e.target.value; s[li] = v;
            // autocompletar: lo escrito es el marcador de quien perdió el set; se completa el del ganador
            if (T.autocompletar && v != null && s[1 - li] == null) { const w = M.completarSet(i === n - 1 ? (f.ultimo || f.tipo) : f.tipo, f, v, i === n - 1); if (w != null) s[1 - li] = w; }
            const val = M.ganadorSet(i === n - 1 ? (f.ultimo || f.tipo) : f.tipo, f, s[0], s[1], i === n - 1);
            if (s[0] != null && s[1] != null && !val && !d.est) toast('El set ' + (i + 1) + ' (' + s[0] + '-' + s[1] + ') no es válido para «' + f.nombre + '».', 'error');
            d.g = ''; pint();
          } }))))));
      const g = ganadorAuto();
      cont.append(h('p', { class: 'sub' }, 'Formato: ' + f.nombre + (T.autocompletar ? ' · escribe el marcador de quien perdió el set y se completa el del ganador.' : '')), tabla,
        h('div', { class: 'grid2', style: { marginTop: '12px' } },
          campo(d, 'est', 'Estado', { opciones: M.ESTADOS_PARTIDO, alCambiar: pint }),
          h('label', { class: 'f' }, 'Ganador', h('select', { onchange: e => { d.g = e.target.value; } }, h('option', { value: '' }, g ? 'Según el marcador (' + nomEntrada(p[g], true) + ')' : 'Desconocido'), h('option', { value: 'a', selected: d.g === 'a' }, nomEntrada(p.a, true)), h('option', { value: 'b', selected: d.g === 'b' }, nomEntrada(p.b, true)), c.tipo === 'rr' && h('option', { value: 't', selected: d.g === 't' }, 'Empate'))),
          campo(d, 'cancha', 'Cancha', { opciones: { '': '—', ...Object.fromEntries(T.sedes.flatMap(s => s.canchas.map(x => [x.id, x.nombre]))) } }),
          campo(d, 'dur', 'Duración (min)', { tipo: 'number', min: 0 }),
          campo(d, 'juez', 'Juez de silla', { opciones: { '': '—', ...Object.fromEntries(T.oficiales.map(o => [o.nombre, o.nombre])) } }),
          campo(d, 'avisar', 'Avisar el resultado a los jugadores', { tipo: 'check' })),
        d.est && d.est !== 'np' ? h('p', { class: 'sub' }, 'Con W.O., retiro o descalificación indica el ganador; en retiro o descalificación anota el marcador al momento de la interrupción.') : null,
        p.fecha ? h('p', { class: 'sub' }, 'Programado: ' + fCorta(p.fecha) + ' ' + (p.hora || '') + (p.cancha ? ' · ' + canchaN(p.cancha) : '')) : null,
        p.obsoleto ? h('div', { class: 'aviso' }, 'Este partido tenía un resultado con otros participantes (cambió un resultado anterior). Regístralo de nuevo.') : null);
      if (!p.listo) cont.append(h('div', { class: 'aviso' }, 'Todavía faltan participantes en este partido: solo se puede programar.'));
    }
    if (tab === 'ck') cont.append(h('p', { class: 'sub' }, 'Registro de llegada por jugador.'), ['a', 'b'].map(l => M.jugadoresIns(T, p[l]).map(j => h('label', { class: 'ck', style: { padding: '4px 0' } }, h('input', { type: 'checkbox', checked: !!(T.res[k] && T.res[k].ck && T.res[k].ck[j]), onchange: e => { const ck = { ...((T.res[k] || {}).ck || {}) }; if (e.target.checked) ck[j] = Date.now(); else delete ck[j]; M.setRes(T, k, { ck: Object.keys(ck).length ? ck : null }); cambio(true); } }), M.nombreJ(T.jugadores.find(x => x.id === j), T)))));
    if (tab === 'av') cont.append(h('p', { class: 'sub' }, 'Marca a quién ya se le avisó el horario (los avisos por push y correo se envían desde «Avisos»).'), ['a', 'b'].map(l => M.jugadoresIns(T, p[l]).map(j => h('label', { class: 'ck', style: { padding: '4px 0' } }, h('input', { type: 'checkbox', checked: !!(T.res[k] && T.res[k].av && T.res[k].av[j]), onchange: e => { const av = { ...((T.res[k] || {}).av || {}) }; if (e.target.checked) av[j] = Date.now(); else delete av[j]; M.setRes(T, k, { av: Object.keys(av).length ? av : null }); cambio(true); } }), M.nombreJ(T.jugadores.find(x => x.id === j), T)))));
    if (tab === 'nota') cont.append(campo(d, 'nota', 'Nota del partido', { tipo: 'area', filas: 5 }), campo(d, 'destacado', 'Resaltar el partido', { tipo: 'check' }));
  };
  pint();
  m.cuerpo.append(tabs, cont, err);
  m.pie.append(
    puedeEscribir() && h('button', { class: 'btn', style: { marginRight: 'auto' }, onclick: () => { m.cerrar(); planificar(k); } }, 'Programar (F7)'),
    puedeEscribir() && (p.decidido || p.obsoleto) && h('button', { class: 'btn peligro', onclick: async () => { if (!await confirmar('¿Borrar el resultado de este partido?')) return; M.setRes(T, k, { s: null, g: null, est: null, ab: null, fin: null }); cambio(); m.cerrar(); } }, 'Borrar resultado'),
    h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cerrar'),
    puedeEscribir() && h('button', { class: 'btn pri', onclick: async () => {
      limpiar(err);
      M.setRes(T, k, { nota: d.nota || null, destacado: d.destacado || null, juez: d.juez || null, cancha: d.cancha || null });
      const hay = sets.some(s => s[0] != null || s[1] != null) || d.est || d.g;
      if (!hay) { cambio(); m.cerrar(); return; }
      if (!p.listo) return err.append(h('div', { class: 'error' }, 'Faltan participantes: no se puede registrar el resultado.'));
      const r = M.guardarResultado(T, k, { sets: sets.filter(s => s[0] != null && s[1] != null), est: d.est, g: d.g || (d.est ? null : null), dur: +d.dur || null, juez: d.juez, cancha: d.cancha });
      if (!r.ok) return err.append(h('div', { class: 'error' }, r.msg));
      M.setRes(T, k, { nota: d.nota || null, destacado: d.destacado || null });
      cambio(); m.cerrar();
      if (r.obsoletos && r.obsoletos.length) toast(r.obsoletos.length + ' partido(s) posteriores quedaron con su resultado anulado porque cambiaron sus participantes.', 'error');
      if (d.avisar && S.id) { await guardar(); api('tp_aviso', { id: S.id, tipo: 'resultado', k }).then(x => { if (x.ok && !x.repetido) registrarAviso('Resultado ' + c.nombre, [p.a, p.b], x); }); }
      // ¿siguiente partido sin programar?
      if (T.prog.avisarSig) {
        const R2 = R(); const ganador = R2.porClave[k] && R2.porClave[k].ganador;
        const sig = ganador && R2.partidos.find(q => q.k !== k && !q.decidido && !q.fecha && (q.a === ganador || q.b === ganador));
        if (sig && await confirmar('El siguiente partido de ' + nomEntrada(ganador, true) + ' no está programado. ¿Programarlo ahora?', 'Programar')) planificar(sig.k);
      }
    } }, 'Guardar'));
}

// ---------- planificación de un partido (F7) ----------
const MOTIVO = { 'sin-canchas': 'Sin canchas', 'canchas-llenas': 'Canchas llenas', 'no-disponible': 'Jugador no disponible', descanso: 'Descanso', 'max-dia': 'Máximo por día', 'max-evento': 'Máximo por categoría', 'max-individuales': 'Máximo de individuales', 'antes-que-previo': 'Antes que su partido previo', 'previo-sin-programar': 'Partido previo sin programar', 'categoria-no-juega': 'La categoría no juega' };
export function planificar(k) {
  const T = S.T, p0 = R().porClave[k]; if (!p0) return;
  const c = T.cuadros.find(x => x.id === p0.c);
  const d = { forzar: false, auto: true, cancha: p0.cancha || '', descanso: T.prog.descanso, sede: c.sede || '' };
  const m = modal({ titulo: 'Programar · ' + c.nombre + ' ' + M.nombreRonda(c, p0.r), clase: 'ancho' });
  const cont = h('div');
  const horas = [...new Set(T.dias.flatMap(x => T.franjas[x] || []))].sort();
  const pint = () => {
    limpiar(cont);
    const Rr = R(), p = Rr.porClave[k];
    const tabla = h('table', { class: 'matriz plan' }, h('tr', null, h('th'), horas.map(x => h('th', { class: 'v' }, x))));
    T.dias.forEach(dia => {
      const tr = h('tr', null, h('th', { style: { textAlign: 'right' } }, fCorta(dia)));
      horas.forEach(hr => {
        if (!(T.franjas[dia] || []).includes(hr)) { tr.append(h('td', { class: 'sin-canchas' })); return; }
        const actual = p.fecha === dia && p.hora === hr;
        const mot = actual ? [] : M.motivos(T, Rr, p, dia, hr, { descanso: d.descanso, sede: d.sede || null });
        const usados = Rr.partidos.filter(q => q.fecha === dia && q.hora === hr && q.k !== k).length;
        const cap = M.canchasDisponibles(T, dia, hr, d.sede || null).length;
        tr.append(h('td', { class: actual ? 'actual' : (mot[0] || 'libre'), title: fCorta(dia) + ' ' + hr + ' · ' + usados + '/' + cap + ' canchas' + (mot.length ? ' · ' + mot.map(x => MOTIVO[x] || x).join(', ') : ''),
          onclick: () => {
            if (mot.length && !d.forzar) return toast('No disponible: ' + mot.map(x => MOTIVO[x] || x).join(', ') + '. Marca «Forzar» para programarlo igual.', 'error');
            const cancha = d.auto ? M.canchaLibre(T, Rr, p, dia, hr, d.sede || null) : (d.cancha || null);
            M.setRes(T, k, { fecha: dia, hora: hr, cancha }); cambio(true); pint();
          } }, actual ? '●' : (cap ? usados + '/' + cap : '')));
      });
      tabla.append(tr);
    });
    const jug = [...M.posibles(T, Rr.porClave, p)].flatMap(e => M.jugadoresIns(T, e));
    cont.append(h('div', { class: 'leyenda' }, [['libre', '#fff', 'Disponible'], ['', 'var(--c-sin)', 'Sin canchas'], ['', 'var(--c-llenas)', 'Canchas llenas'], ['', 'var(--c-nodisp)', 'Jugador no disponible'], ['', 'var(--c-desc)', 'Descanso / máximos'], ['', 'var(--c-prev)', 'Partido previo'], ['', 'var(--c-act)', 'Horario actual']].map(([_, col, t]) => h('span', null, h('i', { style: { background: col } }), t))),
      h('div', { style: { overflow: 'auto' } }, tabla),
      h('div', { class: 'grid2', style: { marginTop: '12px' } },
        campo(d, 'auto', 'Asignar cancha automáticamente', { tipo: 'check', alCambiar: pint }),
        !d.auto && campo(d, 'cancha', 'Cancha', { opciones: { '': '—', ...Object.fromEntries(T.sedes.flatMap(s => s.canchas.map(x => [x.id, x.nombre]))) } }),
        campo(d, 'sede', 'Sede', { opciones: { '': 'Todas', ...Object.fromEntries(T.sedes.map(s => [s.id, s.nombre])) }, alCambiar: pint }),
        campo(d, 'descanso', 'Descanso entre inicios (min)', { tipo: 'number', min: 0, alCambiar: pint }),
        campo(d, 'forzar', 'Forzar (ignorar restricciones)', { tipo: 'check' })),
      h('h3', null, 'Jugadores de este partido'),
      h('table', { class: 't' }, h('tbody', null, jug.map(j => { const x = T.jugadores.find(y => y.id === j); const nd = Object.entries(x.noDisp || {}).map(([dd, hs]) => fCorta(dd) + ': ' + hs.join(', ')).join(' · '); const suyos = Rr.partidos.filter(q => q.fecha && q.k !== k && [...M.posibles(T, Rr.porClave, q)].some(e => M.jugadoresIns(T, e).includes(j))); return h('tr', null, h('td', null, M.nombreJ(x, T)), h('td', { style: { color: nd ? 'var(--rojo)' : 'var(--muted)' } }, nd || 'Sin restricciones'), h('td', null, suyos.map(q => fCorta(q.fecha) + ' ' + q.hora).join(' · '))); }))),
      p.fecha && h('p', { class: 'sub' }, 'Actual: ' + fCorta(p.fecha) + ' ' + (p.hora || '(solo día)') + (p.cancha ? ' · ' + canchaN(p.cancha) : '')));
  };
  pint();
  m.cuerpo.append(cont);
  m.pie.append(h('button', { class: 'btn peligro', style: { marginRight: 'auto' }, onclick: () => { M.setRes(T, k, { fecha: null, hora: null, cancha: null, num: null }); cambio(); m.cerrar(); } }, 'Quitar horario'),
    h('button', { class: 'btn', onclick: () => { const dia = prompt('Programar solo el día (AAAA-MM-DD):', p0.fecha || T.dias[0] || ''); if (dia && T.dias.includes(dia)) { M.setRes(T, k, { fecha: dia, hora: null }); cambio(true); pint(); } } }, 'Solo el día'),
    h('button', { class: 'btn pri', onclick: () => { m.cerrar(); render(); } }, 'Listo'));
}
