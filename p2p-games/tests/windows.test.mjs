// Lancer : node tests/windows.test.mjs
// Cas réel : Bob ouvre le site dans 2 fenêtres (même profil). Alice doit le voir UNE fois, et Bob ne doit pas voir d'erreur.
globalThis.RTCPeerConnection = class {};
const { Channel } = await import('../js/net/channel.js');
const { generateIdentityKeys, fingerprint } = await import('../js/core/crypto.js');
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK   ' : 'ECHEC', m); if (!c) fails++; };
const mk = async n => { const k = await generateIdentityKeys(); return { name: n, ...k, fp: await fingerprint(k.pubRaw) }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const rooms = {};
const strat = id => [{ name: 't', sockets: () => ({}), join: () => { const room = { id, onPeerJoin: null, onPeerLeave: null, leave: async () => {},
  makeAction() { const a = { onMessage: null, send: async (raw, { target }) => { const d = rooms[target]; if (d) setTimeout(() => d.act.onMessage && d.act.onMessage(raw, { peerId: id }), 1); } }; room.act = a; return a; } }; rooms[id] = room; return room; } }];
const link = (x, y) => { rooms[x].onPeerJoin(y); rooms[y].onPeerJoin(x); };
const [alice, bob] = [await mk('Alice'), await mk('Bob')];
const A = new Channel({ me: alice, secret: 's', ice: [], strategies: strat('A') });
const B1 = new Channel({ me: bob, secret: 's', ice: [], strategies: strat('B1') });
const B2 = new Channel({ me: bob, secret: 's', ice: [], strategies: strat('B2') });
for (const c of [A, B1, B2]) await c.open();
link('A', 'B1'); link('A', 'B2'); link('B1', 'B2'); await wait(400);
ok(A.list().length === 1 && A.list()[0].name === 'Bob' && A.list()[0].windows === 2, 'Alice voit Bob une seule fois (2 fenêtres)');
ok(B1.list().length === 1 && B1.list()[0].name === 'Alice', 'Bob (fenêtre 1) ne voit qu\'Alice, pas d\'erreur « soi-même »');
ok(B1.ownWindows() === 1 && B2.ownWindows() === 1, 'l\'autre fenêtre de Bob est détectée et masquée');
ok(!B1.list().some(p => p.status === 'rejected'), 'aucune ligne « refusé »');
const got = []; A.on(e => e.kind === 'message' && got.push(e.data)); await B1.send('chat', 'coucou'); await wait(50);
ok(got.includes('coucou'), 'les messages passent toujours');
[A, B1, B2].forEach(c => c.close());
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent'); process.exit(fails ? 1 : 0);
