// Jugadores (Players) e Inscritos (Roster) del módulo de torneos.
import { h, limpiar, modal, confirmar, campo, toast, fCorta, descargar, csv } from './ui.js';
import { S, api, cambio, render, guardar, R, puedeEscribir } from './estado.js';
import * as M from './motor.js';
import { matriz } from './props.js';

const ins = id => S.T.inscripciones.find(i => i.id === id);
const jug = id => S.T.jugadores.find(j => j.id === id);
function enCuadro(insId) { return S.T.cuadros.some(c => (c.lineas || []).includes(insId)); }

// ---------- Jugadores ----------
export function vistaJugadores() {
  const T = S.T, q = { t: S._qj || '' };
  const filtrar = j => !q.t || (M.nombreJ(j, T) + ' ' + (j.socio || '') + ' ' + (j.club || '')).toLowerCase().includes(q.t.toLowerCase());
  const tbody = h('tbody');
  const pintar = () => {
    limpiar(tbody);
    T.jugadores.filter(filtrar).sort((a, b) => M.nombreJ(a, T).localeCompare(M.nombreJ(b, T), 'es')).forEach(j => {
      const evs = T.inscripciones.filter(i => i.j1 === j.id || i.j2 === j.id).map(i => (T.eventos.find(e => e.id === i.evento) || {}).nombre).filter(Boolean);
      const cu = M.cuotaJugador(T, j.id), e = M.edad(j.nac, T.info.desde);
      tbody.append(h('tr', { onclick: () => editarJugador(j), style: { cursor: 'pointer' } },
        h('td', null, M.nombreJ(j, T), j.nota ? h('span', { class: 'chip oro', style: { marginLeft: '6px' } }, 'Nota') : null),
        h('td', null, j.invitado ? h('span', { class: 'chip azul' }, 'Invitado') : (j.socio || '')), h('td', null, j.genero === 'F' ? 'F' : 'M'),
        h('td', null, e != null ? e + ' años' : '', M.esMenor(j, T) ? h('span', { class: 'chip rojo', style: { marginLeft: '6px' } }, 'Menor') : null),
        h('td', null, j.club || ''), h('td', null, evs.join(', ')),
        h('td', null, cu.total ? '$' + cu.total.toFixed(2) : ''), h('td', null, cu.total ? (cu.saldo > 0 ? h('span', { class: 'chip pend' }, 'Debe $' + cu.saldo.toFixed(2)) : h('span', { class: 'chip ok' }, 'Al día')) : '')));
    });
    if (!tbody.children.length) tbody.append(h('tr', null, h('td', { colspan: 8, class: 'vacio' }, T.jugadores.length ? 'Sin coincidencias.' : 'Todavía no hay jugadores. Agrégalos con «Agregar jugador» o «Importar».')));
  };
  pintar();
  return h('div', null, h('h1', null, 'Jugadores'), h('p', { class: 'sub' }, T.jugadores.length + ' jugadores · solo socios' + (M.invitadosPermitidos(T) ? ' (beach tenis admite hasta ' + M.MAX_INVITADOS + ' invitados: ' + T.jugadores.filter(j => j.invitado).length + ' usados)' : '')),
    h('div', { class: 'fila no-print', style: { marginBottom: '10px' } },
      h('input', { type: 'search', placeholder: 'Buscar por nombre, socio o club', value: q.t, style: { width: '300px' }, oninput: e => { q.t = S._qj = e.target.value; pintar(); } }),
      h('div', { class: 'esp' }),
      puedeEscribir() && h('button', { class: 'btn pri', onclick: () => editarJugador(null) }, 'Agregar jugador'),
      puedeEscribir() && h('button', { class: 'btn', onclick: importar }, 'Importar desde Excel'),
      h('button', { class: 'btn', onclick: revisarJugadores }, 'Revisar jugadores'),
      h('button', { class: 'btn', onclick: () => descargar((T.info.nombre || 'torneo') + ' - jugadores.csv', csv([['Apellido', 'Nombre', 'Socio', 'Género', 'Nacimiento', 'Club', 'Correo', 'Teléfono', 'Categorías', 'Cuota', 'Saldo']].concat(T.jugadores.map(j => { const cu = M.cuotaJugador(T, j.id); return [j.apellido, j.nombre, j.socio, j.genero, j.nac, j.club, j.email, j.tel, T.inscripciones.filter(i => i.j1 === j.id || i.j2 === j.id).map(i => (T.eventos.find(e => e.id === i.evento) || {}).nombre).join(' / '), cu.total, cu.saldo]; })))) }, 'Exportar')),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['Nombre', 'Socio', 'Género', 'Edad', 'Club', 'Categorías', 'Cuota', 'Pago'].map(x => h('th', null, x)))), tbody));
}

