// Réseau social : présence des amis, demandes (même hors ligne), invitations à jouer.
//  - Salon « paire »  : un par ami, privé, n'accepte QUE la clé de cet ami -> présence + invitations + parties.
//  - Salon « boîte »  : un par pseudo ; chacun écoute le sien pour recevoir les demandes d'amis.
//  - File d'envoi     : une demande/réponse non livrée est conservée et ré-essayée jusqu'à accusé de réception.
import { Channel } from '../net/channel.js';
import { getPrefs } from '../core/identity.js';
import { getAll, put, remove, kvGet, kvSet } from '../core/db.js';
import * as L from './logic.js';
import { GAMES } from '../games/registry.js';

export const social = { me: null, state: {}, presence: {}, remote: {}, invites: [], outgoing: {}, game: null, search: null, outbox: [], subs: new Set(), toasts: new Set() };
const pairs = new Map(), attempts = new Map();
let timer = null, inboxLease = null, inboxOff = null, searchLease = null, searchOff = null, searchTimer = null, searchToken = 0;

// Un salon ne peut être occupé qu'UNE fois par page (limite de WebRTC/Trystero). Boîte aux lettres, recherche et envois
// passent donc par un accès partagé : un seul Channel par salon, compté par nombre d'utilisateurs.
const pool = new Map();
function lease(secret, user) {
  let e = pool.get(secret);
  if (!e) {
    e = { ch: null, users: new Set() };
    e.ready = (async () => { e.ch = new Channel({ me: social.me, secret, ice: await ice() }); await e.ch.open(); })();
    e.ready.catch(() => { if (pool.get(secret) === e) pool.delete(secret); });
    pool.set(secret, e);
  }
  e.users.add(user);
  return e.ready.then(() => ({ ch: e.ch, release() { e.users.delete(user); if (!e.users.size && pool.get(secret) === e) { pool.delete(secret); e.ch.close(); } } }));
}
const emit = () => social.subs.forEach(f => f());
const say = t => social.toasts.forEach(f => f(t));
export { say, emit as notify };
const rid = () => crypto.randomUUID();
const ice = async () => (await getPrefs()).ice;
const FRIEND_MSGS = ['friend_request', 'friend_accept', 'friend_decline', 'friend_remove'];

export const friendName = f => f.alias || f.name;
export const friendsOf = status => Object.values(social.state).filter(f => f.status === status).sort((a, b) => friendName(a).localeCompare(friendName(b)));
export const presenceOf = fp => ({ status: 'offline', ...(social.presence[fp] || {}), playing: !!(social.presence[fp]?.status === 'online' && social.remote[fp]?.playing) });

export async function startSocial(me) {
  if (social.me && social.me.fp === me.fp) return;
  social.me = me;
  social.state = Object.fromEntries((await getAll('friends')).map(f => [f.fp, f]));
  social.outbox = (await kvGet('outbox')) || [];
  await syncPairs(); await startInbox();
  timer = setInterval(() => { expireOutbox(); kick(); }, 45000); kick(); emit();
}

// ---- persistance + effets --------------------------------------------------------------------
async function commit({ state, effects, error }) {
  if (error) { say(error); return false; }
  const old = social.state;
  for (const fp of Object.keys(old)) if (!state[fp]) await remove('friends', fp);
  for (const fp of Object.keys(state)) if (JSON.stringify(state[fp]) !== JSON.stringify(old[fp])) await put('friends', state[fp]);
  social.state = state;
  for (const e of effects) { if (e.kind === 'toast') say(e.text); if (e.kind === 'send') await enqueue(e.to, e.type); }
  await syncPairs(); emit(); return true;
}
export const requestFriend = target => commit(L.requestFriend(social.state, target, social.me.fp));
export const acceptFriend = fp => commit(L.accept(social.state, fp));
export const declineFriend = fp => commit(L.decline(social.state, fp));
export const cancelRequest = fp => commit(L.cancel(social.state, fp));
export const removeFriend = fp => commit(L.removeFriend(social.state, fp));
export const setAlias = (fp, a) => commit(L.setAlias(social.state, fp, a));

