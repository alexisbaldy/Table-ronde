import { esc } from './util.js';
import { badge } from '../core/identity.js';
import { GAMES } from '../games/registry.js';
import { getAll } from '../core/db.js';
import * as S from '../social/social.js';
export const live = 'full';
const RES = { checkmate: 'échec et mat', resign: 'abandon', stalemate: 'pat', repetition: 'répétition', material: 'matériel insuffisant', fifty: '50 coups', agreement: 'nulle accordée' };
export async function render({ me }) {
  const online = S.friendsOf('friend').filter(f => S.presenceOf(f.fp).status === 'online' && !S.presenceOf(f.fp).playing);
  const done = (await getAll('games')).filter(r => r.id.startsWith('done:')).sort((a, b) => b.at - a.at).slice(0, 15);
  const cards = GAMES.map(g => `<div class="panel"><div class="game"><div class="art" aria-hidden="true">${g.icon}</div>
    <div><h2>${esc(g.name)} <span class="tag">${esc(g.players)}</span></h2><p class="muted">${esc(g.description)}</p></div></div>
    ${g.available && g.invitable ? `<h3 style="margin-top:1rem">Inviter un ami connecté</h3>${online.length ? online.map(f => `<div class="row" style="padding:.3rem 0"><span class="dot" style="background:${badge(f.fp).color}"></span><strong>${esc(S.friendName(f))}</strong><span style="flex:1"></span><button class="primary" data-fp="${esc(f.fp)}" data-game="${g.id}">Inviter</button></div>`).join('') : '<div class="empty">Aucun ami disponible pour l\'instant. <a href="#/friends" style="color:var(--accent)">Voir mes amis</a></div>'}` : '<span class="tag">En préparation</span>'}</div>`).join('');
  const hist = done.length ? `<h2>Historique</h2>${done.map(r => { const won = r.result.winner === me.fp, draw = !r.result.winner;
    return `<div class="panel row"><strong style="flex:1">${esc(r.oppName)}</strong><span class="tag" style="${won ? 'color:var(--ok)' : draw ? '' : 'color:var(--bad)'}">${draw ? 'nulle' : won ? 'victoire' : 'défaite'}</span><span class="badge">${RES[r.result.type] || ''} · ${Math.ceil(r.moves.length / 2)} coups · ${new Date(r.at).toLocaleDateString()}</span></div>`; }).join('')}` : '';
  return `<h1>Jeux</h1>${cards}${hist}`;
}
export function bind(root) {
  root.onclick = e => { const b = e.target.closest('button[data-fp]'); if (b) S.inviteFriend(b.dataset.fp, b.dataset.game); };
}