export function editarJugador(j0, alGuardar) {
  const T = S.T, nuevo = !j0;
  const j = j0 ? JSON.parse(JSON.stringify(j0)) : { id: M.id('j'), apellido: '', nombre: '', genero: 'M', nac: '', socio: '', cedula: '', club: 'Guayaquil Tenis Club', metodo: 'manual', fechaIns: new Date().toISOString(), noDisp: {}, pagos: [], extras: {} };
  // inscripciones de este jugador en el formulario: evento -> { on, pareja }
  const insc = {}; T.eventos.forEach(e => { const i = T.inscripciones.find(x => x.evento === e.id && (x.j1 === j.id || x.j2 === j.id)); insc[e.id] = { on: !!i, pareja: i ? (i.j1 === j.id ? i.j2 : i.j1) || (i.busca ? 'busca' : '') : '' }; });
  let tab = 'gen';
  const m = modal({ titulo: nuevo ? 'Nuevo jugador' : M.nombreJ(j0, T), clase: 'ancho' });
  const tabs = h('div', { class: 'tabs' }), cont = h('div'), err = h('div');
  const pint = () => {
    limpiar(tabs); limpiar(cont);
    [['gen', 'General'], ['dir', 'Contacto'], ['nivel', 'Nivel y ranking'], ['ev', 'Categorías'], ['disp', 'Disponibilidad'], ['cuota', 'Cuota'], ['nota', 'Nota'], ['avisos', 'Avisos']].forEach(([k, t]) => tabs.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; pint(); } }, t)));
    if (tab === 'gen') {
      const buscar = { q: '' }, res = h('div');
      cont.append(nuevo && h('div', { class: 'card' }, h('div', { class: 'fila' }, h('input', { type: 'search', placeholder: 'Buscar socio por nombre, código o cédula', style: { flex: 1 }, onkeydown: e => { if (e.key === 'Enter') go(e.target.value); } }), h('button', { class: 'btn', onclick: e => go(e.target.previousSibling.value) }, 'Buscar')), res),
        h('div', { class: 'grid2' }, campo(j, 'apellido', 'Apellidos'), campo(j, 'nombre', 'Nombres'), campo(j, 'genero', 'Género', { opciones: { M: 'Masculino', F: 'Femenino' } }), campo(j, 'nac', 'Fecha de nacimiento', { tipo: 'date' }),
          j.invitado ? null : campo(j, 'socio', 'Código de socio'), campo(j, 'cedula', 'Cédula (para avisos; no se publica)'), campo(j, 'club', 'Club'), campo(j, 'ciudad', 'Ciudad'),
          M.invitadosPermitidos(T) && campo(j, 'invitado', 'Invitado (no socio)', { tipo: 'check', alCambiar: pint })),
        h('p', { class: 'sub', style: { marginTop: '8px' } }, 'Inscrito el ' + new Date(j.fechaIns || Date.now()).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) + ' · método: ' + (j.metodo === 'internet' ? 'Internet' : 'manual')));
      async function go(t) {
        limpiar(res); if (String(t).trim().length < 2) return;
        res.append(h('p', { class: 'sub' }, 'Buscando…'));
        const r = await api('tp_buscar', { q: t }); limpiar(res);
        if (!r.ok || !r.personas.length) return res.append(h('p', { class: 'sub' }, 'Sin resultados en las nóminas ni en las cuentas de la app. Puedes escribir los datos a mano.'));
        res.append(h('table', { class: 't' }, h('tbody', null, r.personas.map(p => h('tr', { style: { cursor: 'pointer' }, onclick: () => {
          const partes = String(p.nombre || '').trim().split(/\s+/);
          if (partes.length >= 4) { j.apellido = partes.slice(0, 2).join(' '); j.nombre = partes.slice(2).join(' '); } else if (partes.length >= 2) { j.apellido = partes.slice(0, -1).join(' '); j.nombre = partes.slice(-1).join(' '); } else j.apellido = p.nombre;
          j.apellido = M.nombreJ({ nombre: j.apellido }, null).toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()); j.nombre = String(j.nombre).toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
          j.socio = p.socio || ''; j.cedula = p.cedula || ''; if (p.nac) j.nac = p.nac; if (p.email) j.email = p.email; if (p.tel) j.tel = p.tel; pint();
        } }, h('td', null, p.nombre), h('td', null, p.socio ? 'Socio ' + p.socio : ''), h('td', null, p.cedula ? '•••' + String(p.cedula).slice(-4) : '')))))); }
    }
    if (tab === 'dir') cont.append(h('div', { class: 'grid2' }, campo(j, 'direccion', 'Dirección'), campo(j, 'tel', 'Móvil'), campo(j, 'email', 'Correo', { tipo: 'email' })),
      h('p', { class: 'sub', style: { marginTop: '8px' } }, 'Los avisos automáticos llegan por push y correo a la cuenta del socio en la app (por su código y cédula).'));
    if (tab === 'nivel') cont.append(h('div', { class: 'grid2' }, campo(j, 'nivel', 'Nivel individual'), campo(j, 'nivelD', 'Nivel dobles'), campo(j, 'rating', 'Rating individual', { tipo: 'number', step: 'any' }), campo(j, 'ratingD', 'Rating dobles', { tipo: 'number', step: 'any' }), campo(j, 'ranking', 'Ranking', { tipo: 'number' }), campo(j, 'puntos', 'Puntos de ranking', { tipo: 'number' })));
    if (tab === 'ev') {
      if (!T.eventos.length) cont.append(h('div', { class: 'vacio' }, 'Primero crea las categorías en Propiedades.'));
      T.eventos.forEach(e => {
        const st = insc[e.id], avisos = M.chequeoInscripcion(T, e, j);
        const parejas = T.jugadores.filter(x => x.id !== j.id && T.inscripciones.some(i => i.evento === e.id && i.j1 === x.id && !i.j2 && i.busca !== false));
        const actual = st.pareja && st.pareja !== 'busca' ? jug(st.pareja) : null;
        cont.append(h('div', { class: 'fila', style: { padding: '6px 0', borderBottom: '1px solid var(--line-2)' } },
          h('label', { class: 'ck', style: { width: '260px' } }, h('input', { type: 'checkbox', checked: st.on, onchange: ev => { st.on = ev.target.checked; pint(); } }), e.nombre),
          e.tipo === 'D' && st.on && h('label', { class: 'f' }, 'Pareja', h('select', { onchange: ev => { st.pareja = ev.target.value; } },
            h('option', { value: '' }, '— Sin pareja —'), h('option', { value: 'busca', selected: st.pareja === 'busca' }, '‹Busca pareja›'),
            actual && h('option', { value: actual.id, selected: true }, M.nombreJ(actual, T)),
            parejas.filter(x => !actual || x.id !== actual.id).map(x => h('option', { value: x.id, selected: st.pareja === x.id }, M.nombreJ(x, T))))),
          avisos.map(a => h('span', { class: 'chip rojo' }, a))));
      });
      cont.append(h('p', { class: 'sub', style: { marginTop: '8px' } }, 'En dobles solo aparecen como posible pareja quienes ya están inscritos en la categoría sin pareja. El vínculo es recíproco.'));
    }
    if (tab === 'disp') cont.append(h('p', { class: 'sub' }, 'Horarios en que el jugador no puede jugar. La programación los respeta.'), matriz(j.noDisp = j.noDisp || {}, () => { }));
    if (tab === 'cuota') {
      const cu = M.cuotaJugador({ ...T, jugadores: T.jugadores.filter(x => x.id !== j.id).concat([j]) }, j.id), p = { fecha: new Date().toISOString().slice(0, 10), monto: '', tipo: 'Efectivo', nota: '' };
      cont.append((T.cuotas.extras || []).length ? h('div', { class: 'grid2' }, T.cuotas.extras.map(x => x.tipo === 'si' ? h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: !!(j.extras || {})[x.id], onchange: e => { (j.extras = j.extras || {})[x.id] = e.target.checked; pint(); } }), x.nombre + ' ($' + x.precio + ')') : h('label', { class: 'f' }, x.nombre + (x.tipo === 'numero' ? ' (cantidad, $' + x.precio + ' c/u)' : ''), h('input', { value: (j.extras || {})[x.id] || '', onchange: e => { (j.extras = j.extras || {})[x.id] = e.target.value; pint(); } })))) : null,
        h('div', { class: 'grid2', style: { marginTop: '10px' } }, h('div', null, h('b', null, 'Cuota: $' + cu.total.toFixed(2)), h('br'), 'Pagado: $' + cu.pagado.toFixed(2), h('br'), h('b', null, 'Saldo: $' + cu.saldo.toFixed(2))), campo(j, 'descuento', 'Descuento (USD)', { tipo: 'number', step: '0.01', alCambiar: pint })),
        h('h3', null, 'Pagos registrados (el cobro se hace fuera del sistema)'),
        h('table', { class: 't' }, h('thead', null, h('tr', null, ['Fecha', 'Monto', 'Forma', 'Nota', ''].map(x => h('th', null, x)))), h('tbody', null, (j.pagos || []).map((x, i) => h('tr', null, h('td', null, fCorta(x.fecha)), h('td', null, '$' + (+x.monto).toFixed(2)), h('td', null, x.tipo), h('td', null, x.nota || ''), h('td', null, h('button', { class: 'btn mini peligro', onclick: () => { j.pagos.splice(i, 1); pint(); } }, 'Quitar')))))),
        h('div', { class: 'fila', style: { marginTop: '8px' } }, campo(p, 'fecha', 'Fecha', { tipo: 'date' }), campo(p, 'monto', 'Monto (negativo = devolución)', { tipo: 'number', step: '0.01' }), campo(p, 'tipo', 'Forma', { opciones: { Efectivo: 'Efectivo', Transferencia: 'Transferencia', Tarjeta: 'Tarjeta', 'Cargo a la cuenta del socio': 'Cargo a la cuenta del socio' } }), campo(p, 'nota', 'Nota'),
          h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, onclick: () => { if (!+p.monto) return toast('Escribe el monto.', 'error'); (j.pagos = j.pagos || []).push({ ...p, monto: +p.monto, por: S.correo }); pint(); } }, 'Registrar pago')));
    }
    if (tab === 'nota') cont.append(campo(j, 'nota', 'Nota (el jugador queda marcado)', { tipo: 'area', filas: 6 }));
    if (tab === 'avisos') { const ls = (T.avisos || []).filter(a => (a.jugadores || []).includes(j.id)); cont.append(ls.length ? h('table', { class: 't' }, h('tbody', null, ls.map(a => h('tr', null, h('td', null, new Date(a.fecha).toLocaleString('es-EC')), h('td', null, a.titulo))))) : h('div', { class: 'vacio' }, 'Sin avisos enviados a este jugador.')); }
  };
  pint();
  m.cuerpo.append(tabs, cont, err);
  m.pie.append(
    !nuevo && puedeEscribir() && h('button', { class: 'btn peligro', style: { marginRight: 'auto' }, onclick: async () => {
      if (T.inscripciones.some(i => (i.j1 === j.id || i.j2 === j.id) && enCuadro(i.id))) return toast('El jugador está en un cuadro: sácalo del cuadro antes de borrarlo.', 'error');
      if (!await confirmar('¿Borrar a ' + M.nombreJ(j0, T) + ' y sus inscripciones?', 'Borrar')) return;
      T.inscripciones = T.inscripciones.filter(i => i.j1 !== j.id && i.j2 !== j.id).map(i => i);
      T.jugadores = T.jugadores.filter(x => x.id !== j.id); cambio(); m.cerrar();
    } }, 'Borrar jugador'),
    h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'),
    puedeEscribir() && h('button', { class: 'btn pri', onclick: () => {
      limpiar(err);
      j.socio = String(j.socio || '').replace(/[^\d-]/g, ''); j.cedula = String(j.cedula || '').replace(/\D/g, '');
      const errs = M.validarJugador(T, j);
      if (!j.invitado && j.socio && T.jugadores.some(x => x.id !== j.id && x.socio && x.socio === j.socio && x.cedula === j.cedula)) errs.push('Ya existe un jugador con ese código de socio y cédula.');
      if (errs.length) return err.append(h('div', { class: 'error' }, errs.join(' ')));
      // inscripciones
      for (const e of T.eventos) {
        const st = insc[e.id];
        const i = T.inscripciones.find(x => x.evento === e.id && (x.j1 === j.id || x.j2 === j.id));
        if (!st.on && i) { if (enCuadro(i.id)) return err.append(h('div', { class: 'error' }, 'No se puede quitar de «' + e.nombre + '»: la inscripción ya está en un cuadro.')); }
      }
      if (nuevo) T.jugadores.push(j); else Object.assign(j0, j);
      T.eventos.forEach(e => {
        const st = insc[e.id];
        let i = T.inscripciones.find(x => x.evento === e.id && (x.j1 === j.id || x.j2 === j.id));
        if (!st.on) { if (i) { if (i.j2 && i.j1 === j.id) { i.j1 = i.j2; i.j2 = null; i.busca = true; } else if (i.j2 === j.id) { i.j2 = null; i.busca = true; } else T.inscripciones = T.inscripciones.filter(x => x !== i); } return; }
        const pareja = e.tipo === 'D' && st.pareja && st.pareja !== 'busca' ? st.pareja : null;
        if (!i) {
          if (pareja) { const ip = T.inscripciones.find(x => x.evento === e.id && x.j1 === pareja && !x.j2); if (ip) { ip.j2 = j.id; ip.busca = false; return; } }
          const llenos = e.cupo && T.inscripciones.filter(x => x.evento === e.id && x.lista === 'main').length >= e.cupo;
          T.inscripciones.push({ id: M.id('i'), evento: e.id, j1: j.id, j2: pareja, busca: e.tipo === 'D' && !pareja && st.pareja === 'busca', lista: llenos ? 'reserve' : 'main', estado: '', siembra: {}, pago: 'pendiente', fecha: new Date().toISOString() });
          if (llenos) toast('«' + e.nombre + '» está llena: la inscripción quedó en reserva.');
        } else if (e.tipo === 'D') {
          const otro = i.j1 === j.id ? i.j2 : i.j1;
          if (pareja !== otro) {
            if (enCuadro(i.id)) { toast('La pareja ya está en un cuadro: usa «Cambiar pareja» en Inscritos.', 'error'); return; }
            const ip = pareja && T.inscripciones.find(x => x.evento === e.id && x.j1 === pareja && !x.j2 && x !== i);
            if (ip) T.inscripciones = T.inscripciones.filter(x => x !== ip);
            i.j1 = j.id; i.j2 = pareja; i.busca = !pareja && st.pareja === 'busca';
          } else i.busca = !pareja && st.pareja === 'busca';
        }
      });
      cambio(); m.cerrar(); alGuardar && alGuardar(j);
    } }, 'Guardar'));
}

