// Lancer : node tests/protocol.test.mjs
import { Session } from '../js/net/protocol.js';
import { generateIdentityKeys, fingerprint } from '../js/core/crypto.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC'), m); if (!c) fails++; };
const mk = async name => { const k = await generateIdentityKeys(); return { name, ...k, fp: await fingerprint(k.pubRaw) }; };
const tick = () => new Promise(r => setTimeout(r, 20));
function pair(a, b, optsA = {}, optsB = {}) {
  const log = { a: [], b: [], wireA: [], wireB: [] }; let A, B;
  A = new Session({ me: a, send: r => { log.wireA.push(r); B.receive(r); }, onVerified: p => log.a.push(['v', p.name]), onMessage: (t, d) => log.a.push([t, d]), onReject: r => log.a.push(['rej', r]), ...optsA });
  B = new Session({ me: b, send: r => { log.wireB.push(r); A.receive(r); }, onVerified: p => log.b.push(['v', p.name]), onMessage: (t, d) => log.b.push([t, d]), onReject: r => log.b.push(['rej', r]), ...optsB });
  return { A, B, log };
}
const [alice, bob, mallory] = [await mk('Alexis'), await mk('Bob'), await mk('Alexis')]; // Mallory usurpe le pseudo
{ // 1. poignée de main + échange
  const { A, B, log } = pair(alice, bob); A.start(); B.start(); await tick();
  ok(A.state === 'verified' && B.state === 'verified', 'poignée de main mutuelle vérifiée');
  await A.sendMsg('move', { san: 'e4' }); await tick();
  ok(JSON.stringify(log.b.at(-1)) === '["move",{"san":"e4"}]', 'message signé reçu et accepté');
  // 2. rejeu d'un message déjà vu
  const last = log.wireA.at(-1); await B.receive(last); await tick();
  ok(B.state === 'rejected', 'rejeu d\'un ancien message refusé');
}
{ // 3. falsification du contenu
  const { A, B } = pair(alice, bob); A.start(); B.start(); await tick();
  let captured; A.send = r => { captured = r; }; await A.sendMsg('move', { san: 'e4' });
  const m = JSON.parse(captured); m.body = m.body.replace('e4', 'Qh5'); await B.receive(JSON.stringify(m)); await tick();
  ok(B.state === 'rejected', 'message modifié en transit refusé');
}
{ // 4. usurpation : Mallory prétend être l'ami attendu (clé d'Alice) mais a une autre clé
  const { A, B, log } = pair(mallory, bob, {}, { expectedFp: alice.fp }); A.start(); B.start(); await tick();
  ok(B.state === 'rejected' && !log.b.some(e => e[0] === 'v'), 'faux « Alexis » (autre clé) refusé par l\'ami attendu');
}
{ // 5. preuve de clé : un attaquant qui envoie la clé publique d'Alice sans pouvoir signer
  const { B, log } = pair(mallory, bob);
  await B.receive(JSON.stringify({ k: 'hello', pub: alice.pubRaw, name: 'Alexis', nonce: 'x' }));
  await B.receive(JSON.stringify({ k: 'auth', sig: 'AAAA' })); await tick();
  ok(B.state === 'rejected', 'clé publique copiée sans clé privée : preuve invalide');
}
{ // 6. rejeu d'une réponse auth d'une ancienne session
  const s1 = pair(alice, bob); s1.A.start(); s1.B.start(); await tick();
  const oldAuth = s1.log.wireA.find(r => JSON.parse(r).k === 'auth');
  const s2 = pair(mallory, bob); await s2.B.receive(JSON.stringify({ k: 'hello', pub: alice.pubRaw, name: 'Alexis', nonce: 'y' }));
  await s2.B.receive(oldAuth); await tick();
  ok(s2.B.state === 'rejected', 'réponse d\'une ancienne session rejouée : refusée (défi différent)');
}
{ // 7. aucun message accepté avant authentification
  const { B } = pair(alice, bob); let got = false; B.onMessage = () => got = true;
  await B.receive(JSON.stringify({ k: 'msg', body: '{}', sig: 'x' })); ok(!got, 'message avant hello ignoré');
}
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent'); process.exit(fails ? 1 : 0);
