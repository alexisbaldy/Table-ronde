// Protocole de session entre deux joueurs, indépendant du transport (testable sous Node).
// 1) hello  : chaque côté annonce sa clé publique et un défi aléatoire.
// 2) auth   : chaque côté signe le défi de l'autre -> preuve de possession de la clé privée.
// 3) msg    : toute donnée ensuite est signée, horodatée et numérotée (anti-rejeu / anti-falsification).
import { sign, verify, fingerprint, b64u } from '../core/crypto.js';

const rand = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
const authText = (nonce, signerFp, verifierFp) => `table-ronde-auth:${nonce}:${signerFp}:${verifierFp}`;
const MAX_SKEW = 10 * 60 * 1000;

export class Session {
  // me: {name,pubRaw,fp,privateKey} ; send(string) ; expectedFp: refuse tout autre interlocuteur (optionnel)
  constructor({ me, send, expectedFp = null, onVerified, onMessage, onReject }) {
    Object.assign(this, { me, send, expectedFp, onVerified, onMessage, onReject });
    this.nonce = rand(); this.peer = null; this.state = 'new'; this.seqOut = 0; this.seqIn = 0; this.mineOk = false; this.theirsOk = false;
  }
  start() { this.send(JSON.stringify({ k: 'hello', pub: this.me.pubRaw, name: this.me.name, nonce: this.nonce })); }
  reject(reason, code = null) { if (this.state === 'rejected') return; this.state = 'rejected'; this.onReject && this.onReject(reason, code); }

  async receive(raw) {
    if (this.state === 'rejected') return;
    let m; try { m = JSON.parse(raw); } catch { return this.reject('message illisible'); }
    try {
      if (m.k === 'hello') return await this.#hello(m);
      if (!this.peer) return;                       // rien n'est accepté avant le hello
      if (m.k === 'auth') return await this.#auth(m);
      if (m.k === 'msg') return await this.#msg(m);
    } catch { this.reject('erreur de traitement'); }
  }
  async #hello(m) {
    if (this.peer) return;
    if (typeof m.pub !== 'string' || typeof m.nonce !== 'string' || m.nonce.length > 64) return this.reject('hello invalide');
    const fp = await fingerprint(m.pub);
    if (fp === this.me.fp) return this.reject('connexion à soi-même', 'self');
    if (this.expectedFp && fp !== this.expectedFp) return this.reject('identité inattendue (clé différente de celle de ton ami)');
    this.peer = { pub: m.pub, fp, name: String(m.name || '?').slice(0, 24), nonce: m.nonce };
    this.state = 'authenticating';
    this.send(JSON.stringify({ k: 'auth', sig: await sign(this.me.privateKey, authText(m.nonce, this.me.fp, fp)) }));
  }
  async #auth(m) {
    if (!(await verify(this.peer.pub, authText(this.nonce, this.peer.fp, this.me.fp), m.sig))) return this.reject('preuve d\'identité invalide');
    this.theirsOk = true; this.state = 'verified'; this.onVerified && this.onVerified({ ...this.peer });
  }
  async #msg(m) {
    if (this.state !== 'verified') return;
    if (!(await verify(this.peer.pub, m.body, m.sig))) return this.reject('signature invalide');
    const b = JSON.parse(m.body);
    if (!Number.isInteger(b.seq) || b.seq <= this.seqIn) return this.reject('message rejoué ou hors séquence');
    if (Math.abs(Date.now() - b.ts) > MAX_SKEW) return this.reject('horodatage aberrant');
    this.seqIn = b.seq; this.onMessage && this.onMessage(b.type, b.data, b);
  }
  async sendMsg(type, data) {
    if (this.state !== 'verified') throw new Error('session non vérifiée');
    const body = JSON.stringify({ type, data, seq: ++this.seqOut, ts: Date.now() });
    this.send(JSON.stringify({ k: 'msg', body, sig: await sign(this.me.privateKey, body) }));
  }
}
