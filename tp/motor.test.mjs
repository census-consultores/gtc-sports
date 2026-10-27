// Pruebas del motor con los casos verificados en Tournament Planner 2025.2 (27-oct-2026). Correr: node tp/motor.test.mjs
import assert from 'node:assert/strict';
import * as M from './motor.js';

const T0 = () => {
  const T = M.nuevoTorneo({ nombre: 'Prueba', deporte: 'tenis', desde: '2026-10-31', hasta: '2026-11-01' });
  T.dias = ['2026-10-31', '2026-11-01'];
  T.dias.forEach(d => { T.franjas[d] = M.generarFranjas('09:00', 75, '23:55', 10); });
  T.sedes[0].canchas = [1, 2, 3, 4].map(n => ({ id: 'k' + n, nombre: String(n) }));
  return T;
};
const addJ = (T, ev, n, extra) => { const j = { id: 'j' + n, nombre: 'Jugadora' + n, apellido: '', genero: 'F', socio: '100' + n, ...extra }; T.jugadores.push(j); const i = { id: 'i' + n, evento: ev.id, j1: j.id, lista: 'main', pago: 'pagada' }; T.inscripciones.push(i); return i; };
let seq = 0; const rnd = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };

// 1) Puntuación
assert.equal(M.completarSet('normal', {}, 4), 6);
assert.equal(M.completarSet('normal', {}, 5), 7);
assert.equal(M.completarSet('normal', {}, 6), 7);
assert.equal(M.ganadorSet('normal', {}, 4, 3), false, '4-3 no es un set normal válido');
assert.equal(M.ganadorSet('normal', {}, 7, 6), 'a');
assert.equal(M.ganadorSet('mtb10', {}, 10, 8), 'a');
assert.equal(M.ganadorSet('mtb10', {}, 11, 10), false);
assert.equal(M.ganadorSet('fast4', {}, 4, 3), 'b' === 'b' ? 'a' : 0);
const pp = { tipo: 'puntos', puntos: 11, ganarPor2: true, bestOf: 5, ultimo: 'puntos' };
assert.equal(M.ganadorSet('puntos', pp, 11, 9), 'a');
assert.equal(M.ganadorSet('puntos', pp, 12, 10), 'a');
assert.equal(M.ganadorSet('puntos', pp, 11, 10), false);
assert.equal(M.completarSet('puntos', pp, 10), 12);
const bv = { tipo: 'puntos', ultimo: 'puntos', puntos: 21, puntosUltimo: 15, bestOf: 3, ganarPor2: true };
assert.deepEqual(M.evaluarMarcador(bv, [[21, 19], [18, 21], [15, 13]]).g, 'a');
assert.equal(M.evaluarMarcador({ bestOf: 3, tipo: 'normal', ultimo: 'mtb10' }, [[6, 4], [3, 6], [10, 7]]).g, 'a');
assert.equal(M.evaluarMarcador({ bestOf: 3, tipo: 'normal', ultimo: 'normal' }, [[6, 4], [6, 3], [6, 1]]).ok, false, 'sets de más');

// 2) Siembra y byes: 5 jugadoras, cuadro de 8, 2 sembradas (verificado en TP: 1 en línea 1, 2 en línea 8, byes 2 y 7 y uno en la otra mitad)
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'Damas A', genero: 'F' }); T.eventos.push(ev);
  for (let n = 1; n <= 5; n++) addJ(T, ev, n);
  T.inscripciones[2].siembra = { main: '1' }; T.inscripciones[3].siembra = { main: '2' };
  const [c] = M.crearCuadros(T, { evento: ev.id, tipo: 'elim', tam: 8, consolacion: 'fm' });
  assert.equal(T.cuadros.length, 2, 'cuadro + consolación');
  assert.ok(M.sortear(T, [c.id], { rnd }).ok);
  assert.equal(c.lineas[0], 'i3'); assert.equal(c.lineas[7], 'i4');
  assert.equal(c.lineas[1], 'BYE'); assert.equal(c.lineas[6], 'BYE');
  assert.equal(c.lineas.filter(x => x === 'BYE').length, 3);
  const third = c.lineas.indexOf('BYE', 2); assert.ok(third === 3 || third === 4 || third === 2 || third === 5);
  // las sembradas avanzan solas por bye
  let R = M.resolver(T);
  assert.equal(R.porClave[c.id + ':0:0'].ganador, 'i3');
  assert.equal(R.partidos.filter(p => p.c === c.id && p.r === 0).length, 1, 'solo un partido real en 1.ª ronda');
  // resultado: la que no tuvo bye pierde -> va a la consolación por «primer partido»
  const real = R.partidos.find(p => p.c === c.id && p.r === 0);
  assert.ok(M.guardarResultado(T, real.k, { sets: [[4, 6], [3, 6]] }).ok);
  R = M.resolver(T);
  const cons = T.cuadros[1];
  assert.ok(R.cuadros[cons.id].lineas.includes(real.a), 'perdedora a consolación');
  // marcador inválido rechazado
  const sf = R.partidos.find(p => p.c === c.id && p.r === 1 && p.listo);
  assert.equal(M.guardarResultado(T, sf.k, { sets: [[4, 3]] }).ok, false);
}

