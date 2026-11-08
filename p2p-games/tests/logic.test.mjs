// Lancer : node tests/logic.test.mjs
import * as L from '../js/social/logic.js';
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK   ' : 'ECHEC', m); if (!c) fails++; };
const A = { fp: 'fpA', pub: 'pubA', name: 'Alice' }, B = { fp: 'fpB', pub: 'pubB', name: 'Bob' };
// Scénario complet : Alice demande, Bob reçoit et accepte, Alice reçoit l'acceptation
let a = {}, b = {}, r;
r = L.requestFriend(a, B, 'fpA'); a = r.state;
ok(a.fpB?.status === 'pending_out' && r.effects.some(e => e.kind === 'send' && e.type === 'friend_request' && e.to.fp === 'fpB'), 'demande envoyée → en attente + message à livrer');
r = L.receive(b, 'friend_request', A); b = r.state;
ok(b.fpA?.status === 'pending_in', 'Bob reçoit la demande');
r = L.accept(b, 'fpA'); b = r.state;
ok(b.fpA.status === 'friend' && r.effects.some(e => e.type === 'friend_accept'), 'Bob accepte');
r = L.receive(a, 'friend_accept', B); a = r.state;
ok(a.fpB.status === 'friend', 'Alice devient amie de Bob après l\'acceptation');
// Cas limites
ok(L.requestFriend({}, A, 'fpA').error, 'impossible de s\'ajouter soi-même');
ok(L.requestFriend(a, B, 'fpA').error, 'déjà ami : refusé');
ok(L.requestFriend(L.requestFriend({}, B, 'fpA').state, B, 'fpA').error, 'demande en double refusée');
// Demandes croisées
r = L.requestFriend(L.receive({}, 'friend_request', B).state, B, 'fpA');
ok(r.state.fpB.status === 'friend', 'demandes croisées → amitié directe');
r = L.receive(L.requestFriend({}, B, 'fpA').state, 'friend_request', B);
ok(r.state.fpB.status === 'friend' && r.effects.some(e => e.type === 'friend_accept'), 'il me demande alors que je lui ai demandé : amis + accord renvoyé');
// Sécurité : un acceptation non sollicitée ne crée pas d'ami
ok(Object.keys(L.receive({}, 'friend_accept', B).state).length === 0, 'acceptation jamais demandée : ignorée');
ok(L.receive({}, 'friend_remove', B).state.fpB === undefined, 'retrait d\'un inconnu : sans effet');
// Refus, annulation, retrait
r = L.decline(L.receive({}, 'friend_request', A).state, 'fpA'); ok(!r.state.fpA && r.effects[0].type === 'friend_decline', 'refus : supprimé + prévenu');
ok(L.receive(L.requestFriend({}, B, 'fpA').state, 'friend_decline', B).state.fpB === undefined, 'refus reçu : demande retirée');
ok(!L.removeFriend(a, 'fpB').state.fpB && L.receive(a, 'friend_remove', B).state.fpB === undefined, 'suppression des deux côtés');
// Anti-spam
let flood = {}; for (let i = 0; i < 60; i++) flood = L.receive(flood, 'friend_request', { fp: 'x' + i, pub: 'p', name: 'X' + i }).state;
ok(Object.keys(flood).length === L.MAX_PENDING_IN, 'plafond de 50 demandes reçues');
// Nom nettoyé, alias, renommage de l'ami
ok(L.receive({}, 'friend_request', { fp: 'z', pub: 'p', name: '<b>' + 'x'.repeat(40) }).state.z.name.length <= 24, 'pseudo reçu nettoyé et tronqué');
ok(L.updateName(a, 'fpB', 'Robert').state.fpB.name === 'Robert' && L.setAlias(a, 'fpB', 'Bob (collègue)').state.fpB.alias === 'Bob (collègue)', 'renommage reçu + alias local');
ok(L.pairSecret('x', 'y') === L.pairSecret('y', 'x') && L.inboxSecret('  ALEXIS ') === L.inboxSecret('alexis'), 'salon de paire symétrique, pseudo normalisé');
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent'); process.exit(fails ? 1 : 0);
