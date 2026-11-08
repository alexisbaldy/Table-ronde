// Lancer : node tests/board.test.mjs
import { Chess } from '../vendor/chess.js';
import { boardHtml, bindBoard } from '../js/games/chess/board.js';
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK   ' : 'ECHEC', m); if (!c) fails++; };
const mk = (fen, color = 'w') => ({ chess: new Chess(fen), myColor: color, ui: { sel: null, promo: null }, status: 'playing', moves: [], tryMove(f, t, p) { this.moves.push([f, t, p]); try { this.chess.move({ from: f, to: t, promotion: p }); return true; } catch { return false; } } });
const count = (h, re) => (h.match(re) || []).length;
let s = mk(); let h = boardHtml(s);
ok(count(h, /class="sq /g) === 64, '64 cases');
ok(count(h, /class="p [wb]"/g) === 32, '32 pièces au départ');
ok(h.indexOf('data-sq="a8"') < h.indexOf('data-sq="h1"'), 'blancs en bas : a8 en premier');
ok(boardHtml(mk(undefined, 'b')).indexOf('data-sq="h1"') < boardHtml(mk(undefined, 'b')).indexOf('data-sq="a8"'), 'noirs : plateau retourné (h1 en premier)');
s.ui.sel = 'e2'; h = boardHtml(s); ok(count(h, /class="sq [^"]*target/g) === 2, 'pion e2 : 2 cases de destination surlignées');
ok(count(boardHtml(mk('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1')), /sq [^"]*check/g) === 1, 'roi en échec marqué');
ok(count(boardHtml(mk('7k/P7/8/8/8/8/8/K7 w - - 0 1')), /data-promo/g) === 0, 'sélecteur de promotion absent par défaut');
s = mk('7k/P7/8/8/8/8/8/K7 w - - 0 1'); s.ui.promo = { from: 'a7', to: 'a8' }; ok(count(boardHtml(s), /data-promo/g) === 4, 'promotion : 4 choix');
// Interaction : simulation de clics (faux DOM minimal)
function click(s, sq, promo) {
  let handler; const root = { querySelector: () => ({ set onclick(f) { handler = f; } }) }; let redraws = 0;
  bindBoard(root, s, () => redraws++);
  handler({ target: { closest: sel => sel === '[data-promo]' ? (promo ? { dataset: { promo } } : null) : (sq ? { dataset: { sq } } : null) } }); return redraws;
}
s = mk(); click(s, 'e2'); ok(s.ui.sel === 'e2', 'clic sur sa pièce : sélection');
click(s, 'e4'); ok(s.moves.length === 1 && s.chess.get('e4')?.type === 'p', 'clic sur case légale : coup joué');
s = mk(); click(s, 'e2'); click(s, 'e5'); ok(s.moves.length === 0 && s.ui.sel === null, 'case illégale : aucun coup, sélection levée');
s = mk(); click(s, 'e7'); ok(s.ui.sel === null, 'pièce adverse : non sélectionnable');
s = mk(); s.chess.move('e4'); click(s, 'e2'); ok(s.ui.sel === null, 'hors de son tour : clic ignoré');
s = mk('7k/P7/8/8/8/8/8/K7 w - - 0 1'); click(s, 'a7'); click(s, 'a8'); ok(s.ui.promo && s.moves.length === 0, 'arrivée au bord : choix de promotion demandé');
click(s, null, 'q'); ok(s.moves[0][2] === 'q' && s.chess.get('a8')?.type === 'q', 'promotion en dame jouée');
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent'); process.exit(fails ? 1 : 0);
