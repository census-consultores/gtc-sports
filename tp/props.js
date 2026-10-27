// Propiedades del torneo (Tournament > Properties de TP): 12 secciones.
import { h, limpiar, modal, confirmar, campo, toast, fCorta, diasEntre } from './ui.js';
import { S, cambio, render } from './estado.js';
import * as M from './motor.js';

const SECC = [['info', 'Información'], ['dir', 'Dirección'], ['eventos', 'Categorías'], ['dias', 'Días'], ['franjas', 'Horarios'], ['sedes', 'Sedes y canchas'], ['rr', 'Round robin'], ['cuotas', 'Cuotas'], ['cuadros', 'Cuadros'], ['prog', 'Programación'], ['formatos', 'Puntuación'], ['oficiales', 'Oficiales'], ['estado', 'Estado del torneo']];

export function abrirPropiedades(inicial) {
  let sec = inicial || 'info';
  const m = modal({ titulo: 'Propiedades del torneo', clase: 'ancho', alCerrar: () => render() });
  const nav = h('nav'), cont = h('section');
  m.cuerpo.style.padding = '0';
  m.cuerpo.append(h('div', { class: 'props' }, nav, cont));
  const pintar = () => {
    limpiar(nav); limpiar(cont);
    SECC.forEach(([k, t]) => nav.append(h('button', { class: sec === k ? 'on' : '', onclick: () => { sec = k; pintar(); } }, t)));
    cont.append(SECCIONES[sec](pintar));
  };
  pintar();
  m.pie.append(h('button', { class: 'btn pri', onclick: () => m.cerrar() }, 'Listo'));
}
const c = () => cambio(true);

