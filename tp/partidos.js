// Partidos (control de partidos del día) y Programación (automática, validación, urgentes, numeración, ocupación).
import { h, limpiar, modal, campo, toast, fCorta } from './ui.js';
import { S, cambio, render, R, puedeEscribir } from './estado.js';
import * as M from './motor.js';
import { ventanaPartido, planificar, nomEntrada, canchaN, marcador } from './cuadros.js';

const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
function evDe(p) { const c = S.T.cuadros.find(x => x.id === p.c); return c && S.T.eventos.find(e => e.id === c.evento); }
function rondaDe(p) { const c = S.T.cuadros.find(x => x.id === p.c); return c ? M.nombreRonda(c, p.r) : ''; }
function minutosDesde(ts) { return Math.max(0, Math.round((Date.now() - ts) / 60000)); }

// Estado de cada jugador del partido (colores de TP): no avisado, avisado, llegó, en cancha, en descanso
function puntos(p, lado) {
  const T = S.T, Rk = T.res[p.k] || {}, Rr = R();
  return M.jugadoresIns(T, p[lado]).map(j => {
    const jugando = Rr.partidos.some(q => q.enCancha && !q.decidido && q.k !== p.k && M.jugadoresIns(T, q.a).concat(M.jugadoresIns(T, q.b)).includes(j));
    const ultimo = Rr.partidos.filter(q => q.decidido && T.res[q.k] && T.res[q.k].fin && M.jugadoresIns(T, q.a).concat(M.jugadoresIns(T, q.b)).includes(j)).map(q => T.res[q.k].fin).sort().pop();
    const descansa = ultimo && minutosDesde(ultimo) < (+T.opc.descanso || 0);
    const cls = jugando ? 'cc' : (Rk.ck && Rk.ck[j]) ? 'ck' : (Rk.av && Rk.av[j]) ? 'av' : 'na';
    const t = jugando ? 'En cancha en otro partido' : descansa ? 'En descanso (' + minutosDesde(ultimo) + ' de ' + T.opc.descanso + ' min)' : cls === 'ck' ? 'Llegó' : cls === 'av' ? 'Avisado' : 'No avisado';
    return h('span', { title: M.nombreJ(T.jugadores.find(x => x.id === j), T) + ': ' + t }, h('span', { class: 'dot ' + cls }), descansa ? '⏱' : '');
  });
}