// Importar desde Excel: se copian las filas y se pegan (primera fila = nombres de columna, como TP)
function importar() {
  const T = S.T, d = { texto: '', evento: T.eventos[0] && T.eventos[0].id || '' };
  const m = modal({ titulo: 'Importar jugadores e inscripciones', clase: 'ancho' });
  const err = h('div');
  m.cuerpo.append(h('p', { class: 'sub j' }, 'Copia las filas en Excel (incluida la primera fila con los nombres de columna) y pégalas aquí. Columnas reconocidas: Apellido, Nombre, Socio, Cedula, Genero, Nacimiento, Club, Email, Telefono, Nivel, Rating, Ranking, Puntos, Seed, Categoria y Pareja (código de socio de la pareja). Si un jugador ya existe (mismo socio), solo se le agrega la categoría.'),
    campo(d, 'evento', 'Categoría por defecto (si la fila no trae «Categoria»)', { opciones: { '': '— Ninguna —', ...Object.fromEntries(T.eventos.map(e => [e.id, e.nombre])) } }),
    h('textarea', { rows: 12, style: { width: '100%', marginTop: '8px', fontFamily: 'monospace', fontSize: '12px' }, placeholder: 'Apellido\tNombre\tSocio\tGenero…', oninput: e => { d.texto = e.target.value; } }), err);
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => {
    limpiar(err);
    const filas = d.texto.split(/\r?\n/).filter(x => x.trim()).map(x => x.split(x.includes('\t') ? '\t' : x.includes(';') ? ';' : ','));
    if (filas.length < 2) return err.append(h('div', { class: 'error' }, 'Pega al menos la fila de títulos y una fila de datos.'));
    const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const alias = { apellido: 'apellido', apellidos: 'apellido', name: 'apellido', nombre: 'nombre', nombres: 'nombre', firstname: 'nombre', socio: 'socio', memberid: 'socio', codigo: 'socio', cedula: 'cedula', genero: 'genero', gender: 'genero', sexo: 'genero', nacimiento: 'nac', fechadenacimiento: 'nac', dob: 'nac', club: 'club', email: 'email', correo: 'email', telefono: 'tel', movil: 'tel', mobile: 'tel', nivel: 'nivel', level: 'nivel', rating: 'rating', ranking: 'ranking', puntos: 'puntos', points: 'puntos', seed: 'seed', siembra: 'seed', categoria: 'evento', event: 'evento', evento: 'evento', pareja: 'pareja', partner: 'pareja', partnerid: 'pareja' };
    const cols = filas[0].map(x => alias[norm(x)] || null);
    if (!cols.includes('apellido') && !cols.includes('nombre')) return err.append(h('div', { class: 'error' }, 'No se encontró la columna de nombre o apellido en la primera fila.'));
    let nuevos = 0, insN = 0; const problemas = [], parejas = [];
    filas.slice(1).forEach((f, n) => {
      const o = {}; cols.forEach((k, i) => { if (k) o[k] = String(f[i] || '').trim(); });
      let nac = o.nac; if (nac && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(nac)) { const [dd, mm, yy] = nac.split('/'); nac = yy + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0'); }
      const gen = /^(f|m)/i.test(o.genero || '') ? o.genero[0].toUpperCase() : (/^(w|d|muj)/i.test(o.genero || '') ? 'F' : 'M');
      let j = o.socio ? T.jugadores.find(x => x.socio === o.socio.replace(/[^\d-]/g, '')) : null;
      if (!j) {
        j = { id: M.id('j'), apellido: o.apellido || '', nombre: o.nombre || '', genero: gen, nac: nac || '', socio: (o.socio || '').replace(/[^\d-]/g, ''), cedula: (o.cedula || '').replace(/\D/g, ''), club: o.club || '', email: o.email || '', tel: o.tel || '', nivel: o.nivel || '', rating: +o.rating || null, ranking: +o.ranking || null, puntos: +o.puntos || null, metodo: 'manual', fechaIns: new Date().toISOString(), noDisp: {}, pagos: [], extras: {} };
        const e = M.validarJugador(T, j); if (e.length) { problemas.push('Fila ' + (n + 2) + ': ' + e.join(' ')); return; }
        T.jugadores.push(j); nuevos++;
      }
      const ev = o.evento ? T.eventos.find(e => norm(e.nombre) === norm(o.evento)) : T.eventos.find(e => e.id === d.evento);
      if (o.evento && !ev) { problemas.push('Fila ' + (n + 2) + ': no existe la categoría «' + o.evento + '».'); return; }
      if (!ev || T.inscripciones.some(i => i.evento === ev.id && (i.j1 === j.id || i.j2 === j.id))) return;
      const i = { id: M.id('i'), evento: ev.id, j1: j.id, j2: null, lista: 'main', estado: '', siembra: o.seed ? { main: o.seed } : {}, pago: 'pendiente', fecha: new Date().toISOString() };
      T.inscripciones.push(i); insN++;
      if (ev.tipo === 'D' && o.pareja) parejas.push([i, o.pareja.replace(/[^\d-]/g, '')]);
    });
    // parejas por código de socio: la segunda fila de la pareja se une a la primera
    parejas.forEach(([i, socio]) => { if (!T.inscripciones.includes(i) || i.j2) return; const p = T.jugadores.find(x => x.socio === socio); if (!p) return; const ip = T.inscripciones.find(x => x !== i && x.evento === i.evento && x.j1 === p.id && !x.j2); if (ip) { i.j2 = p.id; T.inscripciones = T.inscripciones.filter(x => x !== ip); insN--; } });
    cambio(); m.cerrar();
    const mm = modal({ titulo: 'Importación terminada', clase: 'chico' });
    mm.cuerpo.append(h('p', null, nuevos + ' jugadores nuevos · ' + insN + ' inscripciones.'), problemas.length ? h('div', { class: 'error' }, problemas.slice(0, 20).map(x => h('div', null, x))) : null);
    mm.pie.append(h('button', { class: 'btn pri', onclick: () => mm.cerrar() }, 'Listo'));
  } }, 'Importar'));
}