const SECCIONES = {
  info: () => { const i = S.T.info; return h('div', null, h('h2', null, 'Información'), h('div', { class: 'grid2' },
    campo(i, 'nombre', 'Nombre del torneo', { alCambiar: c }), campo(i, 'numero', 'Número de torneo', { alCambiar: c }),
    h('label', { class: 'f' }, 'Categoría del torneo (agrupa en la app)', h('input', { value: i.grupo || '', placeholder: 'Pádel, Olimpiadas, Mundialito +44…', onchange: e => { i.grupo = e.target.value; c(); } })),
    campo(i, 'deporte', 'Deporte', { opciones: M.DEPORTES, alCambiar: c }),
    campo(i, 'desde', 'Fecha de inicio', { tipo: 'date', alCambiar: c }), campo(i, 'hasta', 'Fecha de fin', { tipo: 'date', alCambiar: c }),
    campo(i, 'organizador', 'Organizador', { alCambiar: c }), campo(i, 'tel', 'Teléfono del organizador', { alCambiar: c }), campo(i, 'email', 'Correo del organizador', { tipo: 'email', alCambiar: c }),
    campo(i, 'arbitro', 'Juez árbitro', { alCambiar: c }), campo(i, 'arbitroTel', 'Teléfono del juez árbitro', { alCambiar: c }), campo(i, 'arbitroEmail', 'Correo del juez árbitro', { tipo: 'email', alCambiar: c })),
    h('p', { class: 'sub', style: { marginTop: '10px' } }, 'El deporte define los formatos de puntuación sugeridos. Cambiarlo no borra los formatos que ya existen.')); },
  dir: () => { const i = S.T.info; return h('div', null, h('h2', null, 'Dirección'), h('div', { class: 'grid2' },
    campo(i, 'sede', 'Sede', { alCambiar: c }), campo(i, 'direccion', 'Dirección', { alCambiar: c }), campo(i, 'ciudad', 'Ciudad', { alCambiar: c }), campo(i, 'pais', 'País', { alCambiar: c }),
    campo(i, 'zona', 'Zona horaria', { opciones: { 'America/Guayaquil': 'UTC-05:00 Bogotá, Lima, Quito' }, alCambiar: c }), campo(i, 'web', 'Sitio web', { alCambiar: c }))); },
  eventos: pintar => seccionEventos(pintar),
  dias: pintar => {
    const T = S.T, d = { dia: T.info.desde || '' };
    return h('div', null, h('h2', null, 'Días del torneo'), h('p', { class: 'sub' }, 'No tienen que ser consecutivos. Un día con partidos programados no se puede quitar.'),
      h('div', { class: 'fila' }, campo(d, 'dia', 'Agregar día', { tipo: 'date' }), h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, onclick: () => { if (!d.dia || T.dias.includes(d.dia)) return; T.dias.push(d.dia); T.dias.sort(); T.franjas[d.dia] = T.franjas[d.dia] || (T.dias.length > 1 ? T.franjas[T.dias[0]].slice() : M.generarFranjas('09:00', 75, '23:55', 10)); c(); pintar(); } }, 'Agregar'),
        h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, onclick: () => { diasEntre(T.info.desde, T.info.hasta).forEach(x => { if (!T.dias.includes(x)) { T.dias.push(x); T.franjas[x] = T.franjas[x] || M.generarFranjas('09:00', 75, '23:55', 10); } }); T.dias.sort(); c(); pintar(); } }, 'Todos los días entre inicio y fin')),
      h('table', { class: 't', style: { marginTop: '10px', maxWidth: '520px' } }, h('tbody', null, T.dias.map(x => h('tr', null, h('td', null, fCorta(x)), h('td', null, (T.franjas[x] || []).length + ' horarios'),
        h('td', { style: { textAlign: 'right' } }, h('button', { class: 'btn mini peligro', onclick: () => {
          if (Object.values(T.res).some(r => r.fecha === x)) return toast('Ese día tiene partidos programados.', 'error');
          T.dias = T.dias.filter(y => y !== x); delete T.franjas[x]; c(); pintar();
        } }, 'Quitar')))))));
  },
  franjas: pintar => {
    const T = S.T, g = { inicio: '09:00', intervalo: 75, fin: '23:55', max: 10, dia: T.dias[0] || '' };
    return h('div', null, h('h2', null, 'Horarios (franjas)'), h('p', { class: 'sub' }, 'Cada día tiene sus horarios de inicio de partido. Generador como en Tournament Planner.'),
      h('div', { class: 'card' }, h('div', { class: 'grid2' }, campo(g, 'inicio', 'Inicio', { tipo: 'time' }), campo(g, 'intervalo', 'Intervalo (minutos)', { tipo: 'number', min: 5, step: 5 }), campo(g, 'fin', 'Fin', { tipo: 'time' }), campo(g, 'max', 'Máximo de horarios', { tipo: 'number', min: 1, max: 96 })),
        h('div', { class: 'fila', style: { marginTop: '10px' } },
          campo(g, 'dia', 'Día', { opciones: Object.fromEntries(T.dias.map(d => [d, fCorta(d)])) }),
          h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, onclick: () => { if (!g.dia) return; T.franjas[g.dia] = M.generarFranjas(g.inicio, g.intervalo, g.fin, g.max); c(); pintar(); } }, 'Crear para este día'),
          h('button', { class: 'btn pri', style: { alignSelf: 'flex-end' }, onclick: () => { T.dias.forEach(d => { T.franjas[d] = M.generarFranjas(g.inicio, g.intervalo, g.fin, g.max); }); c(); pintar(); } }, 'Crear para todos los días'))),
      T.dias.map(d => h('div', { class: 'fila', style: { margin: '6px 0' } }, h('b', { style: { width: '90px' } }, fCorta(d)),
        (T.franjas[d] || []).map((x, i) => h('span', { class: 'chip' }, x, ' ', h('a', { href: '#', 'aria-label': 'Quitar ' + x, onclick: e => { e.preventDefault(); T.franjas[d].splice(i, 1); c(); pintar(); } }, '×'))),
        h('input', { type: 'time', style: { width: '110px' }, onchange: e => { const v = e.target.value; if (v && !T.franjas[d].includes(v)) { T.franjas[d].push(v); T.franjas[d].sort(); c(); pintar(); } } }))));
  },
  sedes: pintar => seccionSedes(pintar),
  rr: pintar => {
    const r = S.T.rr;
    return h('div', null, h('h2', null, 'Round robin'), h('div', { class: 'grid2' },
      campo(r, 'modo', 'Puntuación', { opciones: { partido: 'Puntos por partido', set: 'Puntos por set', game: 'Puntos por game', itf: 'ITF' }, alCambiar: () => { c(); pintar(); } })),
      r.modo === 'partido' && h('div', { class: 'grid2', style: { marginTop: '10px' } }, campo(r, 'pg', 'Partido ganado', { tipo: 'number', alCambiar: c }), campo(r, 'pe', 'Partido empatado', { tipo: 'number', alCambiar: c }), campo(r, 'pp', 'Partido perdido', { tipo: 'number', alCambiar: c }), campo(r, 'sinPuntosWO', 'Sin puntos para el perdedor por W.O.', { tipo: 'check', alCambiar: c })),
      r.modo === 'set' && h('div', { class: 'grid2', style: { marginTop: '10px' } }, ['Set ganado por 1 game', 'Set ganado por 2 games', 'Set ganado por 3 o más', 'Set empatado', 'Set perdido'].map((t, i) => h('label', { class: 'f' }, t, h('input', { type: 'number', value: r.ps[i], onchange: e => { r.ps[i] = +e.target.value; c(); } })))),
      r.modo === 'game' && h('p', { class: 'sub' }, '1 punto por cada game ganado.'),
      r.modo === 'itf' && h('p', { class: 'sub' }, 'Reglamento ITF: partidos ganados; con dos empatados, enfrentamiento directo; con más, porcentaje de sets y de games.'),
      r.modo !== 'itf' && [h('h3', null, 'Criterios de desempate (en este orden)'),
        h('table', { class: 't', style: { maxWidth: '560px' } }, h('tbody', null, r.criterios.map((x, i) => h('tr', null,
          h('td', null, h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: x.on, onchange: e => { x.on = e.target.checked; c(); } }), M.CRITERIOS[x.k])),
          h('td', { style: { textAlign: 'right' } }, h('button', { class: 'btn mini', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { r.criterios.splice(i - 1, 0, r.criterios.splice(i, 1)[0]); c(); pintar(); } }, '↑'), ' ',
            h('button', { class: 'btn mini', disabled: i === r.criterios.length - 1, 'aria-label': 'Bajar', onclick: () => { r.criterios.splice(i + 1, 0, r.criterios.splice(i, 1)[0]); c(); pintar(); } }, '↓')))))),
        h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => { r.criterios = M.nuevoTorneo({}).rr.criterios; c(); pintar(); } }, 'Volver al orden por defecto')]);
  },
  cuotas: pintar => {
    const q = S.T.cuotas;
    return h('div', null, h('h2', null, 'Cuotas de inscripción'), h('p', { class: 'sub' }, 'El cobro se hace fuera del sistema; aquí se calcula cuánto debe cada jugador y Deportes valida el pago en «Inscritos».'),
      h('div', { class: 'grid2' }, campo(q, 'base', 'Cálculo', { opciones: { inscripcion: 'Según inscripción', participacion: 'Según participación (solo en cuadro)' }, alCambiar: c }),
        campo(q, 'tipo', 'Tipo', { opciones: { suma: 'Suma de las cuotas de cada categoría', numero: 'Según número de categorías' }, alCambiar: () => { c(); pintar(); } }),
        campo(q, 'moneda', 'Moneda', { opciones: { USD: 'Dólares (USD)' }, alCambiar: c })),
      q.tipo === 'numero' && h('div', { class: 'grid2', style: { marginTop: '10px' } }, ['1.ª categoría', '2.ª categoría', '3.ª y siguientes'].map((t, i) => h('label', { class: 'f' }, t, h('input', { type: 'number', step: '0.01', value: q.precios[i], onchange: e => { q.precios[i] = +e.target.value; c(); } })))),
      q.tipo === 'suma' && h('p', { class: 'sub', style: { marginTop: '8px' } }, 'La cuota de cada categoría se define en «Categorías».'),
      h('h3', null, 'Artículos extra'),
      h('table', { class: 't', style: { maxWidth: '700px' } }, h('thead', null, h('tr', null, ['Nombre', 'Precio', 'Tipo', 'Obligatorio', ''].map(x => h('th', null, x)))), h('tbody', null, (q.extras || []).map((x, i) => h('tr', null,
        h('td', null, h('input', { value: x.nombre, onchange: e => { x.nombre = e.target.value; c(); } })), h('td', null, h('input', { type: 'number', step: '0.01', style: { width: '90px' }, value: x.precio, onchange: e => { x.precio = +e.target.value; c(); } })),
        h('td', null, h('select', { onchange: e => { x.tipo = e.target.value; c(); } }, [['si', 'Sí/No'], ['numero', 'Cantidad'], ['texto', 'Texto']].map(([v, t]) => h('option', { value: v, selected: x.tipo === v }, t)))),
        h('td', null, h('input', { type: 'checkbox', checked: x.oblig, onchange: e => { x.oblig = e.target.checked; c(); } })),
        h('td', null, h('button', { class: 'btn mini peligro', onclick: () => { q.extras.splice(i, 1); c(); pintar(); } }, 'Quitar')))))),
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => { (q.extras = q.extras || []).push({ id: M.id('x'), nombre: 'Camiseta', precio: 0, tipo: 'si', oblig: false }); c(); pintar(); } }, 'Agregar artículo'));
  },
  cuadros: () => { const o = S.T.opc; return h('div', null, h('h2', null, 'Opciones de cuadros'), h('div', { class: 'grid2' },
    campo(o, 'numPartido', 'Mostrar número de partido', { tipo: 'check', alCambiar: c }), campo(o, 'duracion', 'Mostrar duración', { tipo: 'check', alCambiar: c }),
    campo(o, 'negrita', 'Sembrados en negrita', { tipo: 'check', alCambiar: c }), campo(o, 'byeNum', 'Numerar los byes', { tipo: 'check', alCambiar: c }),
    campo(o, 'cancha', 'Mostrar cancha', { tipo: 'check', alCambiar: c }), campo(o, 'sede', 'Mostrar sede', { tipo: 'check', alCambiar: c }),
    campo(o, 'alfabetico', 'Parejas en orden alfabético', { tipo: 'check', alCambiar: c }), campo(o, 'rondasRR', 'Mostrar número de ronda en round robin', { tipo: 'check', alCambiar: c }),
    campo(o, 'checkin', 'Registro de llegada (check-in)', { opciones: { partido: 'Por partido', jugador: 'Por jugador (se reinicia cada día)' }, alCambiar: c }),
    campo(o, 'primerCheckin', 'Marcar la primera llegada del jugador', { tipo: 'check', alCambiar: c }),
    campo(o, 'descanso', 'Minutos de descanso tras un partido', { tipo: 'number', min: 0, alCambiar: c }),
    campo(o, 'mixto', 'Orden de nombres en mixtos', { opciones: { h: 'Hombre primero', m: 'Mujer primero' }, alCambiar: c }),
    campo(o, 'nombres', 'Formato de nombres', { opciones: { nombre: 'Nombre Apellido', apellido: 'Apellido, Nombre' }, alCambiar: c }))); },
  prog: () => { const p = S.T.prog; return h('div', null, h('h2', null, 'Programación'), h('div', { class: 'grid2' },
    campo(p, 'maxDia', 'Máximo de partidos por día (por jugador)', { tipo: 'number', min: 1, alCambiar: c }),
    campo(p, 'maxEvento', 'Máximo por categoría', { tipo: 'number', min: 1, alCambiar: c }),
    campo(p, 'periodo', 'Periodo del máximo por categoría', { opciones: { 1: 'Por día', 2: 'Cada 2 días', 7: 'Por semana', 14: 'Cada 2 semanas', 21: 'Cada 3 semanas', 28: 'Cada 4 semanas' }, num: true, alCambiar: c }),
    campo(p, 'maxInd', 'Máximo de individuales por día', { tipo: 'number', min: 1, alCambiar: c }),
    campo(p, 'duracion', 'Duración media de un partido (min)', { tipo: 'number', min: 10, alCambiar: c }),
    campo(p, 'descanso', 'Descanso entre inicios de partido de un jugador (min)', { tipo: 'number', min: 0, alCambiar: c }),
    campo(p, 'avisarSig', 'Preguntar por el siguiente partido al guardar un resultado', { tipo: 'check', alCambiar: c }),
    campo(p, 'intercambios', 'Permitir intercambiar partidos al programar', { tipo: 'check', alCambiar: c }))); },
  formatos: pintar => seccionFormatos(pintar),
  oficiales: pintar => {
    const T = S.T;
    return h('div', null, h('h2', null, 'Oficiales'), h('table', { class: 't' }, h('thead', null, h('tr', null, ['Nombre', 'Función', 'País', 'Desde', 'Hasta', ''].map(x => h('th', null, x)))),
      h('tbody', null, T.oficiales.map((o, i) => h('tr', null,
        h('td', null, h('input', { value: o.nombre, onchange: e => { o.nombre = e.target.value; c(); } })),
        h('td', null, h('select', { onchange: e => { o.funcion = e.target.value; c(); } }, ['Juez árbitro', 'Juez árbitro adjunto', 'Supervisor', 'Juez de silla', 'Juez de línea', 'Veedor'].map(f => h('option', { selected: o.funcion === f }, f)))),
        h('td', null, h('input', { value: o.pais || 'Ecuador', style: { width: '110px' }, onchange: e => { o.pais = e.target.value; c(); } })),
        h('td', null, h('input', { type: 'date', value: o.desde || '', onchange: e => { o.desde = e.target.value; c(); } })), h('td', null, h('input', { type: 'date', value: o.hasta || '', onchange: e => { o.hasta = e.target.value; c(); } })),
        h('td', null, h('button', { class: 'btn mini peligro', onclick: () => { T.oficiales.splice(i, 1); c(); pintar(); } }, 'Quitar')))))),
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => { T.oficiales.push({ id: M.id('o'), nombre: '', funcion: 'Juez de silla', pais: 'Ecuador' }); c(); pintar(); } }, 'Agregar oficial'));
  },
  estado: () => { const T = S.T; T.estado = T.estado || 'curso'; return h('div', null, h('h2', null, 'Estado del torneo'),
    h('div', { class: 'grid2' }, campo(T, 'estado', 'Estado', { opciones: { borrador: 'Borrador (en preparación)', curso: 'En curso', finalizado: 'Finalizado' }, alCambiar: c })),
    h('p', { class: 'sub j', style: { marginTop: '10px' } }, 'En la app, los torneos en curso solo los ven los socios con sesión iniciada; los finalizados son públicos. Lo que se muestra se controla en «Publicar».')); }
};

