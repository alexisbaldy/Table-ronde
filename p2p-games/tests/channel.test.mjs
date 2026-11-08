// Lancer : node tests/channel.test.mjs   (simule deux joueurs reliés par DEUX voies, sans réseau)
globalThis.RTCPeerConnection = class {};
const { Channel } = await import('../js/net/channel.js');
const { generateIdentityKeys, fingerprint } = await import('../js/core/crypto.js');
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK   ' : 'ECHEC', m); if (!c) fails++; };
const mk = async n => { const k = await generateIdentityKeys(); return { name: n, ...k, fp: await fingerprint(k.pubRaw) }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Faux « Trystero » : un bus par voie, deux pairs A et B.
function makeBus() {
  const rooms = {};
  const join = id => (cfg, roomId) => {
    const room = { actions: {}, onPeerJoin: null, onPeerLeave: null, id, leave: async () => { delete rooms[id]; Object.values(rooms).forEach(r => r.onPeerLeave && r.onPeerLeave(id)); },
      makeAction(ns) { const a = { onMessage: null, send: async (raw, { target }) => { const dst = rooms[target]; if (dst) setTimeout(() => dst.act.onMessage && dst.act.onMessage(raw, { peerId: id }), 1); } }; room.act = a; return a; } };
    rooms[id] = room; return room;
  };
  return { join, connect: () => { const [a, b] = Object.values(rooms); setTimeout(() => { a.onPeerJoin && a.onPeerJoin(b.id); b.onPeerJoin && b.onPeerJoin(a.id); }, 1); }, rooms };
}
const [A, B] = [await mk('Alice'), await mk('Bob')];
const busT = makeBus(), busN = makeBus();
const strat = (bus, id, name) => [{ name, join: bus.join(id), sockets: () => ({}) }];
// A et B : même salon, 2 voies simulées. Chaque voie a ses propres pairs 'A' et 'B'.
const stratsFor = id => [{ name: 'torrent', join: busT.join(id), sockets: () => ({}) }, { name: 'nostr', join: busN.join(id), sockets: () => ({}) }];
const chA = new Channel({ me: A, secret: 'x', ice: [], strategies: stratsFor('A') });
const chB = new Channel({ me: B, secret: 'x', ice: [], strategies: stratsFor('B') });
const got = []; chB.on(e => e.kind === 'message' && got.push(e.data));
await chA.open(); await chB.open();
busT.connect(); await wait(30); busN.connect(); await wait(300);   // le même pair arrive par les deux voies
ok(chA.list().length === 1 && chB.list().length === 1, 'un seul pair malgré deux voies de rencontre');
ok(chA.list()[0]?.status === 'verified' && chB.list()[0]?.status === 'verified', 'identité vérifiée des deux côtés');
await chA.send('chat', 'salut'); await wait(50);
ok(got.includes('salut'), 'message reçu');
// La voie principale tombe : bascule transparente sur l'autre
const ownerA = chA.peers.get('B').rec;
const ownerB = chB.peers.get('A').rec;
await ownerA.room.leave?.call({ ...ownerA.room, id: 'A' });
ownerA.room.onPeerLeave && ownerA.room.onPeerLeave('B');
await wait(20);
ok(chA.list().length === 1, 'bascule sur la voie de secours sans perdre le pair');
await chA.send('chat', 'encore là'); await wait(50);
ok(got.includes('encore là'), 'message reçu après bascule');
chA.close(); chB.close();
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent'); process.exit(fails ? 1 : 0);
