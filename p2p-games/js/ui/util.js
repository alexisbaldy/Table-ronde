export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let t;
export function toast(msg) {
  const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 2200);
}
