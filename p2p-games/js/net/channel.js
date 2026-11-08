// Salon P2P : les pairs se trouvent via des relais publics (signalisation seulement : BitTorrent + Nostr
// en parallèle pour la redondance), puis les données circulent en WebRTC direct entre les joueurs.
import { joinTorrent, joinNostr, torrentSockets, nostrSockets, torrentUrls } from '../../vendor/trystero.js';
import { Session } from './protocol.js';
import { b64u } from '../core/crypto.js';

const APP_ID = 'table-ronde-v1';
const HEARTBEAT = 5000, STALE_AFTER = 15000, REJOIN_AFTER = 30000;

export const defaultStrategies = () => [
  { name: 'torrent', join: joinTorrent, sockets: torrentSockets, config: { relayConfig: { urls: torrentUrls } } },
  { name: 'nostr', join: joinNostr, sockets: nostrSockets, config: {} },
];
// Le nom du salon est un hash : un observateur des relais ne voit pas le code lui-même.
export async function roomIdFor(secret) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('table-ronde-room:' + secret));
  return b64u(d).slice(0, 24);
}

export class Channel {
  // opts: {me, secret, ice, expectedFp?, strategies?}
  // globalThis.__strategyFactory : crochet réservé aux tests (réseau simulé)
  constructor(opts) { Object.assign(this, { strategies: (globalThis.__strategyFactory || defaultStrategies)(opts) }, opts); this.peers = new Map(); this.listeners = new Set(); this.closed = false; this.rooms = []; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit(ev) { this.listeners.forEach(f => f(ev)); }
  // Une personne = une ligne, même si elle a plusieurs fenêtres ouvertes. Ses propres autres fenêtres sont masquées.
  list() {
    const RANK = { verified: 3, stale: 2, connecting: 1, rejected: 0 }, groups = new Map();
    for (const [id, p] of this.peers) {
      if (p.status === 'self') continue;
      const key = p.fp || id, g = groups.get(key);
      if (!g) groups.set(key, { id, name: p.name, fp: p.fp, pub: p.pub, status: p.status, reason: p.reason, windows: 1 });
      else { g.windows++; if (RANK[p.status] > RANK[g.status]) Object.assign(g, { status: p.status, id, reason: p.reason }); }
    }
    return [...groups.values()];
  }
  ownWindows() { return [...this.peers.values()].filter(p => p.status === 'self').length; }
  // État des relais de rencontre, pour diagnostiquer « personne ne apparaît ».
  relayStatus() {
    return this.strategies.map(st => {
      let socks = {}; try { socks = st.sockets() || {}; } catch {}
      const urls = Object.keys(socks);
      return { name: st.name, total: urls.length, open: urls.filter(u => socks[u] && socks[u].readyState === 1).length };
    });
  }

  async open() {
    this.roomId = await roomIdFor(this.secret);
    this.openedAt = Date.now();
    this.#join();
    this.timer = setInterval(() => this.#tick(), HEARTBEAT);
    this.lastAnyContact = Date.now();
  }
  #join() {
    this.rooms = this.strategies.map(st => {
      const room = st.join({ appId: APP_ID, rtcConfig: { iceServers: this.ice }, ...(st.config || {}) }, this.roomId);
      const action = room.makeAction('msg');
      const rec = { name: st.name, room, send: (raw, id) => action.send(raw, { target: id }).catch(() => {}) };
      // Un message est accepté quel que soit le chemin par lequel il arrive ; la signature le protège.
      action.onMessage = (raw, { peerId }) => {
        const p = this.peers.get(peerId);
        if (p) { p.lastSeen = Date.now(); this.lastAnyContact = Date.now(); p.session.receive(raw); }
      };
      room.onPeerJoin = id => this.#peerJoin(id, rec);   // Trystero 0.26 : propriétés assignables
      room.onPeerLeave = id => this.#peerLeave(id, rec);
      return rec;
    });
  }
  #peerJoin(id, rec) {
    const known = this.peers.get(id);
    if (known) { known.alt = rec; return; }              // déjà connecté par l'autre voie : on garde en secours
    const entry = { name: '?', fp: null, status: 'connecting', lastSeen: Date.now(), rec, alt: null };
    entry.session = new Session({
      me: this.me, expectedFp: this.expectedFp || null, send: raw => entry.rec.send(raw, id),
      onVerified: peer => { Object.assign(entry, { name: peer.name, fp: peer.fp, pub: peer.pub, status: 'verified' }); this.#emit({ kind: 'peers' }); this.#emit({ kind: 'verified', id, peer }); },
      onMessage: (type, data) => { if (type !== 'ping') this.#emit({ kind: 'message', id, from: entry, type, data }); },
      onReject: (reason, code) => { entry.status = code === 'self' ? 'self' : 'rejected'; entry.reason = reason; this.#emit({ kind: 'peers' }); },
    });
    this.peers.set(id, entry); this.#emit({ kind: 'peers' });
    entry.session.start();
  }
  #peerLeave(id, rec) {
    const e = this.peers.get(id); if (!e) return;
    if (e.alt === rec) { e.alt = null; return; }
    if (e.rec !== rec) return;
    if (e.alt) { e.rec = e.alt; e.alt = null; return; }   // bascule transparente sur l'autre connexion
    this.peers.delete(id); this.#emit({ kind: 'peers' });
  }
  async send(type, data, id = null) {
    for (const [pid, p] of this.peers) if (p.status === 'verified' && (!id || id === pid)) await p.session.sendMsg(type, data);
  }
  #tick() {
    const now = Date.now(); let changed = false;
    for (const p of this.peers.values()) {
      if (p.status === 'verified') {
        p.session.sendMsg('ping', null).catch(() => {});
        if (now - p.lastSeen > STALE_AFTER) { p.status = 'stale'; changed = true; }
      } else if (p.status === 'stale' && now - p.lastSeen <= STALE_AFTER) { p.status = 'verified'; changed = true; }
    }
    for (const [id, p] of this.peers) if (p.status === 'stale' && now - p.lastSeen > 60000) { this.peers.delete(id); changed = true; }   // fenêtre disparue
    if (changed) this.#emit({ kind: 'peers' });
    if (this.peers.size && now - this.lastAnyContact > REJOIN_AFTER) this.rejoin();   // nouvelle annonce + nouveau handshake ICE
  }
  async rejoin() {
    if (this.closed) return;
    await this.#leaveRooms();
    this.peers.clear(); this.lastAnyContact = Date.now(); this.#join(); this.#emit({ kind: 'peers' }); this.#emit({ kind: 'rejoined' });
  }
  async #leaveRooms() { await Promise.all(this.rooms.map(r => Promise.resolve().then(() => r.room.leave()).catch(() => {}))); this.rooms = []; }
  close() { this.closed = true; clearInterval(this.timer); this.#leaveRooms(); this.peers.clear(); this.#emit({ kind: 'peers' }); }
}
