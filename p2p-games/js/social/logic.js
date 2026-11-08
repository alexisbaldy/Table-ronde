// Logique pure du système d'amis (aucun réseau, aucun stockage) : testable sous Node.
// state = { [fp]: {fp, pub, name, alias?, status: 'friend'|'pending_in'|'pending_out', at} }
// Chaque fonction renvoie { state, effects, error } ; effects = {kind:'send',to,type} | {kind:'toast',text}.
export const NORM = n => String(n).normalize('NFC').trim().toLowerCase();
export const inboxSecret = n => 'inbox:' + NORM(n);                           // « boîte aux lettres » liée à un pseudo
export const pairSecret = (a, b) => 'pair:' + [a, b].sort().join(':');       // salon privé d'une paire d'amis
export const MAX_PENDING_IN = 50;

const clean = s => String(s || '?').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) || '?';
const ref = r => ({ fp: r.fp, pub: r.pub, name: r.name });
const clone = st => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { ...v }]));
const send = (r, type) => ({ kind: 'send', to: ref(r), type });
const say = text => ({ kind: 'toast', text });
const out = (state, effects = [], error = null) => ({ state, effects, error });
const count = (st, status) => Object.values(st).filter(r => r.status === status).length;

export function requestFriend(state, target, meFp) {
  if (!target || !target.fp || !target.pub) return out(state, [], 'Identité invalide.');
  if (target.fp === meFp) return out(state, [], 'C\'est ton propre profil.');
  const cur = state[target.fp];
  if (cur?.status === 'friend') return out(state, [], `${cur.name} est déjà dans tes amis.`);
  if (cur?.status === 'pending_out') return out(state, [], 'Demande déjà envoyée.');
  if (cur?.status === 'pending_in') return accept(state, target.fp);        // demandes croisées = amitié
  const s = clone(state); s[target.fp] = { fp: target.fp, pub: target.pub, name: clean(target.name), status: 'pending_out', at: Date.now() };
  return out(s, [send(s[target.fp], 'friend_request'), say(`Demande envoyée à ${s[target.fp].name}`)]);
}
export function accept(state, fp) {
  const cur = state[fp]; if (!cur || cur.status !== 'pending_in') return out(state, [], 'Demande introuvable.');
  const s = clone(state); s[fp].status = 'friend';
  return out(s, [send(cur, 'friend_accept'), say(`${cur.name} est maintenant ton ami`)]);
}
export function decline(state, fp) {
  const cur = state[fp]; if (!cur || cur.status !== 'pending_in') return out(state, [], 'Demande introuvable.');
  const s = clone(state); delete s[fp]; return out(s, [send(cur, 'friend_decline')]);
}
export function cancel(state, fp) {
  const cur = state[fp]; if (!cur || cur.status !== 'pending_out') return out(state, [], 'Demande introuvable.');
  const s = clone(state); delete s[fp]; return out(s, [send(cur, 'friend_remove')]);
}
export function removeFriend(state, fp) {
  const cur = state[fp]; if (!cur || cur.status !== 'friend') return out(state, [], 'Ami introuvable.');
  const s = clone(state); delete s[fp]; return out(s, [send(cur, 'friend_remove'), say(`${cur.name} a été retiré de tes amis`)]);
}
export function setAlias(state, fp, alias) {
  if (!state[fp]) return out(state); const s = clone(state); const a = clean(alias).trim();
  if (alias && a !== '?') s[fp].alias = a; else delete s[fp].alias; return out(s);
}
export function updateName(state, fp, name) {
  if (state[fp]?.status !== 'friend' || state[fp].name === clean(name)) return out(state);
  const s = clone(state); s[fp].name = clean(name); return out(s);
}
// Message reçu d'une personne dont l'identité est DÉJÀ prouvée par la poignée de main signée.
export function receive(state, type, from) {
  if (!from || !from.fp || !from.pub) return out(state);
  const cur = state[from.fp], name = clean(from.name);
  if (type === 'friend_request') {
    if (cur?.status === 'friend') return out(state, [send(cur, 'friend_accept')]);          // il a perdu sa liste : on confirme
    if (cur?.status === 'pending_out') { const s = clone(state); Object.assign(s[from.fp], { status: 'friend', name }); return out(s, [send(s[from.fp], 'friend_accept'), say(`${name} est maintenant ton ami`)]); }
    if (cur?.status === 'pending_in') return out(state);
    if (count(state, 'pending_in') >= MAX_PENDING_IN) return out(state);                    // anti-spam
    const s = clone(state); s[from.fp] = { fp: from.fp, pub: from.pub, name, status: 'pending_in', at: Date.now() };
    return out(s, [say(`${name} veut t'ajouter en ami`)]);
  }
  if (type === 'friend_accept' && cur?.status === 'pending_out') { const s = clone(state); Object.assign(s[from.fp], { status: 'friend', name }); return out(s, [say(`${name} a accepté ta demande`)]); }
  if (type === 'friend_decline' && cur?.status === 'pending_out') { const s = clone(state); delete s[from.fp]; return out(s, [say(`${cur.name} a décliné ta demande`)]); }
  if (type === 'friend_remove' && cur) { const s = clone(state); delete s[from.fp]; return out(s, cur.status === 'friend' ? [say(`${cur.name} t'a retiré de ses amis`)] : []); }
  return out(state);
}
