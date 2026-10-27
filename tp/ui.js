// Utilidades de interfaz del módulo de torneos (sin dependencias).
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return el;
}
export const $ = (s, r) => (r || document).querySelector(s);
export function limpiar(el) { el.replaceChildren(); return el; } // atómico: un blur durante el borrado no lo interrumpe
export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Modal: devuelve {el, cerrar, cuerpo, pie}. op: {titulo, clase, alCerrar}
export function modal(op) {
  const cuerpo = h('div', { class: 'cuerpo' }), pie = h('footer');
  const caja = h('div', { class: 'modal ' + (op.clase || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': op.titulo },
    h('header', null, h('h2', null, op.titulo), h('button', { 'aria-label': 'Cerrar', onclick: () => cerrar() }, '×')), cuerpo, pie);
  const velo = h('div', { class: 'velo', onmousedown: e => { if (e.target === velo && !op.fijo) cerrar(); } }, caja);
  const tecla = e => { if (e.key === 'Escape' && !op.fijo) cerrar(); };
  function cerrar() { velo.remove(); document.removeEventListener('keydown', tecla); op.alCerrar && op.alCerrar(); }
  document.addEventListener('keydown', tecla);
  document.body.append(velo);
  setTimeout(() => { const f = caja.querySelector('input,select,textarea'); f && f.focus(); }, 30);
  return { el: caja, cuerpo, pie, cerrar };
}
export function confirmar(texto, siTexto) {
  return new Promise(res => {
    const m = modal({ titulo: 'Confirmar', clase: 'chico', alCerrar: () => res(false) });
    m.cuerpo.append(h('p', { class: 'j' }, texto));
    m.pie.append(h('button', { class: 'btn', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => { res(true); m.cerrar(); } }, siTexto || 'Sí, continuar'));
  });
}
export function avisoModal(titulo, texto) {
  const m = modal({ titulo, clase: 'chico' });
  (Array.isArray(texto) ? texto : [texto]).forEach(t => m.cuerpo.append(typeof t === 'string' ? h('p', { class: 'j' }, t) : t));
  m.pie.append(h('button', { class: 'btn pri', onclick: () => m.cerrar() }, 'Entendido'));
  return m;
}
let _toast;
export function toast(msg, tipo) {
  if (_toast) _toast.remove();
  _toast = h('div', { class: tipo === 'error' ? 'error' : 'ok-msg', style: { position: 'fixed', right: '18px', bottom: '18px', zIndex: 80, maxWidth: '420px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' } }, msg);
  document.body.append(_toast);
  const t = _toast; setTimeout(() => t.remove(), tipo === 'error' ? 7000 : 3200);
}
// Campo de formulario enlazado a un objeto: campo(obj, 'clave', 'Etiqueta', {tipo, opciones, alCambiar})
export function campo(obj, clave, etiqueta, op) {
  op = op || {};
  let input;
  const set = v => { obj[clave] = v; op.alCambiar && op.alCambiar(v); };
  if (op.opciones) {
    input = h('select', { onchange: e => set(op.num ? +e.target.value : e.target.value) },
      Object.entries(op.opciones).map(([v, t]) => h('option', { value: v, selected: String(obj[clave] ?? '') === String(v) }, t)));
  } else if (op.tipo === 'check') {
    return h('label', { class: 'ck' }, h('input', { type: 'checkbox', checked: !!obj[clave], onchange: e => set(e.target.checked) }), etiqueta);
  } else if (op.tipo === 'area') {
    input = h('textarea', { rows: op.filas || 3, onchange: e => set(e.target.value) }); input.value = obj[clave] ?? '';
  } else {
    input = h('input', { type: op.tipo || 'text', value: obj[clave] ?? '', min: op.min, max: op.max, step: op.step, placeholder: op.ph || null,
      onchange: e => set(op.tipo === 'number' ? (e.target.value === '' ? 0 : +e.target.value) : e.target.value) });
  }
  return h('label', { class: 'f' }, etiqueta, input);
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fCorta(d) { if (!d) return ''; const x = new Date(d + 'T12:00:00Z'); return DIAS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MESES[x.getUTCMonth()]; }
export function fLarga(d) { if (!d) return ''; const x = new Date(d + 'T12:00:00Z'); return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][x.getUTCDay()] + ' ' + x.getUTCDate() + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][x.getUTCMonth()] + ' de ' + x.getUTCFullYear(); }
export function descargar(nombre, texto, tipo) {
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + texto], { type: tipo || 'text/csv;charset=utf-8' })), download: nombre });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function csv(filas) { return filas.map(f => f.map(x => { const s = String(x == null ? '' : x); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n'); }
export function diasEntre(a, b) { const out = []; for (let d = new Date(a + 'T12:00:00Z'); d <= new Date(b + 'T12:00:00Z') && out.length < 60; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; }
