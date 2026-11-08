// Plateau d'échecs : rendu HTML pur (testable) + gestion des clics/touches. Cases = vrais boutons (tactile et clavier).
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }, VS = '\uFE0E';   // VS : force le glyphe texte (pas l'emoji iOS)
const NAMES = { k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };
const FILES = 'abcdefgh';

export function boardHtml(s) {
  const c = s.chess, flip = s.myColor === 'b', grid = c.board();
  const hist = c.history({ verbose: true }), last = hist[hist.length - 1];
  const sel = s.ui.sel, moves = sel ? c.moves({ square: sel, verbose: true }) : [], targets = new Map(moves.map(m => [m.to, m]));
  let kingSq = null; if (c.inCheck()) for (const row of grid) for (const p of row) if (p && p.type === 'k' && p.color === c.turn()) kingSq = p.square;
  const rows = flip ? [...grid].reverse().map(r => [...r].reverse()) : grid;
  let html = '';
  rows.forEach((row, ri) => row.forEach((p, ci) => {
    const file = flip ? 7 - ci : ci, rank = flip ? ri + 1 : 8 - ri, sq = FILES[file] + rank, dark = (file + rank) % 2 === 1;
    const cls = ['sq', dark ? 'dark' : 'light', sel === sq ? 'sel' : '', last && (last.from === sq || last.to === sq) ? 'last' : '', kingSq === sq ? 'check' : '', targets.has(sq) ? 'target' : '', targets.has(sq) && p ? 'cap' : ''].filter(Boolean).join(' ');
    const label = `${sq}, ${p ? `${NAMES[p.type]} ${p.color === 'w' ? 'blanc' : 'noir'}` : 'vide'}`;
    const coord = (ci === 0 ? `<i class="co" style="left:3px;top:2px">${rank}</i>` : '') + (ri === 7 ? `<i class="co" style="right:3px;bottom:1px">${FILES[file]}</i>` : '');
    html += `<button class="${cls}" data-sq="${sq}" aria-label="${label}">${p ? `<span class="p ${p.color}">${GLYPH[p.type]}${VS}</span>` : ''}${coord}</button>`;
  }));
  const promo = s.ui.promo ? `<div class="promo" role="dialog" aria-label="Promotion">${['q', 'r', 'b', 'n'].map(t => `<button data-promo="${t}" aria-label="${NAMES[t]}"><span class="p ${s.myColor}">${GLYPH[t]}${VS}</span></button>`).join('')}</div>` : '';
  return `<div class="boardwrap"><div class="board" data-turn="${c.turn()}">${html}</div>${promo}</div>`;
}

// rerender() : redessine la page. Retourne true si la touche a été traitée.
export function bindBoard(root, s, rerender) {
  const b = root.querySelector('.boardwrap'); if (!b) return;
  b.onclick = e => {
    const pr = e.target.closest('[data-promo]');
    if (pr && s.ui.promo) { const { from, to } = s.ui.promo; s.ui.promo = null; s.tryMove(from, to, pr.dataset.promo); return rerender(); }
    const el = e.target.closest('[data-sq]'); if (!el || s.ui.promo) return;
    if (s.status !== 'playing' || s.chess.turn() !== s.myColor) return;
    const sq = el.dataset.sq, piece = s.chess.get(sq);
    if (s.ui.sel && s.ui.sel !== sq) {
      const legal = s.chess.moves({ square: s.ui.sel, verbose: true }).filter(m => m.to === sq);
      if (legal.length) { if (legal[0].promotion) s.ui.promo = { from: s.ui.sel, to: sq }; else s.tryMove(s.ui.sel, sq); return rerender(); }
    }
    s.ui.sel = piece && piece.color === s.myColor && s.ui.sel !== sq ? sq : null; rerender();
  };
}
