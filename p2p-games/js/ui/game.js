import { esc } from './util.js';
import { badge } from '../core/identity.js';
import { GAMES } from '../games/registry.js';
import * as S from '../social/social.js';
import { getSession, resultText } from '../games/chess/session.js';
import { boardHtml, bindBoard } from '../games/chess/board.js';
export const live = 'full';

const dotC = p => p === 'online' ? '#6fd3a0' : p === 'unstable' ? '#f0b35a' : '#ff7b7b';
function movesHtml(s) {
  const h = s.history; if (!h.length) return '<span class="muted">Aucun coup pour l\'instant.</span>';
  let out = ''; for (let i = 0; i < h.length; i += 2) out += `<div class="mv"><span class="n">${i / 2 + 1}.</span><span>${esc(h[i])}</span><span>${esc(h[i + 1] || '')}</span></div>`;
  return out;
}
function player(name, fp, color, mine, turn, extra) {
  const b = badge(fp);
  return `<div class="pl ${turn ? 'turn' : ''}"><span class="piece ${color}">♚︎</span><span class="dot" style="background:${b.color}"></span><strong>${esc(name)}</strong><span class="badge">${b.tag}${mine ? ' · toi' : ''}</span>${extra || ''}</div>`;
}
export function render({ me }) {
  const g = S.social.game;
  if (!g) return `<h1>Aucune partie en cours</h1><div class="empty">Invite un ami connecté depuis la page Amis ou la bibliothèque de jeux.</div><p><a href="#/games"><button class="primary">Bibliothèque de jeux</button></a></p>`;
  const s = getSession(g.id), def = GAMES.find(x => x.id === g.game), f = S.social.state[g.fp] || { name: '?', fp: g.fp }, p = S.presenceOf(g.fp);
  if (!s) return `<h1>${esc(def ? def.name : g.game)}</h1><div class="empty">Ce jeu n'est pas encore disponible.</div><button id="leave">Quitter</button>`;
  if (!s.whiteFp) return `<h1>Échecs</h1><div class="empty">Connexion avec ${esc(S.friendName(f))}… la partie démarre dans un instant.</div><button id="leave">Quitter</button>`;
  const white = s.whiteFp, black = s.blackFp, mineW = white === me.fp, turn = s.status === 'playing' ? s.chess.turn() : null;
  const oppState = g.ended ? 'a quitté' : p.status === 'online' ? 'connecté' : p.status === 'unstable' ? 'connexion instable' : 'déconnecté : reconnexion…';
  const oppLine = `<span class="badge"><span class="dot" style="background:${g.ended ? '#ff7b7b' : dotC(p.status)};display:inline-block"></span> ${oppState}</span>`;
  const nameOf = fp => fp === me.fp ? me.name : S.friendName(f);
  let status;
  if (s.status === 'over') status = `<strong>${esc(resultText(s))}</strong>`;
  else if (s.chess.turn() === s.myColor) status = `<strong>À toi de jouer</strong>${s.chess.inCheck() ? ' — tu es en échec !' : ''}`;
  else status = `Au tour de ${esc(S.friendName(f))}${s.chess.inCheck() ? ' — il est en échec' : ''}…`;
  let actions = '';
  if (s.status === 'playing') {
    actions = s.drawOffer === 'them' ? `<div class="offer">${esc(S.friendName(f))} propose la nulle <button class="primary" data-a="draw_y">Accepter</button><button data-a="draw_n">Refuser</button></div>`
      : `<button data-a="draw" ${s.drawOffer === 'me' ? 'disabled' : ''}>${s.drawOffer === 'me' ? 'Nulle proposée…' : 'Proposer la nulle'}</button>`;
    actions += `<button data-a="resign">Abandonner</button>`;
  } else actions = s.rematch === 'them' ? `<div class="offer">${esc(S.friendName(f))} propose de rejouer <button class="primary" data-a="re_y">Accepter</button></div>`
    : `<button class="primary" data-a="re" ${s.rematch === 'me' ? 'disabled' : ''}>${s.rematch === 'me' ? 'Revanche proposée…' : 'Rejouer (couleurs inversées)'}</button>`;
  return `<h1>Échecs</h1>
  <div class="chessgrid"><div>${boardHtml(s)}</div>
  <div class="side">
    ${player(nameOf(black), black, 'b', black === me.fp, turn === 'b', black === me.fp ? '' : oppLine)}
    ${player(nameOf(white), white, 'w', white === me.fp, turn === 'w', white === me.fp ? '' : oppLine)}
    <div class="panel status">${status}${s.notice ? `<div class="err">${esc(s.notice)}</div>` : ''}</div>
    <div class="panel"><h3>Coups</h3><div class="moves" id="moves">${movesHtml(s)}</div></div>
    <div class="row wrap">${actions}<button id="leave">Quitter</button></div>
  </div></div>`;
}
export function bind(root, ctx) {
  const g = S.social.game, s = g && getSession(g.id);
  root.querySelector('#leave') && (root.querySelector('#leave').onclick = async () => {
    if (s && s.status === 'playing' && !confirm('Quitter la partie ? Elle sera sauvegardée : vous pourrez la reprendre plus tard.')) return;
    await S.leaveGame(); ctx.navigate('/');
  });
  const mv = root.querySelector('#moves'); if (mv) mv.scrollTop = mv.scrollHeight;
  if (!s) return;
  bindBoard(root, s, () => ctx.show());
  root.querySelector('.side') && (root.querySelector('.side').onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'resign') { if (confirm('Abandonner la partie ?')) s.resign(); }
    else if (a === 'draw') s.offerDraw(); else if (a === 'draw_y') s.acceptDraw(); else if (a === 'draw_n') s.declineDraw();
    else if (a === 're') s.offerRematch(); else if (a === 're_y') s.acceptRematch();
    ctx.show();
  });
}