// Revisar jugadores (Check Players de TP)
function revisarJugadores() {
  const T = S.T, filas = [];
  T.jugadores.forEach(j => {
    const p = [];
    if (!j.nac) p.push('sin fecha de nacimiento'); if (!j.invitado && !j.socio) p.push('sin código de socio'); if (!j.cedula) p.push('sin cédula (no recibirá avisos)'); if (!j.genero) p.push('sin género');
    T.inscripciones.filter(i => i.j1 === j.id || i.j2 === j.id).forEach(i => { const e = T.eventos.find(x => x.id === i.evento); if (e) M.chequeoInscripcion(T, e, j).forEach(w => p.push(e.nombre + ': ' + w)); if (e && e.tipo === 'D' && !i.j2) p.push(e.nombre + ': pareja incompleta'); });
    const n = T.inscripciones.filter(i => i.j1 === j.id || i.j2 === j.id).length; if (n > 3) p.push(n + ' categorías');
    if (p.length) filas.push([M.nombreJ(j, T), p]);
  });
  const m = modal({ titulo: 'Revisión de jugadores', clase: 'ancho' });
  m.cuerpo.append(filas.length ? h('table', { class: 't' }, h('tbody', null, filas.map(([n, p]) => h('tr', null, h('td', null, n), h('td', null, p.map(x => h('span', { class: 'chip pend', style: { margin: '2px' } }, x))))))) : h('div', { class: 'ok-msg' }, 'Todo en orden: no hay datos faltantes ni inscripciones con problemas.'));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => m.cerrar() }, 'Listo'));
}