// ---------- Categorías (Events) ----------
const PRE = () => {
  const L = [], T = S.T, dob = T.info.deporte === 'padel';
  const g = [['M', 'Caballeros'], ['F', 'Damas']];
  (dob ? [] : g).forEach(([k, n]) => L.push({ nombre: 'Individual ' + n, genero: k, tipo: 'S' }));
  g.forEach(([k, n]) => L.push({ nombre: 'Dobles ' + n, genero: k, tipo: 'D' }));
  L.push({ nombre: 'Dobles Mixto', genero: 'X', tipo: 'D' });
  for (let n = 1; n <= 6; n++) g.forEach(([k, nn]) => L.push({ nombre: (dob ? 'Dobles ' : 'Individual ') + nn + ' ' + n + '.ª', genero: k, tipo: dob ? 'D' : 'S', nivel: String(n) }));
  [12, 14, 16, 18].forEach(e => [['B', 'Niños'], ['G', 'Niñas']].forEach(([k, n]) => L.push({ nombre: n + ' sub-' + e, genero: k, tipo: dob ? 'D' : 'S', edadMax: e })));
  [35, 40, 45, 50, 55, 60, 65, 70, 75].forEach(e => g.forEach(([k, n]) => L.push({ nombre: n + ' +' + e, genero: k, tipo: dob ? 'D' : 'S', edadMin: e })));
  return L;
};
function seccionEventos(pintar) {
  const T = S.T;
  return h('div', null, h('h2', null, 'Categorías'), h('p', { class: 'sub' }, 'Cada categoría (evento) tiene sus inscritos, etapas y cuadros. Solo se puede borrar si no tiene inscritos ni cuadros.'),
    h('div', { class: 'fila' }, h('button', { class: 'btn pri', onclick: () => editarEvento(null, pintar) }, 'Agregar'), h('button', { class: 'btn', onclick: () => elegirPredefinidas(pintar) }, 'Elegir de la lista')),
    h('table', { class: 't', style: { marginTop: '10px' } }, h('thead', null, h('tr', null, ['Nombre', 'Género', 'Tipo', 'Nivel', 'Edad', 'Cuota', 'Inscritos', ''].map(x => h('th', null, x)))),
      h('tbody', null, T.eventos.map((e, i) => h('tr', null, h('td', null, h('a', { href: '#', onclick: ev => { ev.preventDefault(); editarEvento(e, pintar); } }, e.nombre)),
        h('td', null, M.GENEROS[e.genero]), h('td', null, e.tipo === 'D' ? 'Dobles' : 'Individual'), h('td', null, e.nivel || ''),
        h('td', null, [e.edadMin ? '≥' + e.edadMin : '', e.edadMax ? '≤' + e.edadMax : ''].filter(Boolean).join(' ')), h('td', null, e.cuota ? '$' + e.cuota : ''),
        h('td', null, T.inscripciones.filter(x => x.evento === e.id).length),
        h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
          h('button', { class: 'btn mini', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { T.eventos.splice(i - 1, 0, T.eventos.splice(i, 1)[0]); c(); pintar(); } }, '↑'), ' ',
          h('button', { class: 'btn mini peligro', onclick: () => {
            if (T.inscripciones.some(x => x.evento === e.id) || T.cuadros.some(x => x.evento === e.id)) return toast('La categoría tiene inscritos o cuadros: bórralos primero.', 'error');
            T.eventos.splice(i, 1); c(); pintar();
          } }, 'Borrar')))))));
}
function elegirPredefinidas(pintar) {
  const T = S.T, sel = new Set(), q = { cuota: 0 };
  const m = modal({ titulo: 'Elegir categorías' });
  m.cuerpo.append(h('div', { style: { maxHeight: '50vh', overflow: 'auto', columns: '2' } }, PRE().map((e, i) => h('label', { class: 'ck', style: { breakInside: 'avoid', padding: '2px 0' } }, h('input', { type: 'checkbox', onchange: ev => ev.target.checked ? sel.add(i) : sel.delete(i) }), e.nombre))),
    h('div', { class: 'grid2', style: { marginTop: '12px' } }, campo(q, 'cuota', 'Cuota para las elegidas (USD)', { tipo: 'number', step: '0.01' })));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => { const L = PRE(); sel.forEach(i => T.eventos.push(M.nuevoEvento(T, { ...L[i], cuota: q.cuota }))); c(); m.cerrar(); pintar(); } }, 'Agregar'));
}
export function editarEvento(e, pintar) {
  const T = S.T, nuevo = !e;
  const ev = e ? JSON.parse(JSON.stringify(e)) : M.nuevoEvento(T, {});
  let tab = 'gen';
  const m = modal({ titulo: nuevo ? 'Nueva categoría' : 'Categoría · ' + ev.nombre });
  const tabs = h('div', { class: 'tabs' }), cont = h('div'), err = h('div');
  const pint = () => {
    limpiar(tabs); limpiar(cont);
    [['gen', 'General'], ['etapas', 'Etapas'], ['disp', 'Disponibilidad']].forEach(([k, t]) => tabs.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; pint(); } }, t)));
    if (tab === 'gen') cont.append(h('div', { class: 'grid2' }, campo(ev, 'nombre', 'Nombre'), campo(ev, 'genero', 'Género', { opciones: M.GENEROS }), campo(ev, 'tipo', 'Tipo', { opciones: { S: 'Individual', D: 'Dobles' } }),
      campo(ev, 'nivel', 'Nivel', { opciones: { '': 'Ninguno', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9+' } }), campo(ev, 'edadMin', 'Edad mínima (0 = sin límite)', { tipo: 'number', min: 0 }), campo(ev, 'edadMax', 'Edad máxima (0 = sin límite)', { tipo: 'number', min: 0 }),
      campo(ev, 'cuota', 'Cuota (USD)', { tipo: 'number', step: '0.01' }), campo(ev, 'cupo', 'Cupo máximo (0 = sin límite)', { tipo: 'number', min: 0 }), campo(ev, 'sepSiembra', 'Siembra separada para clasificación y cuadro principal', { tipo: 'check' })));
    if (tab === 'etapas') {
      const fm = { '': 'Formato del torneo', ...Object.fromEntries(T.formatos.map(f => [f.id, f.nombre])) };
      cont.append(h('p', { class: 'sub' }, 'Cuadro principal, Reserva y Excluidos no se pueden quitar. Cada etapa puede tener su propio formato de puntuación.'),
        h('table', { class: 't' }, h('thead', null, h('tr', null, ['Etapa', 'Formato', 'Formato de su consolación', ''].map(x => h('th', null, x)))), h('tbody', null, ev.etapas.map((s, i) => h('tr', null,
          h('td', null, M.ETAPAS[s.tipo] || s.tipo),
          h('td', null, ['reserve', 'exclude'].includes(s.tipo) ? '' : h('select', { onchange: x => { s.formato = x.target.value || null; } }, Object.entries(fm).map(([v, t]) => h('option', { value: v, selected: (s.formato || '') === v }, t)))),
          h('td', null, ['reserve', 'exclude'].includes(s.tipo) ? '' : h('select', { onchange: x => { s.formatoCons = x.target.value || null; } }, Object.entries(fm).map(([v, t]) => h('option', { value: v, selected: (s.formatoCons || '') === v }, t)))),
          h('td', null, ['main', 'reserve', 'exclude'].includes(s.tipo) ? '' : h('button', { class: 'btn mini peligro', onclick: () => { if (T.cuadros.some(x => x.evento === ev.id && x.etapa === s.id)) return toast('La etapa tiene cuadros.', 'error'); ev.etapas.splice(i, 1); pint(); } }, 'Quitar')))))),
        h('div', { class: 'fila', style: { marginTop: '8px' } }, h('select', { id: 'nuevaEtapa' }, Object.entries(M.ETAPAS).filter(([k]) => !ev.etapas.some(s => s.tipo === k)).map(([k, t]) => h('option', { value: k }, t))),
          h('button', { class: 'btn', onclick: () => { const v = document.getElementById('nuevaEtapa').value; if (v) { ev.etapas.push({ id: v, tipo: v }); pint(); } } }, 'Agregar etapa')));
    }
    if (tab === 'disp') cont.append(h('p', { class: 'sub' }, 'Marca los horarios en que esta categoría no se juega.'), matriz(ev.noDisp = ev.noDisp || {}, () => { }));
  };
  pint();
  m.cuerpo.append(tabs, cont, err);
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => {
    limpiar(err);
    if (!String(ev.nombre).trim()) return err.append(h('div', { class: 'error' }, 'Escribe el nombre de la categoría.'));
    const igual = T.eventos.find(x => x.id !== ev.id && x.genero === ev.genero && x.tipo === ev.tipo && String(x.nivel || '') === String(ev.nivel || '') && +x.edadMin === +ev.edadMin && +x.edadMax === +ev.edadMax);
    if (igual) toast('Aviso: «' + igual.nombre + '» tiene las mismas propiedades. Puedes tener varios cuadros dentro de una misma categoría.', 'error');
    if (nuevo) T.eventos.push(ev); else Object.assign(e, ev);
    c(); m.cerrar(); pintar && pintar();
  } }, 'Guardar'));
}