// ---- salons « paire » : présence et messages entre amis ------------------------------------------
async function syncPairs() {
  const want = new Set(friendsOf('friend').map(f => f.fp));
  for (const [fp, ch] of pairs) if (!want.has(fp)) { ch.close(); pairs.delete(fp); delete social.presence[fp]; delete social.remote[fp]; }
  for (const fp of want) if (!pairs.has(fp)) await openPair(social.state[fp]);
}
async function openPair(f) {
  const ch = new Channel({ me: social.me, secret: L.pairSecret(social.me.fp, f.fp), ice: await ice(), expectedFp: f.fp });
  ch.on(ev => {
    if (ev.kind === 'peers') updatePresence(f.fp, ch);
    if (ev.kind === 'verified') { ch.send('profile', { name: social.me.name }, ev.id); ch.send('status', { playing: !!social.game }, ev.id); social.onPeerVerified && social.onPeerVerified(f.fp); }
    if (ev.kind === 'message') onPairMessage(f.fp, ev);
  });
  pairs.set(f.fp, ch); await ch.open();
}
function updatePresence(fp, ch) {
  const p = ch.list().find(x => x.status !== 'rejected');
  const status = !p ? 'offline' : p.status === 'verified' ? 'online' : p.status === 'stale' ? 'unstable' : 'offline';
  if (status === 'offline') delete social.remote[fp];
  social.presence[fp] = { status }; emit();
}
async function onPairMessage(fp, ev) {
  const f = social.state[fp], d = ev.data || {}; if (!f) return;
  if (ev.type === 'profile' && typeof d.name === 'string') return void (await commit(L.updateName(social.state, fp, d.name)));
  if (ev.type === 'status') { social.remote[fp] = { playing: !!d.playing }; return emit(); }
  if (ev.type === 'game_invite' && typeof d.id === 'string' && GAMES.some(g => g.id === d.game && g.invitable)) {
    if (social.invites.some(i => i.id === d.id)) return;
    social.invites.push({ id: d.id, fp, game: d.game, resume: typeof d.resume === 'string' && d.resume.length < 80 ? d.resume : undefined, at: Date.now() });
    setTimeout(() => { social.invites = social.invites.filter(i => i.id !== d.id); emit(); }, 120000);
    say(`${friendName(f)} t'invite à jouer aux ${GAMES.find(g => g.id === d.game).name}`); return emit();
  }
  if (ev.type === 'invite_reply' && social.outgoing[d.id]) {
    const o = social.outgoing[d.id]; delete social.outgoing[d.id];
    if (d.accept) startGame({ id: o.resume || d.id, fp, game: o.game, host: true, resume: !!o.resume }); else { say(`${friendName(f)} a refusé l'invitation`); emit(); }
    return;
  }
  if (ev.type === 'game_leave' && social.game && social.game.id === d.id) { social.game.ended = true; say(`${friendName(f)} a quitté la partie`); return emit(); }
  if (ev.type === 'game' && social.onGameMessage) social.onGameMessage(fp, d);
}
export function pairChannel(fp) { return pairs.get(fp); }

// ---- invitations à jouer -----------------------------------------------------------------------
export async function inviteFriend(fp, game, extra = {}) {
  const ch = pairs.get(fp), f = social.state[fp];
  if (!ch || presenceOf(fp).status !== 'online') return say(`${f ? friendName(f) : 'Cet ami'} n'est pas connecté.`);
  const id = rid(); social.outgoing[id] = { fp, game, resume: extra.resume }; setTimeout(() => delete social.outgoing[id], 120000);
  await ch.send('game_invite', { id, game, resume: extra.resume }); say(`Invitation envoyée à ${friendName(f)}`);
}
export async function replyInvite(id, accept) {
  const inv = social.invites.find(i => i.id === id); if (!inv) return;
  social.invites = social.invites.filter(i => i.id !== id);
  if (accept) startGame({ id: inv.resume || id, fp: inv.fp, game: inv.game, host: false, resume: !!inv.resume }); else emit();   // la session existe avant que l'hôte écrive
  const ch = pairs.get(inv.fp); if (ch) await ch.send('invite_reply', { id, accept });
}
function startGame(g) { social.game = g; broadcastStatus(); social.onGameStart && social.onGameStart(g); location.hash = '#/game'; emit(); }
export async function leaveGame() {
  const g = social.game; if (!g) return;
  const ch = pairs.get(g.fp); if (ch && !g.ended) await ch.send('game_leave', { id: g.id });
  social.onGameLeave && social.onGameLeave(g); social.game = null; broadcastStatus(); emit();
}
function broadcastStatus() { for (const ch of pairs.values()) ch.send('status', { playing: !!social.game }); }

