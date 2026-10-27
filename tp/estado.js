// Estado compartido del módulo de torneos y guardado automático.
import { toast } from './ui.js';
import { resolver } from './motor.js';

export const S = {
  token: null, nombre: '', rol: '', correo: '',
  lista: [], id: null, rev: 0, T: null,
  vista: 'resumen', evento: null, cuadro: null,
  sucio: false, guardando: false, conflicto: false, ultimoGuardado: null,
  _R: null
};
const API = '/api/gtc-admin';
export async function api(accion, datos) {
  let r;
  try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, token: S.token, ...(datos || {}) }) }); }
  catch (e) { return { ok: false, status: 0, msg: 'Sin conexión a internet' }; }
  let j = {}; try { j = await r.json(); } catch (e) { }
  if (r.status === 401 && accion !== 'login') { sessionStorage.removeItem('gtc_tp'); S.token = null; toast('Tu sesión expiró. Vuelve a entrar.', 'error'); render(); }
  return { status: r.status, ...j };
}
export function puedeEscribir() { return S.rol === 'deportes' || S.rol === 'superadmin'; }
// Resolución del torneo (cacheada hasta el siguiente cambio)
export function R() { if (!S._R && S.T) S._R = resolver(S.T); return S._R; }

let _render = () => { };
export function alRender(fn) { _render = fn; }
export function render() { _render(); }

let timer = null;
// Llamar después de cada cambio del documento: invalida la resolución, repinta y guarda a los 1,2 s.
export function cambio(sinRender) {
  S._R = null;
  if (S.guardando) S._cambioDurante = true; // lo que cambie mientras viaja el guardado se guarda después
  if (!S.sucio) S._sucioDesde = Date.now();
  S.sucio = true;
  if (!sinRender) render(); else pintarEstado();
  // espera 1,2 s a que terminen los cambios seguidos, pero nunca deja más de 4 s sin guardar
  clearTimeout(timer); timer = setTimeout(guardar, Date.now() - S._sucioDesde > 4000 ? 0 : 1200);
}
let enCurso = null;
// Guarda el torneo abierto. Si ya hay un guardado viajando, espera a que termine (y guarda lo que cambió mientras tanto).
export function guardar() {
  if (!S.T || !puedeEscribir() || S.conflicto) return Promise.resolve({ ok: false });
  if (enCurso) return enCurso.then(() => S.sucio && !S.conflicto ? guardar() : { ok: !S.sucio });
  clearTimeout(timer);
  const T = S.T;
  enCurso = (async () => {
    S.guardando = true; S._cambioDurante = false; pintarEstado();
    let r;
    try { r = await api('tp_save', { id: S.id, rev: S.rev, data: T }); }
    finally { S.guardando = false; enCurso = null; }
    if (S.T !== T) return r; // ya se abrió otro torneo: no tocar su id ni su versión
    if (r.ok) {
      S.id = r.id; S.rev = r.rev; S.ultimoGuardado = new Date(); S._base = JSON.stringify(T.res);
      if (!S._cambioDurante) S.sucio = false; else { S._cambioDurante = false; S._sucioDesde = Date.now(); timer = setTimeout(guardar, 1200); }
    } else if (r.conflicto) { S.conflicto = true; toast(r.msg, 'error'); render(); }
    else if (r.status !== 401) toast('No se pudo guardar: ' + (r.msg || r.error || 'error de conexión') + '. Se reintentará con el próximo cambio.', 'error');
    pintarEstado();
    return r;
  })();
  return enCurso;
}
// Guarda todo lo pendiente antes de salir del torneo; devuelve false si queda algo sin guardar.
export async function guardarPendiente() {
  for (let n = 0; S.sucio && !S.conflicto && n < 3; n++) { const r = await guardar(); if (!r.ok) break; }
  return !S.sucio;
}
export function pintarEstado() {
  const el = document.getElementById('estadoGuardado'); if (!el) return;
  el.textContent = S.conflicto ? 'Conflicto: recarga el torneo' : S.guardando ? 'Guardando…' : S.sucio ? 'Cambios sin guardar' : S.ultimoGuardado ? 'Guardado ' + S.ultimoGuardado.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : 'Guardado';
}
window.addEventListener('beforeunload', e => { if (S.sucio) { e.preventDefault(); e.returnValue = ''; } });
