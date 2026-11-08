import { esc, toast } from './util.js';
import { badge, inviteLink } from '../core/identity.js';
import { GAMES } from '../games/registry.js';
import * as S from '../social/social.js';

const STATUS = { online: ['#6fd3a0', 'en ligne'], unstable: ['#f0b35a', 'connexion instable'], offline: ['#5b6074', 'hors ligne'] };
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const who = f => { const b = badge(f.fp); return `${dot(b.color)}<strong>${esc(S.friendName(f))}</strong><span class="badge">${b.tag}</span>`; };

function searchHtml() {
  const s = S.social.search; if (!s) return '';
  const rows = s.candidates.map(c => { const b = badge(c.fp), cur = S.social.state[c.fp];
    return `<div class="row" style="padding:.35rem 0">${who(c)}<span style="flex:1"></span>${cur ? `<span class="tag">${cur.status === 'friend' ? 'déjà ami' : 'demande en cours'}</span>` : `<button class="primary" data-act="req" data-fp="${esc(c.fp)}">Envoyer la demande</button>`}</div>`; }).join('');
  const msg = s.status === 'searching' ? `Recherche de « ${esc(s.name)} »… (15 s)` : s.candidates.length ? 'Plusieurs personnes peuvent porter le même pseudo : repère la bonne grâce à la pastille.' : 'Personne trouvé. Cette personne doit être en ligne, avec exactement ce pseudo. Sinon, envoie-lui ton lien d\'invitation (ci-dessus) ou utilise le sien.';
  return `<div class="panel"><div class="row"><h2 style="margin:0;flex:1">Résultats</h2><button data-act="closesearch">Fermer</button></div><p class="muted" style="margin:.5rem 0">${msg}</p>${rows}</div>`;
}
export function renderLive() {
  const pin = S.friendsOf('pending_in'), pout = S.friendsOf('pending_out'), fr = S.friendsOf('friend');
  const inv = GAMES.filter(g => g.invitable);
  const reqIn = pin.length ? `<h2>Demandes reçues</h2>${pin.map(f => `<div class="panel row">${who(f)}<span style="flex:1"></span><button class="primary" data-act="accept" data-fp="${esc(f.fp)}">Accepter</button><button data-act="decline" data-fp="${esc(f.fp)}">Refuser</button></div>`).join('')}` : '';
  const reqOut = pout.length ? `<h2>Demandes envoyées</h2>${pout.map(f => `<div class="panel row">${who(f)}<span class="muted" style="flex:1;font-size:.85rem">${S.pendingDelivery(f.fp) ? 'en attente de remise (sa personne doit être en ligne)' : 'remise, en attente de réponse'}</span><button data-act="cancel" data-fp="${esc(f.fp)}">Annuler</button></div>`).join('')}` : '';
  const list = fr.length ? fr.map(f => { const p = S.presenceOf(f.fp), [c, label] = p.playing ? ['#9d8cff', 'en partie'] : STATUS[p.status];
    return `<div class="panel row">${who(f)}<span class="badge" style="flex:1;margin-left:.4rem">${dot(c)}&nbsp;${label}</span>
      ${p.status === 'online' ? inv.map(g => `<button class="primary" data-act="invite" data-game="${g.id}" data-fp="${esc(f.fp)}">Inviter (${esc(g.name)})</button>`).join('') : ''}
      <button data-act="alias" data-fp="${esc(f.fp)}">Renommer</button><button data-act="remove" data-fp="${esc(f.fp)}">Retirer</button></div>`; }).join('')
    : `<div class="empty">Aucun ami pour l'instant. Cherche un pseudo ou envoie ton lien d'invitation.</div>`;
  return searchHtml() + reqIn + reqOut + `<h2>Mes amis (${fr.length})</h2>${list}`;
}
export function render({ me }) {
  return `<h1>Amis</h1>
  <div class="cols"><div class="panel"><h2>Ajouter par pseudo</h2><p class="muted">La personne doit être en ligne.</p>
    <div class="row"><input id="q" maxlength="24" placeholder="Pseudo exact" autocomplete="off"><button id="search" class="primary">Chercher</button></div></div>
  <div class="panel"><h2>Ou par lien</h2><p class="muted">Garantit la bonne personne, même si deux joueurs ont le même pseudo. Le lien dépend de ton pseudo actuel : régénère-le si tu en changes.</p>
    <code class="link">${esc(inviteLink(me))}</code><button id="copy">Copier mon lien</button></div></div>
  <div id="live">${renderLive()}</div>`;
}
export function bindLive(root) {
  root.querySelector('#live').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return; const fp = b.dataset.fp, a = b.dataset.act, f = S.social.state[fp];
    if (a === 'req') await S.requestFriend(S.social.search.candidates.find(c => c.fp === fp));
    else if (a === 'closesearch') S.stopSearch();
    else if (a === 'accept') await S.acceptFriend(fp);
    else if (a === 'decline') await S.declineFriend(fp);
    else if (a === 'cancel') await S.cancelRequest(fp);
    else if (a === 'invite') await S.inviteFriend(fp, b.dataset.game);
    else if (a === 'alias') { const v = prompt(`Nom à afficher pour ${f.name} (vide = nom d'origine) :`, f.alias || ''); if (v !== null) await S.setAlias(fp, v); }
    else if (a === 'remove' && confirm(`Retirer ${S.friendName(f)} de tes amis ?`)) await S.removeFriend(fp);
  };
}
export function bind(root, { me }) {
  bindLive(root);
  const q = root.querySelector('#q'), go = () => q.value.trim() ? S.startSearch(q.value) : toast('Saisis un pseudo');
  root.querySelector('#search').onclick = go; q.onkeydown = e => { if (e.key === 'Enter') go(); };
  root.querySelector('#copy').onclick = async () => { try { await navigator.clipboard.writeText(inviteLink(me)); toast('Lien copié'); } catch { toast('Copie impossible : sélectionne le lien à la main'); } };
}