// ---------- Inscritos (Roster) ----------
export function vistaInscritos() {
  const T = S.T;
  if (!T.eventos.length) return h('div', null, h('h1', null, 'Inscritos'), h('div', { class: 'vacio' }, 'Crea las categorías en Propiedades > Categorías.'));
  if (!T.eventos.some(e => e.id === S.evento)) S.evento = T.eventos[0].id;
  const ev = T.eventos.find(e => e.id === S.evento);
  S._lista = S._lista || 'main';
  const lista = S._lista;
  const todas = T.inscripciones.filter(i => i.evento === ev.id);
  const cuenta = l => todas.filter(i => (i.lista || 'main') === l).length;
  const filas = todas.filter(i => (i.lista || 'main') === lista).sort((a, b) => (parseInt(a.siembra && a.siembra[lista === 'qual' ? 'qual' : 'main']) || 999) - (parseInt(b.siembra && b.siembra[lista === 'qual' ? 'qual' : 'main']) || 999) || (+a.orden || 999) - (+b.orden || 999) || String(a.fecha).localeCompare(String(b.fecha)));
  const etapa = lista === 'qual' ? 'qual' : 'main';
  const pend = todas.filter(i => i.pago !== 'pagada' && i.estado !== 'WD').length;
  return h('div', null,
    h('div', { class: 'fila' }, h('h1', null, 'Inscritos'), h('div', { class: 'esp' }),
      h('select', { onchange: e => { S.evento = e.target.value; render(); } }, T.eventos.map(e => h('option', { value: e.id, selected: e.id === ev.id }, e.nombre + ' (' + T.inscripciones.filter(i => i.evento === e.id).length + ')')))),
    h('p', { class: 'sub' }, ev.nombre + ' · ' + M.GENEROS[ev.genero] + ' · ' + (ev.tipo === 'D' ? 'Dobles' : 'Individual') + ' · ' + todas.length + ' inscripciones' + (pend ? ' · ' + pend + ' con pago pendiente (no entran al sorteo)' : '')),
    h('div', { class: 'tabs' }, Object.entries(M.LISTAS).map(([k, t]) => h('button', { class: lista === k ? 'on' : '', onclick: () => { S._lista = k; render(); } }, t + ' · ' + cuenta(k)))),
    puedeEscribir() && h('div', { class: 'fila no-print', style: { marginBottom: '10px' } },
      h('button', { class: 'btn pri', onclick: () => insertarInscripcion(ev) }, 'Inscribir jugador'),
      h('button', { class: 'btn', onclick: () => siembraAuto(ev, etapa) }, 'Siembra automática'),
      h('button', { class: 'btn', onclick: () => aceptacionAuto(ev) }, 'Aceptación automática'),
      lista === 'reserve' && h('button', { class: 'btn', onclick: () => { filas.forEach((i, n) => { i.orden = n + 1; }); cambio(); } }, 'Renumerar reservas'),
      h('div', { class: 'esp' }),
      pend > 0 && h('span', { class: 'chip pend' }, pend + ' por validar')),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['N.º', 'Nombre', 'Siembra', 'Estado', 'Pago', 'Nivel', 'Rating', 'Ranking', 'Puntos', 'Club', 'Inscrito', ''].map(x => h('th', null, x)))),
      h('tbody', null, filas.length ? filas.map((i, n) => {
        const js = [i.j1, i.j2].map(jug).filter(Boolean), j = js[0] || {};
        const avisos = js.flatMap(x => M.chequeoInscripcion(T, ev, x));
        return h('tr', { class: i.estado === 'WD' ? '' : '' , style: i.estado === 'WD' ? { opacity: .55 } : null },
          h('td', null, lista === 'reserve' ? (i.orden || n + 1) : n + 1),
          h('td', null, M.nombreIns(T, i), i.busca && !i.j2 ? h('span', { class: 'chip oro', style: { marginLeft: '6px' } }, 'Busca pareja') : null, avisos.length ? h('span', { class: 'chip rojo', title: avisos.join(' '), style: { marginLeft: '6px' } }, '!') : null, enCuadro(i.id) ? h('span', { class: 'chip azul', style: { marginLeft: '6px' } }, 'En cuadro') : null),
          h('td', null, puedeEscribir() ? h('input', { value: (i.siembra || {})[etapa] || '', style: { width: '56px' }, placeholder: '—', title: 'Número o bloque: 1, 2, 3/4, 5/8…', onchange: e => { i.siembra = i.siembra || {}; const v = e.target.value.trim(); if (v) i.siembra[etapa] = v; else delete i.siembra[etapa]; cambio(); } }) : ((i.siembra || {})[etapa] || '')),
          h('td', null, puedeEscribir() ? h('select', { onchange: e => { i.estado = e.target.value; if (i.estado === 'WD') retirar(i); else cambio(); } }, Object.entries(M.ESTADOS_INS).filter(([k]) => k !== 'DA').map(([k, t]) => h('option', { value: k, selected: (i.estado || '') === k }, t))) : M.ESTADOS_INS[i.estado || '']),
          h('td', null, i.pago === 'pagada' ? h('span', { class: 'chip ok', title: 'Validado ' + (i.pagoFecha ? new Date(i.pagoFecha).toLocaleString('es-EC') : '') + ' por ' + (i.pagoPor || '') }, 'Pagada') : [h('span', { class: 'chip pend' }, 'Pendiente'), ' ', puedeEscribir() && h('button', { class: 'btn mini pri', onclick: () => validarPago(i) }, 'Validar pago')]),
          h('td', null, j.nivel || ''), h('td', null, j.rating || ''), h('td', null, j.ranking || ''), h('td', null, j.puntos || ''), h('td', null, j.club || ''),
          h('td', { style: { fontSize: '12px', color: 'var(--muted)' } }, i.fecha ? new Date(i.fecha).toLocaleDateString('es-EC') : ''),
          h('td', null, puedeEscribir() && h('button', { class: 'btn mini', onclick: () => menuInscripcion(i, ev) }, 'Más…')));
      }) : h('tr', null, h('td', { colspan: 12, class: 'vacio' }, 'No hay inscripciones en esta lista.')))));
}
function insertarInscripcion(ev) {
  const T = S.T, m = modal({ titulo: 'Inscribir en ' + ev.nombre });
  const q = { t: '' }, lista = h('div');
  const pintar = () => {
    limpiar(lista);
    const ya = new Set(T.inscripciones.filter(i => i.evento === ev.id).flatMap(i => [i.j1, i.j2]));
    T.jugadores.filter(j => !ya.has(j.id) && (!q.t || M.nombreJ(j, T).toLowerCase().includes(q.t.toLowerCase()))).forEach(j => lista.append(h('div', { class: 'fila', style: { padding: '5px 0', borderBottom: '1px solid var(--line-2)' } }, M.nombreJ(j, T), M.chequeoInscripcion(T, ev, j).map(w => h('span', { class: 'chip rojo' }, w)), h('div', { class: 'esp' }),
      h('button', { class: 'btn mini pri', onclick: () => { T.inscripciones.push({ id: M.id('i'), evento: ev.id, j1: j.id, j2: null, busca: ev.tipo === 'D', lista: S._lista || 'main', estado: '', siembra: {}, pago: 'pendiente', fecha: new Date().toISOString() }); cambio(true); pintar(); render(); } }, 'Inscribir'))));
    if (!lista.children.length) lista.append(h('p', { class: 'sub' }, 'No hay más jugadores para inscribir. Crea uno nuevo.'));
  };
  m.cuerpo.append(h('div', { class: 'fila' }, h('input', { type: 'search', placeholder: 'Buscar jugador del torneo', style: { flex: 1 }, oninput: e => { q.t = e.target.value; pintar(); } }), h('button', { class: 'btn', onclick: () => { m.cerrar(); editarJugador(null); } }, 'Jugador nuevo')), h('div', { style: { maxHeight: '50vh', overflow: 'auto', marginTop: '8px' } }, lista));
  pintar();
  m.pie.append(h('button', { class: 'btn pri', onclick: () => m.cerrar() }, 'Listo'));
}
async function validarPago(i) {
  const T = S.T, d = { avisar: true };
  const m = modal({ titulo: 'Validar pago', clase: 'chico' });
  m.cuerpo.append(h('p', { class: 'j' }, 'Confirmas que ' + M.nombreIns(T, i) + ' pagó la inscripción. La participación queda activa y entra al sorteo.'), campo(d, 'avisar', 'Avisar al socio por push y correo', { tipo: 'check' }));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: async () => {
    i.pago = 'pagada'; i.pagoFecha = new Date().toISOString(); i.pagoPor = S.correo; m.cerrar(); cambio();
    if (d.avisar) { await guardar(); const r = await api('tp_aviso', { id: S.id, tipo: 'pago', ins: i.id }); registrarAviso('Inscripción confirmada', [i.id], r); toast(r.ok ? (r.repetido ? 'El aviso ya se había enviado.' : 'Aviso enviado: ' + r.push + ' push y ' + r.correos + ' correos.') : (r.msg || 'No se pudo enviar el aviso.'), r.ok ? null : 'error'); }
  } }, 'Validar pago'));
}
export function registrarAviso(titulo, insIds, r) {
  const T = S.T; T.avisos = T.avisos || [];
  T.avisos.unshift({ fecha: new Date().toISOString(), titulo, jugadores: insIds.flatMap(x => M.jugadoresIns(T, x)), push: r.push || 0, correos: r.correos || 0, ok: !!r.ok, por: S.correo });
  T.avisos = T.avisos.slice(0, 300); cambio(true);
}
function retirar(i) {
  const d = { fecha: new Date().toISOString().slice(0, 16), motivo: '' };
  const m = modal({ titulo: 'Retiro', clase: 'chico', alCerrar: () => render() });
  m.cuerpo.append(h('div', { class: 'grid2' }, campo(d, 'fecha', 'Fecha y hora', { tipo: 'datetime-local' }), campo(d, 'motivo', 'Motivo')), h('p', { class: 'sub j', style: { marginTop: '8px' } }, 'Si ya está en un cuadro, sus partidos pendientes quedan como W.O. desde Partidos.'));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => { i.estado = 'WD'; i.retiro = { ...d }; cambio(true); m.cerrar(); } }, 'Registrar retiro'));
}
function menuInscripcion(i, ev) {
  const T = S.T, m = modal({ titulo: M.nombreIns(T, i), clase: 'chico' });
  const b = (t, fn, cl) => h('button', { class: 'btn ' + (cl || ''), style: { width: '100%', marginBottom: '6px', textAlign: 'left' }, onclick: () => { m.cerrar(); fn(); } }, t);
  m.cuerpo.append(
    h('h3', null, 'Mover a'), Object.entries(M.LISTAS).filter(([k]) => k !== (i.lista || 'main')).map(([k, t]) => b(t, () => { if (enCuadro(i.id)) return toast('Está en un cuadro: sácala primero.', 'error'); i.lista = k; cambio(); })),
    h('h3', null, 'Otras acciones'),
    T.eventos.length > 1 && b('Mover a otra categoría…', () => moverEvento(i)),
    i.pago === 'pagada' && b('Quitar validación de pago', () => { if (enCuadro(i.id)) return toast('Ya está en un cuadro.', 'error'); i.pago = 'pendiente'; delete i.pagoFecha; cambio(); }),
    ev.tipo === 'D' && i.j2 && b('Intercambiar jugador 1 y 2', () => { [i.j1, i.j2] = [i.j2, i.j1]; cambio(); }),
    ev.tipo === 'D' && b('Cambiar pareja… (F12)', () => cambiarPareja(i)),
    b('Retirar', () => retirar(i)),
    b('Ficha del jugador', () => editarJugador(jug(i.j1))),
    b('Borrar inscripción', async () => { if (enCuadro(i.id)) return toast('Está en un cuadro: bórrala del cuadro primero.', 'error'); if (await confirmar('¿Borrar la inscripción de ' + M.nombreIns(T, i) + '?', 'Borrar')) { T.inscripciones = T.inscripciones.filter(x => x !== i); cambio(); } }, 'peligro'));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cerrar'));
}
function moverEvento(i) {
  const T = S.T, d = { ev: '' }, m = modal({ titulo: 'Mover a otra categoría', clase: 'chico' });
  m.cuerpo.append(campo(d, 'ev', 'Categoría', { opciones: { '': '—', ...Object.fromEntries(T.eventos.filter(e => e.id !== i.evento).map(e => [e.id, e.nombre])) } }));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => { if (!d.ev) return; if (enCuadro(i.id)) return toast('Está en un cuadro.', 'error'); i.evento = d.ev; i.siembra = {}; cambio(); m.cerrar(); } }, 'Mover'));
}
// Cambiar pareja (F12): reemplaza al compañero en todos los partidos
export function cambiarPareja(i) {
  const T = S.T, d = { j: '' }, m = modal({ titulo: 'Cambiar pareja', clase: 'chico' });
  const ev = T.eventos.find(e => e.id === i.evento);
  const ocupados = new Set(T.inscripciones.filter(x => x.evento === i.evento && x !== i).flatMap(x => [x.j1, x.j2]));
  m.cuerpo.append(h('p', null, 'Pareja actual: ' + M.nombreIns(T, i)), campo(d, 'j', 'Nuevo compañero de ' + M.nombreJ(jug(i.j1), T), { opciones: { '': '—', ...Object.fromEntries(T.jugadores.filter(j => j.id !== i.j1 && j.id !== i.j2 && !ocupados.has(j.id)).map(j => [j.id, M.nombreJ(j, T) + (M.chequeoInscripcion(T, ev, j).length ? ' (!)' : '')])) } }),
    h('p', { class: 'sub j' }, 'La inscripción, su lugar en el cuadro y sus resultados se mantienen; solo cambia el compañero.'));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => { if (!d.j) return; i.j2 = d.j; i.busca = false; cambio(); m.cerrar(); } }, 'Cambiar'));
}
function siembraAuto(ev, etapa) {
  const T = S.T, d = { por: 'ranking', n: 2, tipo: 'fijo', sinRanking: false };
  const m = modal({ titulo: 'Siembra automática · ' + ev.nombre, clase: 'chico' });
  m.cuerpo.append(h('div', { class: 'grid2', style: { gridTemplateColumns: '1fr' } },
    campo(d, 'por', 'Ordenar por', { opciones: { ranking: 'Ranking (menor es mejor)', rating: 'Rating (mayor es mejor)', puntos: 'Puntos (mayor es mejor)', nivel: 'Nivel', fecha: 'Fecha de inscripción' } }),
    campo(d, 'n', 'Cuántos cabezas de serie', { opciones: { 0: 'Ninguno (borra la siembra)', 1: '1', 2: '2', 4: '4', 8: '8', 16: '16', 32: '32' }, num: true }),
    campo(d, 'tipo', 'Tipo', { opciones: { fijo: '1, 2, 3, 4…', bloques: '1, 2, 3/4, 5/8…' } }),
    campo(d, 'sinRanking', 'Sembrar también a quienes no tienen dato', { tipo: 'check' })));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => {
    const L = T.inscripciones.filter(i => i.evento === ev.id && (i.lista || 'main') === (etapa === 'qual' ? 'qual' : 'main') && i.estado !== 'WD');
    L.forEach(i => { i.siembra = i.siembra || {}; delete i.siembra[etapa]; });
    const val = i => { const js = [i.j1, i.j2].map(jug).filter(Boolean); const v = js.map(j => d.por === 'fecha' ? 0 : +j[d.por] || 0).filter(x => x); if (d.por === 'fecha') return Date.parse(i.fecha) || 0; if (!v.length) return null; return v.reduce((a, b) => a + b, 0) / v.length; };
    const asc = d.por === 'ranking' || d.por === 'fecha' || d.por === 'nivel';
    const con = L.filter(i => val(i) != null || d.sinRanking).sort((a, b) => { const x = val(a), y = val(b); if (x == null) return 1; if (y == null) return -1; return asc ? x - y : y - x; });
    con.slice(0, d.n).forEach((i, k) => { let s = String(k + 1); if (d.tipo === 'bloques' && k >= 2) { const lo = Math.pow(2, Math.floor(Math.log2(k))) + 1, hi = lo * 2 - 2; s = lo + '/' + hi; } i.siembra[etapa] = s; });
    cambio(); m.cerrar(); toast(Math.min(d.n, con.length) + ' cabezas de serie asignados.');
  } }, 'Asignar'));
}
function aceptacionAuto(ev) {
  const T = S.T, d = { main: 16, qual: 0, por: 'fecha' };
  const m = modal({ titulo: 'Aceptación automática · ' + ev.nombre, clase: 'chico' });
  m.cuerpo.append(h('div', { class: 'grid2', style: { gridTemplateColumns: '1fr' } }, campo(d, 'main', 'Cupos en el cuadro principal', { tipo: 'number', min: 0 }), campo(d, 'qual', 'Cupos en clasificación', { tipo: 'number', min: 0 }),
    campo(d, 'por', 'Criterio', { opciones: { fecha: 'Fecha y hora de inscripción', ranking: 'Ranking', rating: 'Rating', puntos: 'Puntos' } })), h('p', { class: 'sub j' }, 'El resto pasa a Reserva, numerado. Las inscripciones que ya están en un cuadro no se mueven.'));
  m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => {
    const L = T.inscripciones.filter(i => i.evento === ev.id && i.lista !== 'exclude' && i.estado !== 'WD' && !enCuadro(i.id));
    const v = i => { if (d.por === 'fecha') return Date.parse(i.fecha) || 0; const j = jug(i.j1) || {}; return +j[d.por] || (d.por === 'ranking' ? 1e9 : 0); };
    L.sort((a, b) => d.por === 'fecha' || d.por === 'ranking' ? v(a) - v(b) : v(b) - v(a));
    const yaMain = T.inscripciones.filter(i => i.evento === ev.id && enCuadro(i.id) && i.lista === 'main').length;
    let nm = Math.max(0, d.main - yaMain), nq = d.qual, nr = 1;
    L.forEach(i => { if (nm > 0) { i.lista = 'main'; nm--; } else if (nq > 0) { i.lista = 'qual'; nq--; } else { i.lista = 'reserve'; i.orden = nr++; } });
    cambio(); m.cerrar();
  } }, 'Asignar'));
}
