// Partie d'échecs entre deux joueurs. Les DEUX côtés appliquent les règles (chess.js) : rien n'est cru sur parole.
// L'hôte (celui qui invite) tranche en cas de désaccord ; chacun garde l'historique pour reprendre plus tard.
import { Chess } from '../../../vendor/chess.js';
import { social, pairChannel, notify, say, friendName } from '../../social/social.js';
import { put, remove, getAll } from '../../core/db.js';

const sessions = new Map();
const KINDS = ['start', 'move', 'sync_request', 'sync', 'resign', 'draw_offer', 'draw_accept', 'draw_decline', 'rematch_offer', 'rematch_accept'];
const RESULTS = ['checkmate', 'stalemate', 'repetition', 'material', 'fifty', 'resign', 'agreement'];
const prefix = (a, b) => a.length <= b.length && a.every((x, i) => b[i] === x);
export const getSession = gid => sessions.get(gid);

export class ChessSession {
  constructor(g, me) {
    Object.assign(this, { g, me, gid: g.id, oppFp: g.fp, host: !!g.host });
    this.chess = new Chess(); this.whiteFp = null; this.status = 'waiting'; this.result = null;
    this.drawOffer = null; this.rematch = null; this.notice = ''; this.ui = { sel: null, promo: null };
  }
  get myColor() { return this.whiteFp ? (this.whiteFp === this.me.fp ? 'w' : 'b') : null; }
  get oppName() { const f = social.state[this.oppFp]; return f ? friendName(f) : '?'; }
  get history() { return this.chess.history(); }
  send(kind, data = {}) { const ch = pairChannel(this.oppFp); if (ch) ch.send('game', { gid: this.gid, kind, ...data }).catch(() => {}); }

  async begin() {
    const rec = (await getAll('games')).find(r => r.id === 'active:' + this.gid);
    if (rec && this.g.resume) this.load(rec.whiteFp, rec.moves);
    if (this.host) { if (this.status === 'waiting') this.startNew(Math.random() < 0.5 ? this.me.fp : this.oppFp); else this.sendSync(); }
    notify();
  }
  // Reconstruit une partie en rejouant chaque coup avec les règles : un historique truqué est refusé.
  load(whiteFp, moves) {
    const c = new Chess();
    try { for (const m of moves) c.move(String(m)); } catch { return false; }
    this.chess = c; this.whiteFp = whiteFp; this.status = 'playing'; this.result = null; this.drawOffer = this.rematch = null; this.ui = { sel: null, promo: null };
    this.checkEnd(); return true;
  }
  startNew(whiteFp) {
    this.chess = new Chess(); this.whiteFp = whiteFp; this.status = 'playing'; this.result = null;
    this.drawOffer = this.rematch = null; this.notice = ''; this.ui = { sel: null, promo: null };
    if (this.host) this.send('start', { white: whiteFp });
    this.save(); notify();
  }

  // ---- coups locaux ----
  tryMove(from, to, promotion) {
    if (this.status !== 'playing' || this.chess.turn() !== this.myColor) return false;
    let m; try { m = this.chess.move({ from, to, promotion }); } catch { return false; }   // illégal : refusé
    this.drawOffer = null; this.ui = { sel: null, promo: null };
    this.send('move', { n: this.history.length, san: m.san });
    this.afterMove(); return true;
  }
  afterMove() { this.checkEnd(); this.save(); notify(); }
  checkEnd() {
    const c = this.chess; if (!c.isGameOver() || this.status === 'over') return false;
    const r = c.isCheckmate() ? { type: 'checkmate', winner: c.turn() === 'w' ? this.blackFp : this.whiteFp }
      : c.isStalemate() ? { type: 'stalemate' } : c.isThreefoldRepetition() ? { type: 'repetition' }
      : c.isInsufficientMaterial() ? { type: 'material' } : { type: 'fifty' };
    this.finish(r); return true;
  }
  get blackFp() { return this.whiteFp === this.me.fp ? this.oppFp : this.me.fp; }
  finish(result) {
    if (this.status === 'over') return;
    this.status = 'over'; this.result = { winner: null, ...result }; this.drawOffer = null; this.ui = { sel: null, promo: null };
    remove('games', 'active:' + this.gid).catch(() => {});
    put('games', { id: `done:${this.gid}:${Date.now()}`, game: 'chess', fp: this.oppFp, oppName: this.oppName, whiteFp: this.whiteFp, moves: this.history, result: this.result, at: Date.now() }).catch(() => {});
    notify();
  }
  save() {
    if (this.status !== 'playing') return;
    put('games', { id: 'active:' + this.gid, game: 'chess', gid: this.gid, fp: this.oppFp, oppName: this.oppName, whiteFp: this.whiteFp, moves: this.history, at: Date.now() }).catch(() => {});
  }

  // ---- actions de la partie ----
  resign() { if (this.status !== 'playing') return; this.send('resign'); this.finish({ type: 'resign', winner: this.oppFp }); }
  offerDraw() { if (this.status !== 'playing' || this.drawOffer) return; this.drawOffer = 'me'; this.send('draw_offer'); notify(); }
  acceptDraw() { if (this.drawOffer !== 'them') return; this.send('draw_accept'); this.finish({ type: 'agreement' }); }
  declineDraw() { if (this.drawOffer !== 'them') return; this.drawOffer = null; this.send('draw_decline'); notify(); }
  offerRematch() { if (this.status !== 'over' || this.rematch) return; this.rematch = 'me'; this.send('rematch_offer'); notify(); }
  acceptRematch() { if (this.rematch !== 'them') return; this.rematch = null; if (this.host) this.startNew(this.blackFp); else { this.send('rematch_accept'); notify(); } }