// ---------- Matriz de disponibilidad día × horario ----------
// sel: { dia: [hora, ...] } con los horarios marcados (no disponible)
export function matriz(sel, alCambiar) {
  const T = S.T, w = h('div');
  const horas = [...new Set(T.dias.flatMap(d => T.franjas[d] || []))].sort();
  if (!T.dias.length) return h('div', { class: 'vacio' }, 'Primero define los días y horarios del torneo.');
  const dibujar = () => {
    limpiar(w);
    const tabla = h('table', { class: 'matriz' });
    tabla.append(h('tr', null, h('th'), horas.map(x => h('th', { class: 'v' }, x)), h('th', null, 'Día')));
    T.dias.forEach(d => {
      const tr = h('tr', null, h('th', { style: { textAlign: 'right' } }, fCorta(d)));
      horas.forEach(x => {
        const existe = (T.franjas[d] || []).includes(x);
        tr.append(h('td', { class: !existe ? 'x' : (sel[d] || []).includes(x) ? 'b' : '', title: fCorta(d) + ' ' + x, onclick: existe ? () => {
          sel[d] = sel[d] || []; const i = sel[d].indexOf(x); if (i >= 0) sel[d].splice(i, 1); else sel[d].push(x); if (!sel[d].length) delete sel[d]; alCambiar(); dibujar();
        } : null }));
      });
      tr.append(h('td', { style: { width: 'auto', padding: '0 6px' } }, h('button', { class: 'btn mini', title: 'Todo el día', onclick: () => { const todas = T.franjas[d] || []; if (todas.every(x => (sel[d] || []).includes(x))) delete sel[d]; else sel[d] = todas.slice(); alCambiar(); dibujar(); } }, 'Todo')));
      tabla.append(tr);
    });
    w.append(h('div', { class: 'leyenda' }, h('span', null, h('i', { style: { background: 'var(--c-nodisp)' } }), 'No disponible'), h('span', null, h('i', { style: { background: 'var(--c-sin)' } }), 'Sin horario ese día')), tabla);
  };
  dibujar();
  return w;
}

