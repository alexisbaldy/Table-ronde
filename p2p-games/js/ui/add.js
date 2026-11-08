import { esc, toast } from './util.js';
import { badge, validateName } from '../core/identity.js';
import { unb64u, fingerprint } from '../core/crypto.js';
import * as S from '../social/social.js';
let target = null;
export async function render({ me }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); target = null;
  const k = q.get('k') || '', n = validateName(q.get('n'));
  try { const raw = unb64u(k); if (raw.length !== 65 || raw[0] !== 4 || !n.ok) throw 0; target = { pub: k, name: n.name, fp: await fingerprint(k) }; } catch {}
  if (!target) return `<h1>Lien invalide</h1><div class="empty">Ce lien d'invitation est incomplet ou abîmé. Demande à ton ami de t'en renvoyer un.</div>`;
  if (target.fp === me.fp) return `<h1>C'est ton lien</h1><p class="muted">Envoie-le à un ami : c'est lui qui doit l'ouvrir.</p>`;
  const cur = S.social.state[target.fp], b = badge(target.fp);
  if (cur) return `<h1>${esc(target.name)}</h1><div class="empty">${cur.status === 'friend' ? 'Déjà dans tes amis.' : 'Une demande est déjà en cours.'}</div><p><a href="#/friends"><button>Page Amis</button></a></p>`;
  return `<h1>Ajouter un ami</h1><div class="panel"><div class="row"><span class="dot" style="background:${b.color}"></span><strong style="font-size:1.2rem">${esc(target.name)}</strong><span class="badge">${b.tag}</span></div>
  <p class="muted" style="margin-top:.8rem">Ce lien identifie cette personne par sa clé : tu ajoutes la bonne, même si quelqu'un d'autre porte le même pseudo. Elle recevra ta demande dès qu'elle sera en ligne.</p>
  <button id="ok" class="primary">Envoyer la demande</button> <a href="#/friends"><button>Annuler</button></a></div>`;
}
export function bind(root, ctx) {
  const ok = root.querySelector('#ok'); if (!ok) return;
  ok.onclick = async () => { if (await S.requestFriend(target)) ctx.navigate('/friends'); else toast('Impossible d\'envoyer la demande'); };
}
