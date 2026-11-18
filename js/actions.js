// Tiny action registry: views register handlers for data-action buttons;
// app.js wires one delegated click/change listener.

const handlers = new Map();
let rerenderFn = () => {};

export function on(name, fn) {
  handlers.set(name, fn);
}

export function dispatch(name, el, event) {
  const fn = handlers.get(name);
  return fn ? fn(el, event) : undefined;
}

export function setRerender(fn) {
  rerenderFn = fn;
}

export function rerender() {
  rerenderFn();
}

export function go(hash) {
  if (location.hash === hash) rerenderFn();
  else location.hash = hash;
}