export function vistaPartidos() {
  const T = S.T, Rr = R();
  S._ptab = S._ptab || 'prog';
  S._pdia = S._pdia || (T.dias.includes(hoy()) ? hoy() : '');
  const f = { dia: S._pdia, sede: S._psede || '', q: S._pq || '' };
  const todos = Rr.partidos;
  const prog = todos.filter(p => p.fecha && !p.decidido), sin = todos.filter(p => !p.fecha && !p.decidido), fin = todos.filter(p => p.decidido);
  const base = S._ptab === 'prog' ? prog : S._ptab === 'sin' ? sin : fin;
  const lista = base.filter(p => (!f.dia || p.fecha === f.dia || S._ptab === 'sin') && (!f.sede || (T.sedes.find(s => s.canchas.some(k => k.id === p.cancha)) || {}).id === f.sede) && (!f.q || (nomEntrada(p.a) + ' ' + nomEntrada(p.b)).toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || M.minutos(a.hora) - M.minutos(b.hora) || (+(T.res[a.k] || {}).ord || 0) - (+(T.res[b.k] || {}).ord || 0) || (a.num || 0) - (b.num || 0));
  const canchas = T.sedes.flatMap(s => s.canchas.map(k => ({ ...k, sede: s.id }))).filter(k => !f.sede || k.sede === f.sede);
  const ocupada = k => todos.find(p => p.enCancha && !p.decidido && p.cancha === k.id);
  const libres = canchas.filter(k => !ocupada(k));
  const aCancha = (p, kid) => { M.setRes(T, p.k, { cancha: kid, enCancha: Date.now() }); cambio(); };
  return h('div', null,
    h('div', { class: 'fila' }, h('h1', null, 'Partidos'), h('div', { class: 'esp' }),
      h('select', { onchange: e => { S._pdia = e.target.value; render(); } }, h('option', { value: '' }, 'Todos los días'), T.dias.map(x => h('option', { value: x, selected: x === f.dia }, fCorta(x) + (x === hoy() ? ' (hoy)' : '')))),
      h('select', { onchange: e => { S._psede = e.target.value; render(); } }, h('option', { value: '' }, 'Todas las sedes'), T.sedes.map(s => h('option', { value: s.id, selected: s.id === f.sede }, s.nombre))),
      h('input', { type: 'search', placeholder: 'Buscar jugador', value: f.q, onchange: e => { S._pq = e.target.value; render(); } })),
    h('div', { class: 'canchas' }, canchas.map(k => { const p = ocupada(k); return h('div', { class: 'cancha' + (p ? ' ocupada' : ''), onclick: p ? () => ventanaPartido(p.k) : null, style: { cursor: p ? 'pointer' : 'default' } }, h('b', null, k.nombre), p ? [nomEntrada(p.a, true), ' vs ', nomEntrada(p.b, true), h('br'), 'Desde ' + new Date(p.enCancha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) + ' · ' + minutosDesde(p.enCancha) + ' min'] : h('span', { style: { color: 'var(--laurel)' } }, 'Libre')); })),
    h('div', { class: 'leyenda' }, h('span', null, h('span', { class: 'dot na' }), 'No avisado'), h('span', null, h('span', { class: 'dot av' }), 'Avisado'), h('span', null, h('span', { class: 'dot ck' }), 'Llegó'), h('span', null, h('span', { class: 'dot cc' }), 'En cancha en otro partido'), h('span', null, '⏱ En descanso')),
    h('div', { class: 'tabs' }, [['prog', 'Programados · ' + prog.length], ['sin', 'Sin programar · ' + sin.length], ['fin', 'Terminados · ' + fin.length]].map(([k, t]) => h('button', { class: S._ptab === k ? 'on' : '', onclick: () => { S._ptab = k; render(); } }, t))),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['Hora', 'Cuadro', 'Ronda', 'N.º', 'Participante 1', 'Participante 2', 'Cancha', S._ptab === 'fin' ? 'Resultado' : '', ''].map(x => h('th', null, x)))),
      h('tbody', null, lista.length ? lista.map((p, idx) => {
        const Rk = T.res[p.k] || {};
        return h('tr', { style: Rk.destacado ? { background: '#FFF7D6' } : null },
          h('td', null, p.fecha ? fCorta(p.fecha) + ' ' + (p.hora || '') : '—'), h('td', null, (T.cuadros.find(c => c.id === p.c) || {}).nombre), h('td', null, rondaDe(p)), h('td', null, p.num || ''),
          h('td', { style: { textAlign: 'right' } }, p.a ? [nomEntrada(p.a, true), ' ', puntos(p, 'a')] : h('span', { style: { color: 'var(--muted-2)' } }, 'Por definir')),
          h('td', null, p.b ? [puntos(p, 'b'), ' ', nomEntrada(p.b, true)] : h('span', { style: { color: 'var(--muted-2)' } }, 'Por definir')),
          h('td', null, p.cancha ? canchaN(p.cancha) + (p.enCancha ? ' · en juego ' + minutosDesde(p.enCancha) + ' min' : '') : ''),
          h('td', null, S._ptab === 'fin' ? marcador(p, 'a') : ''),
          h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } }, puedeEscribir() && [
            S._ptab === 'prog' && p.listo && !p.enCancha && h('select', { class: 'btn mini', onchange: e => { if (e.target.value) aCancha(p, e.target.value); } }, h('option', { value: '' }, 'A cancha…'), libres.map(k => h('option', { value: k.id }, k.nombre))),
            S._ptab === 'prog' && p.enCancha && h('button', { class: 'btn mini', onclick: () => { M.setRes(T, p.k, { enCancha: null }); cambio(); } }, 'Liberar cancha'), ' ',
            p.listo && h('button', { class: 'btn mini pri', onclick: () => ventanaPartido(p.k) }, S._ptab === 'fin' ? 'Editar' : 'Resultado'), ' ',
            S._ptab !== 'fin' && h('button', { class: 'btn mini', onclick: () => planificar(p.k) }, 'Programar'), ' ',
            S._ptab === 'prog' && h('button', { class: 'btn mini', title: 'Subir en el orden de esta hora', disabled: !idx || lista[idx - 1].hora !== p.hora, onclick: () => { const q = lista[idx - 1]; M.setRes(T, p.k, { ord: idx - 1 }); M.setRes(T, q.k, { ord: idx }); cambio(); } }, '↑')]));
      }) : h('tr', null, h('td', { colspan: 9, class: 'vacio' }, 'No hay partidos en esta lista.')))));
}