// ---------- Sedes y canchas ----------
function seccionSedes(pintar) {
  const T = S.T, nuevo = { n: 4, prefijo: 'Cancha ', modo: 'numeros' };
  return h('div', null, h('h2', null, 'Sedes y canchas'),
    h('p', { class: 'sub' }, 'Cada cancha tiene su disponibilidad. Marca en la matriz los horarios en que una cancha está ocupada (clases, reservas, otros eventos).'),
    T.sedes.map((s, si) => h('div', { class: 'card' },
      h('div', { class: 'grid2' }, campo(s, 'nombre', 'Sede', { alCambiar: c }), campo(s, 'direccion', 'Dirección', { alCambiar: c })),
      h('h3', null, 'Canchas (' + s.canchas.length + ')'),
      h('table', { class: 't' }, h('tbody', null, s.canchas.map((k, i) => h('tr', null,
        h('td', null, h('input', { value: k.nombre, onchange: e => { k.nombre = e.target.value; c(); } })),
        h('td', null, Object.values(T.bloqueos[k.id] || {}).reduce((n, a) => n + a.length, 0) + ' horarios bloqueados'),
        h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
          h('button', { class: 'btn mini', onclick: () => { const mm = modal({ titulo: 'Disponibilidad · ' + k.nombre, clase: 'ancho', alCerrar: pintar }); T.bloqueos[k.id] = T.bloqueos[k.id] || {}; mm.cuerpo.append(h('p', { class: 'sub' }, 'Marca los horarios en que la cancha NO está disponible.'), matriz(T.bloqueos[k.id], c)); mm.pie.append(h('button', { class: 'btn', onclick: () => { s.canchas.forEach(o => { if (o.id !== k.id) T.bloqueos[o.id] = JSON.parse(JSON.stringify(T.bloqueos[k.id] || {})); }); c(); toast('Copiado a las demás canchas de la sede.'); } }, 'Copiar a todas las canchas'), h('button', { class: 'btn pri', onclick: () => { mm.cerrar(); pintar(); } }, 'Listo')); } }, 'Disponibilidad'), ' ',
          h('button', { class: 'btn mini', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { s.canchas.splice(i - 1, 0, s.canchas.splice(i, 1)[0]); c(); pintar(); } }, '↑'), ' ',
          h('button', { class: 'btn mini peligro', onclick: () => { if (Object.values(T.res).some(r => r.cancha === k.id)) return toast('La cancha tiene partidos asignados.', 'error'); s.canchas.splice(i, 1); delete T.bloqueos[k.id]; c(); pintar(); } }, 'Quitar')))))),
      h('div', { class: 'fila', style: { marginTop: '8px' } }, campo(nuevo, 'n', 'Crear canchas', { tipo: 'number', min: 1, max: 40 }), campo(nuevo, 'prefijo', 'Prefijo'), campo(nuevo, 'modo', 'Numeración', { opciones: { numeros: '1, 2, 3…', letras: 'A, B, C…' } }),
        h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, onclick: () => { const base = s.canchas.length; for (let i = 0; i < nuevo.n; i++) s.canchas.push({ id: M.id('k'), nombre: nuevo.prefijo + (nuevo.modo === 'letras' ? String.fromCharCode(65 + base + i) : base + i + 1) }); c(); pintar(); } }, 'Crear'),
        T.sedes.length > 1 && h('button', { class: 'btn peligro', style: { alignSelf: 'flex-end' }, onclick: () => { if (s.canchas.length) return toast('Quita primero las canchas de esta sede.', 'error'); T.sedes.splice(si, 1); c(); pintar(); } }, 'Quitar sede')))),
    h('button', { class: 'btn', onclick: () => { T.sedes.push({ id: M.id('s'), nombre: 'Otra sede', direccion: '', canchas: [] }); c(); pintar(); } }, 'Agregar sede'),
    h('h3', null, 'Capacidad'), h('p', { class: 'sub' }, T.dias.reduce((n, d) => n + (T.franjas[d] || []).reduce((m2, x) => m2 + M.canchasDisponibles(T, d, x).length, 0), 0) + ' partidos posibles en todo el torneo (canchas disponibles × horarios).'));
}