// ---- boîte aux lettres (pseudo) : réception des demandes ---------------------------------------
async function startInbox() {
  stopInbox();
  const l = await lease(L.inboxSecret(social.me.name), 'inbox'); inboxLease = l;
  inboxOff = l.ch.on(async ev => {
    if (ev.kind !== 'message' || !FRIEND_MSGS.includes(ev.type) || !ev.from.fp) return;
    await commit(L.receive(social.state, ev.type, { fp: ev.from.fp, pub: ev.from.pub, name: ev.from.name }));
    l.ch.send('ack', { id: (ev.data || {}).id }, ev.id);
  });
}
function stopInbox() { if (inboxOff) inboxOff(); if (inboxLease) inboxLease.release(); inboxOff = inboxLease = null; }
export async function onRenamed() { await startInbox(); for (const ch of pairs.values()) ch.send('profile', { name: social.me.name }); }

// ---- file d'envoi hors ligne ---------------------------------------------------------------------
async function saveOutbox() { await kvSet('outbox', social.outbox); }
async function enqueue(to, type) {
  social.outbox = social.outbox.filter(i => !(i.to.fp === to.fp && FRIEND_MSGS.includes(i.type)));   // le dernier message prime
  social.outbox.push({ id: rid(), to, type, at: Date.now() }); await saveOutbox(); kick();
}
function expireOutbox() { const lim = Date.now() - 30 * 864e5; social.outbox = social.outbox.filter(i => i.at > lim); }
export const _retryNow = () => kick();   // tests
export const pendingDelivery = fp => social.outbox.some(i => i.to.fp === fp);
function kick() {
  for (const sec of new Set(social.outbox.map(i => L.inboxSecret(i.to.name)))) if (!attempts.has(sec)) attempt(sec);
}
// Une tentative par salon : on y livre tout ce qui est destiné aux personnes qui s'y trouvent, jusqu'à accusé de réception.
async function attempt(secret) {
  attempts.set(secret, true);
  let l = null, off = null, t = null;
  const finish = () => { clearTimeout(t); if (off) off(); if (l) l.release(); attempts.delete(secret); emit(); };
  try {
    l = await lease(secret, 'send:' + secret);
    const mine = () => social.outbox.filter(i => L.inboxSecret(i.to.name) === secret);
    const deliver = () => { for (const p of l.ch.list()) if (p.status === 'verified') for (const i of mine()) if (i.to.fp === p.fp) l.ch.send(i.type, { id: i.id }, p.id); };
    off = l.ch.on(async ev => {
      if (ev.kind === 'verified') deliver();
      if (ev.kind === 'message' && ev.type === 'ack') {
        const id = (ev.data || {}).id, it = social.outbox.find(i => i.id === id);
        if (it && it.to.fp === ev.from.fp) { social.outbox = social.outbox.filter(i => i.id !== id); await saveOutbox(); emit(); }
        if (!mine().length) finish();
      }
    });
    t = setTimeout(finish, 25000); deliver();
  } catch { finish(); }          // jamais de blocage définitif : la prochaine échéance réessaie
}

// ---- recherche par pseudo --------------------------------------------------------------------------
export async function startSearch(rawName) {
  const name = rawName.trim(); if (!name) return;
  stopSearch(); const my = ++searchToken;
  social.search = { name, status: 'searching', candidates: [] }; emit();
  const l = await lease(L.inboxSecret(name), 'search');
  if (my !== searchToken) return l.release();                 // une autre recherche a pris la place entre-temps
  searchLease = l;
  const pull = () => { if (!social.search) return; social.search.candidates = l.ch.list().filter(p => p.status === 'verified' && p.pub).map(p => ({ fp: p.fp, pub: p.pub, name: p.name })); emit(); };
  searchOff = l.ch.on(pull); pull();
  searchTimer = setTimeout(() => { pull(); if (social.search) social.search.status = 'done'; releaseSearch(); emit(); }, 15000);
}
function releaseSearch() { clearTimeout(searchTimer); if (searchOff) searchOff(); if (searchLease) searchLease.release(); searchOff = searchLease = null; }
export function stopSearch() { searchToken++; releaseSearch(); social.search = null; emit(); }