// ---------- Programación ----------
export function vistaProgramacion() {
  const T = S.T;
  const cont = h('div');
  const auto = { cuadros: new Set(T.cuadros.map(c => c.id)), alcance: 'todos', desdeDia: T.dias.find(d => d >= hoy()) || T.dias[0] || '', desdeHora: '', descanso: T.prog.descanso, descansoRR: T.prog.descanso, autoCancha: true };
  const val = { dia: T.dias.find(d => d >= hoy()) || T.dias[0] || '', descanso: 60, finTarde: '19:00', inicioTemprano: '10:00', maxDia: T.prog.maxDia, maxEvento: T.prog.maxEvento, maxInd: T.prog.maxInd };
  const num = { dia: val.dia, desde: 1, sede: '' };
  const resAuto = h('div'), resVal = h('div');
  if (!T.dias.length || !T.sedes.some(s => s.canchas.length)) cont.append(h('div', { class: 'aviso' }, 'Para programar se necesitan días, horarios y canchas (Propiedades). Sin canchas disponibles no se puede programar.'));
  cont.append(h('h1', null, 'Programación'), h('p', { class: 'sub' }, 'Programar un partido: ábrelo desde Cuadros o Partidos y usa «Programar (F7)».'),
    // automática
    h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'Programación automática'),
      h('div', { class: 'fila', style: { alignItems: 'flex-start' } }, h('div', { style: { minWidth: '280px' } }, h('b', null, 'Cuadros'), T.eventos.map(e => h('div', null, h('div', { style: { fontSize: '12px', color: 'var(--muted)', marginTop: '6px' } }, e.nombre), T.cuadros.filter(c => c.evento === e.id).map(c => h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: true, onchange: x => x.target.checked ? auto.cuadros.add(c.id) : auto.cuadros.delete(c.id) }), c.nombre))))),
        h('div', { class: 'grid2', style: { flex: 1 } },
          campo(auto, 'alcance', 'Partidos', { opciones: { primeros: 'Solo primeros partidos (también con bye)', conocidos: 'Solo partidos con ambos participantes conocidos', todos: 'Todos los partidos' } }),
          campo(auto, 'desdeDia', 'Desde el día', { opciones: Object.fromEntries(T.dias.map(d => [d, fCorta(d)])) }), campo(auto, 'desdeHora', 'Desde la hora', { tipo: 'time' }),
          campo(auto, 'descanso', 'Descanso en eliminación (min entre inicios)', { tipo: 'number', min: 0 }), campo(auto, 'descansoRR', 'Descanso en round robin (min)', { tipo: 'number', min: 0 }),
          campo(T.prog, 'maxDia', 'Máximo de partidos por día', { tipo: 'number', min: 1, alCambiar: () => cambio(true) }), campo(T.prog, 'maxEvento', 'Máximo por categoría', { tipo: 'number', min: 1, alCambiar: () => cambio(true) }), campo(T.prog, 'maxInd', 'Máximo de individuales por día', { tipo: 'number', min: 1, alCambiar: () => cambio(true) }),
          campo(auto, 'autoCancha', 'Asignar canchas', { tipo: 'check' }))),
      h('p', { class: 'sub j' }, 'Respeta la disponibilidad de jugadores, categorías y canchas, el descanso, los máximos por día y el orden del cuadro (cada ronda después de la anterior). Los byes avanzan solos. En torneos grandes conviene programar por partes y revisar.'),
      puedeEscribir() && h('button', { class: 'btn pri', onclick: () => {
        const r = M.programarAuto(T, { ...auto, cuadros: [...auto.cuadros] }); cambio(true);
        limpiar(resAuto).append(h('div', { class: r.sinLugar.length ? 'aviso' : 'ok-msg' }, r.programados + ' partidos programados.' + (r.sinLugar.length ? ' ' + r.sinLugar.length + ' no encontraron horario: revisa días, canchas, disponibilidad o máximos.' : '')));
      } }, 'Programar'), resAuto),
    // validación
    h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'Validar programación'),
      h('div', { class: 'grid2' }, campo(val, 'dia', 'Día', { opciones: Object.fromEntries(T.dias.map(d => [d, fCorta(d)])) }), campo(val, 'descanso', 'Descanso mínimo (min)', { tipo: 'number' }), campo(val, 'finTarde', 'Terminó tarde el día anterior (después de)', { tipo: 'time' }), campo(val, 'inicioTemprano', 'Y empieza temprano (antes de)', { tipo: 'time' }), campo(val, 'maxDia', 'Máximo por día', { tipo: 'number' }), campo(val, 'maxEvento', 'Máximo por categoría por día', { tipo: 'number' }), campo(val, 'maxInd', 'Máximo de individuales', { tipo: 'number' })),
      h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => {
        const v = M.validarDia(T, val.dia, val), nj = j => M.nombreJ(T.jugadores.find(x => x.id === j), T);
        const grupos = [['descanso', 'Descanso insuficiente', x => nj(x.j) + ' · ' + x.p.hora], ['maxDia', 'Exceso de partidos por día', x => nj(x.j) + ' · ' + x.n], ['maxEvento', 'Exceso por categoría', x => nj(x.j) + ' · ' + x.n], ['maxInd', 'Exceso de individuales', x => nj(x.j) + ' · ' + x.n], ['indTrasDobles', 'Individual después de dobles', x => nj(x.j) + ' · ' + x.p.hora], ['tardeTemprano', 'Terminó tarde y empieza temprano', x => nj(x.j)], ['noDisponible', 'Juega cuando no está disponible', x => nj(x.j) + ' · ' + x.p.hora], ['varias', 'Juega en varias sedes', x => nj(x.j)]];
        const total = grupos.reduce((n, g) => n + v[g[0]].length, 0);
        limpiar(resVal).append(total ? grupos.filter(g => v[g[0]].length).map(g => h('div', null, h('h3', null, g[1] + ' (' + v[g[0]].length + ')'), v[g[0]].map(x => h('div', { class: 'chip pend', style: { margin: '2px' } }, g[2](x))))) : h('div', { class: 'ok-msg' }, 'Sin problemas para ' + fCorta(val.dia) + '. Se cuentan también los partidos que un jugador podría jugar si sigue ganando.'));
      } }, 'Validar'), resVal),
    // urgentes
    h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'Partidos urgentes'), h('p', { class: 'sub' }, 'Partidos sin programar con ambos participantes definidos, primero los de quienes tienen más partidos por jugar.'),
      (() => { const u = M.urgentes(T).slice(0, 25); return u.length ? h('table', { class: 't' }, h('tbody', null, u.map(({ p, prioridad }) => h('tr', null, h('td', null, (T.cuadros.find(c => c.id === p.c) || {}).nombre), h('td', null, rondaDe(p)), h('td', null, nomEntrada(p.a, true) + ' vs ' + nomEntrada(p.b, true)), h('td', null, h('span', { class: 'chip' }, 'Prioridad ' + prioridad)), h('td', null, puedeEscribir() && h('button', { class: 'btn mini', onclick: () => planificar(p.k) }, 'Programar')))))) : h('p', { class: 'sub' }, 'No hay partidos urgentes.'); })()),
    // numeración
    puedeEscribir() && h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'Numerar partidos'), h('div', { class: 'grid2' }, campo(num, 'dia', 'Día', { opciones: Object.fromEntries(T.dias.map(d => [d, fCorta(d)])) }), campo(num, 'desde', 'Empezar en', { tipo: 'number', min: 1 }), campo(num, 'sede', 'Sede', { opciones: { '': 'Todas', ...Object.fromEntries(T.sedes.map(s => [s.id, s.nombre])) } })),
      h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => { M.numerarPartidos(T, num.dia, num.desde, num.sede || null); cambio(true); toast('Partidos de ' + fCorta(num.dia) + ' numerados.'); } }, 'Numerar')),
    ocupacionCanchas());
  return cont;
}
export function ocupacionCanchas() {
  const T = S.T, Rr = R();
  const horas = [...new Set(T.dias.flatMap(d => T.franjas[d] || []))].sort();
  let cap = 0, uso = 0;
  const tabla = h('table', { class: 'matriz plan' }, h('tr', null, h('th'), h('th', null, 'Total'), horas.map(x => h('th', { class: 'v' }, x))));
  T.dias.forEach(d => {
    const fila = horas.map(x => { if (!(T.franjas[d] || []).includes(x)) return null; const c = M.canchasDisponibles(T, d, x).length, u = Rr.partidos.filter(p => p.fecha === d && p.hora === x).length; cap += c; uso += u; return [u, c]; });
    tabla.append(h('tr', null, h('th', { style: { textAlign: 'right' } }, fCorta(d)), h('td', { style: { width: 'auto', padding: '0 6px' } }, fila.reduce((n, x) => n + (x ? x[0] : 0), 0)),
      fila.map(x => x ? h('td', { class: !x[1] ? 'sin-canchas' : x[0] > x[1] ? 'no-disponible' : x[0] === x[1] ? 'canchas-llenas' : 'libre', title: x[0] + ' de ' + x[1] + ' canchas' }, x[0] || '') : h('td', { class: 'sin-canchas' }))));
  });
  return h('div', { class: 'card' }, h('h2', { style: { marginTop: 0 } }, 'Ocupación de canchas'), h('p', { class: 'sub' }, 'Capacidad: ' + cap + ' · usados: ' + uso + '. Verde = todas las canchas ocupadas; rojo = más partidos que canchas; negro = sin canchas.'), h('div', { style: { overflow: 'auto' } }, tabla));
}