// ---------- Formatos de puntuación ----------
function seccionFormatos(pintar) {
  const T = S.T;
  return h('div', null, h('h2', null, 'Formatos de puntuación'), h('p', { class: 'sub' }, 'El formato por defecto vale para todo el torneo; cada etapa de una categoría puede usar otro (Categorías > Etapas).'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['Nombre', 'Sets', 'Tipo de set', 'Último set', 'Por defecto', ''].map(x => h('th', null, x)))), h('tbody', null, T.formatos.map((f, i) => h('tr', null,
      h('td', null, h('a', { href: '#', onclick: e => { e.preventDefault(); editarFormato(f, pintar); } }, f.nombre)), h('td', null, 'Al mejor de ' + f.bestOf), h('td', null, M.SETS[f.tipo].n), h('td', null, M.SETS[f.ultimo || f.tipo].n),
      h('td', null, h('input', { type: 'radio', name: 'fdef', checked: !!f.defecto, onchange: () => { T.formatos.forEach(x => { x.defecto = x === f; }); c(); } })),
      h('td', null, h('button', { class: 'btn mini peligro', disabled: T.formatos.length < 2, onclick: () => { T.formatos.splice(i, 1); if (!T.formatos.some(x => x.defecto)) T.formatos[0].defecto = true; c(); pintar(); } }, 'Quitar')))))),
    h('div', { class: 'fila', style: { marginTop: '8px' } }, h('button', { class: 'btn pri', onclick: () => editarFormato(null, pintar) }, 'Agregar formato'), campo(T, 'autocompletar', 'Autocompletar marcadores (se escribe el marcador de quien pierde cada set)', { tipo: 'check', alCambiar: c })));
}
function editarFormato(f, pintar) {
  const T = S.T, nuevo = !f, x = f ? { ...f } : { id: M.id('f'), nombre: '', bestOf: 3, tipo: 'normal', ultimo: 'normal', games: 6, puntos: 11, ganarPor2: true };
  const m = modal({ titulo: nuevo ? 'Nuevo formato' : 'Formato · ' + x.nombre });
  const cont = h('div');
  const pint = () => { limpiar(cont); const op = Object.fromEntries(Object.entries(M.SETS).map(([k, v]) => [k, v.n]));
    cont.append(h('div', { class: 'grid2' }, campo(x, 'nombre', 'Nombre'), campo(x, 'bestOf', 'Al mejor de (sets)', { opciones: { 1: '1', 2: '2', 3: '3', 5: '5', 7: '7' }, num: true }),
      campo(x, 'tipo', 'Tipo de set', { opciones: op, alCambiar: pint }), campo(x, 'ultimo', 'Último set', { opciones: op, alCambiar: pint }),
      (x.tipo === 'custom' || x.ultimo === 'custom') && campo(x, 'games', 'Games para ganar el set (personalizado)', { tipo: 'number', min: 1 }),
      (x.tipo === 'puntos' || x.ultimo === 'puntos') && [campo(x, 'puntos', 'Puntos para ganar un set', { tipo: 'number', min: 1 }), campo(x, 'puntosUltimo', 'Puntos del último set (vacío = igual)', { tipo: 'number', min: 0 }), campo(x, 'ganarPor2', 'Ganar por 2 de diferencia', { tipo: 'check' }), campo(x, 'tope', 'Tope de puntos (0 = sin tope)', { tipo: 'number', min: 0 })]),
      h('p', { class: 'sub', style: { marginTop: '10px' } }, 'Ejemplos: tenis «Al mejor de 3, set normal, último match tie-break (10)»; ping pong «Al mejor de 5, por puntos, 11, ganar por 2»; pádel con punto de oro: se registra igual, por games.'));
  };
  pint(); m.cuerpo.append(cont);
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => { if (!String(x.nombre).trim()) return toast('Escribe un nombre.', 'error'); if (nuevo) T.formatos.push(x); else Object.assign(f, x); c(); m.cerrar(); pintar(); } }, 'Guardar'));
}
