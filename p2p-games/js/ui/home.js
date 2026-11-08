import { esc } from './util.js';
import { badge } from '../core/identity.js';
import { GAMES } from '../games/registry.js';
import { getAll } from '../core/db.js';
import * as S from '../social/social.js';
export const live = 'full';
export async function render({ me }) {
  const active = (await getAll('games')).filter(r => r.id.startsWith('active:') && S.social.state[r.fp]?.status === 'friend');
  const b = badge(me.fp), fr = S.friendsOf('friend'), online = fr.filter(f => S.presenceOf(f.fp).status === 'online').length, pin = S.friendsOf('pending_in').length;
  const inv = S.social.invites.map(i => { const f = S.social.state[i.fp], g = GAMES.find(x => x.id === i.game); if (!f || !g) return '';
    return `<div class="row panel"><span class="dot" style="background:${badge(f.fp).color}"></span><span style="flex:1"><strong>${esc(S.friendName(f))}</strong> ${i.resume ? 'veut reprendre votre partie d\'' : 't\'invite à jouer aux '}${esc(g.name)}</span><button class="primary" data-a="y" data-id="${esc(i.id)}">Accepter</button><button data-a="n" data-id="${esc(i.id)}">Refuser</button></div>`; }).join('');
  return `<h1>Salut, ${esc(me.name)}</h1>
  <p class="muted"><span class="dot" style="display:inline-block;background:${b.color}"></span> Ton identité : ${esc(me.name)} · ${b.tag}</p>
  <div class="stats"><div><strong>${online}</strong><span class="muted">amis connectés</span></div><div><strong>${fr.length}</strong><span class="muted">amis</span></div></div>
  ${S.social.invites.length ? `<h2>Invitations reçues</h2><div id="inv">${inv}</div>` : ''}
  ${active.length ? `<h2>Parties en cours</h2>${active.map(r => { const on = S.presenceOf(r.fp).status === 'online'; return `<div class="row panel"><span style="flex:1"><strong>${esc(S.friendName(S.social.state[r.fp]))}</strong> · ${Math.ceil(r.moves.length / 2)} coups</span><button class="primary" data-resume="${esc(r.gid)}" data-fp="${esc(r.fp)}" ${on ? '' : 'disabled'}>${on ? 'Reprendre' : 'Ami hors ligne'}</button></div>`; }).join('')}` : ''}
  ${pin ? `<div class="panel row"><span style="flex:1">${pin} demande${pin > 1 ? 's' : ''} d'ami en attente</span><a href="#/friends"><button class="primary">Voir</button></a></div>` : ''}
  <div class="panel"><h2>Jouer</h2><p class="muted">Invite un ami connecté depuis la page Amis.</p><a href="#/friends"><button class="primary">Mes amis</button></a> <a href="#/games"><button>Bibliothèque de jeux</button></a></div>`;
}
export function bind(root) {
  const inv = root.querySelector('#inv'); if (inv) inv.onclick = e => { const b = e.target.closest('button'); if (b) S.replyInvite(b.dataset.id, b.dataset.a === 'y'); };
  root.onclick = e => { const b = e.target.closest('button[data-resume]'); if (b) S.inviteFriend(b.dataset.fp, 'chess', { resume: b.dataset.resume }); };
}