// 3) Grupo de 4 con el triple empate de la prueba en TP: orden J6, J8, J1, J4 (por diferencia de games entre empatadas)
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'Grupos', genero: 'F' }); T.eventos.push(ev);
  [6, 8, 4, 1].forEach(n => addJ(T, ev, n));
  const gs = M.crearCuadros(T, { evento: ev.id, tipo: 'gruposElim', grupos: 2, tamGrupo: 4, pasan: 2 });
  const A = gs[0];
  A.lineas = ['i6', 'i8', 'i4', 'i1'];
  const k = (x, y) => A.id + ':g:' + Math.min(x, y) + ':' + Math.max(x, y);
  const res = (x, y, sets) => { const kk = k(x, y); const s = x < y ? sets : sets.map(([a, b]) => [b, a]); assert.ok(M.guardarResultado(T, kk, { sets: s }).ok, kk); };
  res(0, 1, [[6, 1], [6, 1]]); res(0, 2, [[6, 3], [6, 3]]); res(0, 3, [[6, 3], [6, 3]]);
  res(1, 2, [[6, 0], [6, 0]]); res(3, 1, [[6, 4], [6, 4]]); res(2, 3, [[6, 4], [6, 4]]);
  const R = M.resolver(T), tab = R.cuadros[A.id].tabla;
  assert.deepEqual(tab.filas.map(f => f.id), ['i6', 'i8', 'i1', 'i4']);
  assert.equal(tab.completo, true); assert.equal(tab.empate, false);
  assert.deepEqual([tab.filas[1].gf, tab.filas[1].gc], [22, 24]);
  // cruce del playoff: 1.º A en la línea 1 y 2.º A en la otra mitad
  const po = gs.find(c => c.nombre.includes('Playoff'));
  const L = R.cuadros[po.id].lineas;
  assert.equal(L[0], 'i6'); assert.equal(L[2], 'i8');
  // ajuste manual de posiciones
  T.ajustes[A.id] = ['i6', 'i1', 'i8', 'i4'];
  assert.equal(M.resolver(T).cuadros[A.id].tabla.filas[1].id, 'i1');
}

// 4) Programación automática: semifinal 11:30 + 150 min -> final 14:00 (verificado en TP)
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'Damas A', genero: 'F' }); T.eventos.push(ev);
  for (let n = 1; n <= 4; n++) addJ(T, ev, n);
  const [c] = M.crearCuadros(T, { evento: ev.id, tipo: 'elim', tam: 4 });
  M.sortear(T, [c.id], { rnd });
  M.setRes(T, c.id + ':0:0', { fecha: '2026-10-31', hora: '11:30', cancha: 'k1' });
  const r = M.programarAuto(T, { cuadros: [c.id], alcance: 'todos', descanso: 150 });
  assert.equal(r.sinLugar.length, 0);
  assert.equal(T.res[c.id + ':0:1'].hora, '09:00');
  assert.equal(T.res[c.id + ':1:0'].hora, '14:00');
  assert.equal(T.res[c.id + ':1:0'].fecha, '2026-10-31');
  // no disponibilidad de una jugadora mueve su partido
  const T2 = T0(); const ev2 = M.nuevoEvento(T2, { nombre: 'X', genero: 'F' }); T2.eventos.push(ev2);
  for (let n = 1; n <= 2; n++) addJ(T2, ev2, n, n === 1 ? { noDisp: { '2026-10-31': ['09:00', '10:15'] } } : {});
  const [c2] = M.crearCuadros(T2, { evento: ev2.id, tipo: 'elim', tam: 2 });
  M.sortear(T2, [c2.id], { rnd }); M.programarAuto(T2, { cuadros: [c2.id], alcance: 'todos' });
  assert.equal(T2.res[c2.id + ':0:0'].hora, '11:30');
}

// 5) Solo se sortean inscripciones con pago validado
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'P', genero: 'M', tipo: 'D' }); T.eventos.push(ev);
  for (let n = 1; n <= 4; n++) addJ(T, ev, n, { genero: 'M' });
  T.inscripciones[3].pago = 'pendiente';
  const [c] = M.crearCuadros(T, { evento: ev.id, tipo: 'elim', tam: 4 });
  M.sortear(T, [c.id], { rnd });
  assert.equal(c.lineas.filter(x => x && x !== 'BYE').length, 3);
  assert.ok(!c.lineas.includes('i4'));
}

