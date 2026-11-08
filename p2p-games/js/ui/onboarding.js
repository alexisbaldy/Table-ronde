import { createProfile, validateName } from '../core/identity.js';
export function render() {
  return `<div class="onboard"><form id="f" novalidate>
    <h1>Bienvenue</h1>
    <p class="muted">Choisis le pseudo que tes amis verront. Tu pourras le changer quand tu veux. Aucun compte n'est créé : tout reste sur cet ordinateur.</p>
    <label for="n">Ton pseudo</label><input id="n" name="n" maxlength="24" autocomplete="off" autofocus>
    <div class="err" id="e"></div>
    <button class="primary" type="submit">Commencer</button></form></div>`;
}
export function bind(root, ctx) {
  const f = root.querySelector('#f'), e = root.querySelector('#e');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const v = validateName(f.n.value); if (!v.ok) { e.textContent = v.error; return; }
    try { ctx.setMe(await createProfile(v.name)); ctx.navigate('/'); ctx.show(); } catch (x) { e.textContent = x.message; }
  };
}
