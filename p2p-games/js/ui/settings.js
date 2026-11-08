import { esc, toast } from './util.js';
import { onRenamed } from '../social/social.js';
import { renameProfile, getPrefs, setPrefs, DEFAULT_ICE, badge } from '../core/identity.js';
export async function render({ me }) {
  const p = await getPrefs(), b = badge(me.fp);
  return `<h1>Réglages</h1>
  <div class="panel"><h2>Pseudo</h2><label for="n">Nom affiché auprès de tes amis</label>
  <div class="row"><input id="n" maxlength="24" value="${esc(me.name)}"><button id="ren" class="primary">Enregistrer</button></div><div class="err" id="e"></div></div>
  <div class="panel"><h2>Identité</h2><p class="muted">Générée sur cet ordinateur ; seule ta clé publique est partagée. Si tu effaces les données du navigateur, tu perds cette identité et tes amis te verront comme une nouvelle personne.</p>
  <p>Empreinte : <code>${esc(me.fp)}</code> <span class="badge" style="color:${b.color}">pastille ${b.tag}</span></p></div>
  <div class="panel"><h2>Connexion réseau (ICE)</h2><p class="muted">Serveurs STUN par défaut. Si certains amis n'arrivent pas à se connecter (réseaux 4G, entreprises), ajoute un serveur TURN ici.</p>
  <textarea id="ice" spellcheck="false">${esc(JSON.stringify(p.ice, null, 2))}</textarea><div class="err" id="ie"></div>
  <div class="row"><button id="save">Enregistrer</button><button id="reset">Valeurs par défaut</button></div></div>`;
}
export function bind(root, ctx) {
  root.querySelector('#ren').onclick = async () => {
    try { ctx.me.name = await renameProfile(root.querySelector('#n').value); root.querySelector('#e').textContent = ''; ctx.refreshShell(); onRenamed(); toast('Pseudo mis à jour'); }
    catch (x) { root.querySelector('#e').textContent = x.message; }
  };
  const ta = root.querySelector('#ice'), ie = root.querySelector('#ie');
  root.querySelector('#save').onclick = async () => {
    try {
      const v = JSON.parse(ta.value);
      if (!Array.isArray(v) || !v.every(s => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))) throw new Error('liste d\'objets avec "urls" attendue.');
      await setPrefs({ ...(await getPrefs()), ice: v }); ie.textContent = ''; toast('Réglages enregistrés');
    } catch (x) { ie.textContent = 'Configuration invalide : ' + x.message; }
  };
  root.querySelector('#reset').onclick = async () => { await setPrefs({ ice: DEFAULT_ICE }); ta.value = JSON.stringify(DEFAULT_ICE, null, 2); ie.textContent = ''; toast('Valeurs par défaut rétablies'); };
}
