// Resumen del torneo (Overview de TP): contadores, avance, estadísticas por categoría y partidos por día.
import { h, fCorta } from './ui.js';
import { S, R, render } from './estado.js';
import * as M from './motor.js';
import { ocupacionCanchas } from './partidos.js';

export function vistaResumen() {
  const T = S.T, Rr = R(), ps = Rr.partidos;
  const prog = ps.filter(p => p.fecha).length, fin = ps.filter(p => p.decidido).length;
  const pend = T.inscripciones.filter(i => i.pago !== 'pagada' && i.estado !== 'WD').length;
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const caja = (n, t, ir) => h('div', { class: 'card', style: { cursor: ir ? 'pointer' : 'default', minWidth: '150px', flex: '1' }, onclick: ir ? () => { S.vista = ir; render(); } : null }, h('div', { style: { fontSize: '26px', fontWeight: 700 } }, n), h('div', { class: 'sub', style: { margin: 0 } }, t));
  const hoyMD = new Date(Date.now() - 5 * 3600e3).toISOString().slice(5, 10);
  const cumple = T.jugadores.filter(j => j.nac && j.nac.slice(5) === hoyMD);
  const faltan = [];
  if (!T.dias.length) faltan.push('días del torneo'); if (!T.sedes.some(s => s.canchas.length)) faltan.push('canchas'); if (!T.eventos.length) faltan.push('categorías'); if (!T.formatos.length) faltan.push('formatos de puntuación');
  const estado = ev => { const cs = T.cuadros.filter(c => c.evento === ev.id), ins = T.inscripciones.filter(i => i.evento === ev.id); const pp = ps.filter(p => cs.some(c => c.id === p.c)); if (!ins.length) return ['Sin inscritos', '']; if (!cs.length) return ['Inscritos sin cuadro', 'rojo']; if (cs.every(c => !c.lineas.some(Boolean)) && !T.enlaces.some(l => l.a && cs.some(c => c.id === l.a.c))) return ['Cuadro sin sortear', 'pend']; if (pp.length && pp.every(p => p.decidido)) return ['Terminado', '']; if (!pp.some(p => p.fecha)) return ['Nada programado', 'oro']; if (pp.every(p => p.fecha || p.decidido)) return ['Todo programado', 'ok']; return ['Programación parcial', 'azul']; };
  return h('div', null, h('h1', null, T.info.nombre), h('p', { class: 'sub' }, [M.DEPORTES[T.info.deporte], T.info.grupo !== M.DEPORTES[T.info.deporte] && T.info.grupo, fCorta(T.info.desde) + (T.info.hasta !== T.info.desde ? ' – ' + fCorta(T.info.hasta) : ''), T.info.sede].filter(Boolean).join(' · ')),
    faltan.length ? h('div', { class: 'aviso' }, 'Falta configurar: ' + faltan.join(', ') + '. Abre «Propiedades».') : null,
    T.estado === 'finalizado' ? h('div', { class: 'aviso' }, 'Torneo finalizado.') : null,
    h('div', { class: 'fila', style: { alignItems: 'stretch' } }, caja(T.jugadores.length, 'jugadores', 'jugadores'), caja(T.inscripciones.length, 'inscripciones', 'inscritos'), caja(pend, 'pagos por validar', 'inscritos'), caja(T.cuadros.length, 'cuadros', 'cuadros'), caja(ps.length, 'partidos', 'partidos'), caja(pct(prog, ps.length), 'programado', 'programacion'), caja(pct(fin, ps.length), 'terminado', 'partidos')),
    h('h2', null, 'Estadísticas por categoría'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['Categoría', 'Estado', 'Inscritos', 'Excluidos', 'En cuadro', 'Partidos', 'Sin programar', 'Jugados', 'W.O.', 'Sets', 'Games', 'Minutos', 'Prom.'].map(x => h('th', null, x)))),
      h('tbody', null, T.eventos.map(ev => {
        const cs = T.cuadros.filter(c => c.evento === ev.id), pp = ps.filter(p => cs.some(c => c.id === p.c)), jug = pp.filter(p => p.decidido);
        const sets = jug.reduce((n, p) => n + (p.sets || []).length, 0), games = jug.reduce((n, p) => n + (p.sets || []).reduce((a, s) => a + s[0] + s[1], 0), 0);
        const min = jug.reduce((n, p) => n + (+(T.res[p.k] || {}).dur || 0), 0), conMin = jug.filter(p => (T.res[p.k] || {}).dur).length;
        const [et, cl] = estado(ev);
        return h('tr', null, h('td', null, ev.nombre), h('td', null, h('span', { class: 'chip ' + cl }, et)), h('td', null, T.inscripciones.filter(i => i.evento === ev.id).length), h('td', null, T.inscripciones.filter(i => i.evento === ev.id && i.lista === 'exclude').length),
          h('td', null, new Set(cs.flatMap(c => c.lineas)).size - (cs.some(c => c.lineas.includes(null)) ? 1 : 0) - (cs.some(c => c.lineas.includes('BYE')) ? 1 : 0)),
          h('td', null, pp.length), h('td', null, pp.filter(p => !p.fecha && !p.decidido).length), h('td', null, jug.length), h('td', null, jug.filter(p => p.est === 'wo' || p.est === 'wom').length), h('td', null, sets), h('td', null, games), h('td', null, min), h('td', null, conMin ? Math.round(min / conMin) : ''));
      }))),
    h('h2', null, 'Partidos por día'),
    h('table', { class: 't', style: { maxWidth: '760px' } }, h('thead', null, h('tr', null, h('th', null, 'Categoría'), T.dias.map(d => h('th', null, fCorta(d))), h('th', null, 'Sin programar'), h('th', null, 'Total'))),
      h('tbody', null, T.eventos.map(ev => { const pp = ps.filter(p => T.cuadros.some(c => c.id === p.c && c.evento === ev.id)); return h('tr', null, h('td', null, ev.nombre), T.dias.map(d => h('td', null, pp.filter(p => p.fecha === d).length || '')), h('td', null, pp.filter(p => !p.fecha).length || ''), h('td', null, pp.length)); }))),
    cumple.length ? h('div', { class: 'card', style: { marginTop: '14px' } }, h('b', null, 'Cumpleaños hoy: '), cumple.map(j => M.nombreJ(j, T)).join(', ')) : null,
    h('h2', null, 'Canchas'), ocupacionCanchas());
}