// 6) Separación por club: dos del mismo club no se cruzan en 1.ª ronda
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'S', genero: 'M' }); T.eventos.push(ev);
  for (let n = 1; n <= 8; n++) addJ(T, ev, n, { genero: 'M', club: n <= 2 ? 'Club X' : 'C' + n });
  const [c] = M.crearCuadros(T, { evento: ev.id, tipo: 'elim', tam: 8 });
  for (let t = 0; t < 5; t++) {
    M.sortear(T, [c.id], { rnd, separacion: 'club' });
    const a = c.lineas.indexOf('i1'), b = c.lineas.indexOf('i2');
    assert.ok((a >> 2) !== (b >> 2), 'mismo club en mitades distintas');
  }
}

// 7) Los otros tipos se construyen y llegan a un campeón
{
  for (const tipo of ['monrad', 'compass', 'feed', 'matchplay', 'rrPlayoff', 'rr2', 'qualMain', 'qual', 'gruposRR']) {
    const T = T0(); const ev = M.nuevoEvento(T, { nombre: tipo, genero: 'M' }); T.eventos.push(ev);
    const n = tipo === 'qualMain' ? 16 : tipo === 'rr2' ? 4 : 8;
    for (let x = 1; x <= n; x++) addJ(T, ev, x, { genero: 'M' });
    const cs = M.crearCuadros(T, { evento: ev.id, tipo, tam: tipo === 'qualMain' ? 16 : tipo === 'rr2' ? 4 : 8, qIn: 8, qOut: 4, grupos: 2, tamGrupo: 4, pasan: 2 });
    assert.ok(cs.length >= 1, tipo);
    if (tipo === 'qualMain') { T.inscripciones.slice(0, 8).forEach(i => { i.lista = 'qual'; }); }
    // sortear: cada etapa por separado (grupos juntos)
    const porEtapa = {}; T.cuadros.forEach(c => { const tieneEnl = T.enlaces.some(l => l.a && l.a.c === c.id); if (!tieneEnl && c.tipo !== 'grafo') (porEtapa[c.etapa] = porEtapa[c.etapa] || []).push(c.id); });
    Object.values(porEtapa).forEach(ids => { const r = M.sortear(T, ids, { rnd }); assert.ok(r.ok, tipo + ' ' + r.msg); });
    // jugar todo: gana siempre el lado a
    for (let it = 0; it < 200; it++) {
      const R = M.resolver(T); const p = R.partidos.find(q => q.listo && !q.decidido);
      if (!p) break;
      const f = M.formatoDe(T, T.cuadros.find(c => c.id === p.c));
      const r = M.guardarResultado(T, p.k, { sets: Array.from({ length: Math.ceil((f.bestOf || 3) / 2) }, () => [6, 2]) });
      assert.ok(r.ok, tipo + ' ' + p.k + ' ' + r.msg);
    }
    const R = M.resolver(T);
    assert.equal(R.partidos.filter(q => !q.decidido).length, 0, tipo + ': quedaron partidos sin jugar');
  }
}

// 8) Invitados: solo beach tenis desde noviembre, máximo 6 por torneo
{
  const T = M.nuevoTorneo({ deporte: 'beachtenis', desde: '2026-11-07' });
  for (let n = 0; n < 6; n++) { const j = { id: 'g' + n, nombre: 'Inv' + n, genero: 'M', invitado: true }; assert.deepEqual(M.validarJugador(T, j), []); T.jugadores.push(j); }
  assert.ok(M.validarJugador(T, { id: 'g7', nombre: 'x', genero: 'M', invitado: true }).length);
  const P = M.nuevoTorneo({ deporte: 'padel', desde: '2026-11-07' });
  assert.ok(M.validarJugador(P, { id: 'z', nombre: 'x', genero: 'M', invitado: true }).length);
  assert.ok(M.validarJugador(P, { id: 'z', nombre: 'x', genero: 'M' }).length, 'socio sin código');
}

// 9) Publicación: sin cédulas ni códigos de socio, menores marcados
{
  const T = T0(); const ev = M.nuevoEvento(T, { nombre: 'J', genero: 'M' }); T.eventos.push(ev);
  addJ(T, ev, 1, { genero: 'M', cedula: '0912345678', nac: '2012-01-01' }); addJ(T, ev, 2, { genero: 'M', cedula: '0998765432' });
  M.crearCuadros(T, { evento: ev.id, tipo: 'elim', tam: 2 }); M.sortear(T, [T.cuadros[0].id], { rnd });
  const P = JSON.stringify(M.publico(T));
  assert.ok(!P.includes('0912345678') && !P.includes('1001'));
  assert.equal(M.publico(T).jugadores.j1.m, true);
}
console.log('motor de torneos: todas las pruebas pasan');