  // ---- réseau ----
  receive(d) {
    switch (d.kind) {
      case 'start': return this.onStart(d);
      case 'move': return this.onMove(d);
      case 'sync_request': return this.host && this.sendSync();
      case 'sync': return this.onSync(d);
      case 'resign': if (this.status === 'playing') this.finish({ type: 'resign', winner: this.me.fp }); return;
      case 'draw_offer': if (this.status === 'playing') { this.drawOffer = 'them'; say(`${this.oppName} propose la nulle`); notify(); } return;
      case 'draw_accept': if (this.drawOffer === 'me' && this.status === 'playing') this.finish({ type: 'agreement' }); return;
      case 'draw_decline': if (this.drawOffer === 'me') { this.drawOffer = null; say(`${this.oppName} refuse la nulle`); notify(); } return;
      case 'rematch_offer': if (this.status !== 'over') return; if (this.rematch === 'me' && this.host) return this.startNew(this.blackFp);
        this.rematch = 'them'; say(`${this.oppName} propose de rejouer`); notify(); return;
      case 'rematch_accept': if (this.host && this.status === 'over' && this.rematch === 'me') this.startNew(this.blackFp); return;
    }
  }
  validWhite(fp) { return fp === this.me.fp || fp === this.oppFp; }
  onStart(d) {
    if (this.host || !this.validWhite(d.white) || !(this.status === 'waiting' || this.status === 'over')) return;
    this.chess = new Chess(); this.whiteFp = d.white; this.status = 'playing'; this.result = null; this.drawOffer = this.rematch = null; this.notice = ''; this.ui = { sel: null, promo: null };
    this.save(); notify();
  }
  onMove(d) {
    if (this.status !== 'playing' || !this.whiteFp) return;
    if (this.chess.turn() === this.myColor) return this.requestSync();           // ce n'est pas son tour
    const n = this.history.length;
    if (!Number.isInteger(d.n) || d.n <= n) return;                              // doublon déjà appliqué
    if (d.n > n + 1) return this.requestSync();                                  // coup manquant
    try { this.chess.move(String(d.san)); } catch { this.notice = 'Coup illégal reçu : ignoré.'; say(this.notice); return this.requestSync(); }
    this.drawOffer = null; this.afterMove();
  }
  requestSync() { if (this.host) this.sendSync(); else this.send('sync_request'); }
  sendSync() { if (this.whiteFp) this.send('sync', { white: this.whiteFp, moves: this.history, result: this.result }); }
  onSync(d) {
    if (this.host || !this.validWhite(d.white) || !Array.isArray(d.moves) || d.moves.length > 600) return;
    const t = new Chess(); try { for (const m of d.moves) t.move(String(m)); } catch { this.notice = 'Historique reçu invalide : ignoré.'; return notify(); }
    const mine = this.history, theirs = t.history();
    if (this.whiteFp === d.white && this.status === 'playing' && theirs.length < mine.length && prefix(theirs, mine)) {   // je suis en avance : je renvoie mes coups
      for (let i = theirs.length; i < mine.length; i++) this.send('move', { n: i + 1, san: mine[i] });
      return;
    }
    if (this.status === 'over' && !d.result && theirs.length === 0) return;      // revanche déjà finie ici, pas encore là-bas
    this.chess = t; this.whiteFp = d.white; this.result = null; this.status = 'playing'; this.drawOffer = null; this.ui = { sel: null, promo: null };
    const r = d.result; if (r && RESULTS.includes(r.type) && [null, undefined, this.me.fp, this.oppFp].includes(r.winner)) this.finish({ type: r.type, winner: r.winner || null }); else this.checkEnd();
    this.save(); notify();
  }
  reconnected() { if (this.host) this.sendSync(); else this.send('sync_request'); }
}

export function resultText(s) {
  const r = s.result; if (!r) return ''; const me = r.winner === s.me.fp, opp = s.oppName;
  return { checkmate: me ? 'Échec et mat : tu as gagné !' : `Échec et mat : ${opp} a gagné.`,
    resign: me ? `${opp} a abandonné : tu as gagné.` : 'Tu as abandonné.',
    stalemate: 'Pat : match nul.', repetition: 'Nulle par triple répétition.', material: 'Nulle : matériel insuffisant.',
    fifty: 'Nulle : règle des 50 coups.', agreement: 'Nulle par accord mutuel.' }[r.type] || 'Partie terminée.';
}

// Branchement sur la couche sociale (session créée au démarrage de la partie, messages filtrés par adversaire).
social.onGameStart = g => { if (g.game !== 'chess') return; const s = new ChessSession(g, social.me); sessions.set(g.id, s); s.begin(); };
social.onGameLeave = g => sessions.delete(g.id);
social.onGameMessage = (fp, d) => { const s = d && sessions.get(d.gid); if (s && fp === s.oppFp && KINDS.includes(d.kind)) s.receive(d); };
social.onPeerVerified = fp => sessions.forEach(s => { if (s.oppFp === fp) s.reconnected(); });
