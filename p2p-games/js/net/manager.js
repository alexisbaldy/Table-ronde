// Singleton : le salon de test survit à la navigation entre pages.
import { Channel } from './channel.js';
import { getPrefs } from '../core/identity.js';
import { kvGet, kvSet } from '../core/db.js';

export const testNet = { channel: null, log: [], subs: new Set() };
const poke = () => testNet.subs.forEach(f => f());
const note = (text, kind = 'sys', who = '') => { testNet.log.push({ t: new Date(), text, kind, who }); if (testNet.log.length > 200) testNet.log.shift(); poke(); };

// Codes de salon mémorisés (8 derniers, le plus récent d'abord).
export const getRecent = async () => (await kvGet('recentRooms')) || [];
export async function addRecent(code) { const l = [code, ...(await getRecent()).filter(c => c !== code)].slice(0, 8); await kvSet('recentRooms', l); return l; }
export async function removeRecent(code) { const l = (await getRecent()).filter(c => c !== code); await kvSet('recentRooms', l); return l; }

export async function joinTest(me, rawCode) {
  const code = rawCode.trim(); if (!code) throw new Error('Saisis un code de salon');
  leaveTest(true);
  const ch = new Channel({ me, secret: 'test:' + code, ice: (await getPrefs()).ice });
  ch.code = code;
  ch.on(ev => {
    if (ev.kind === 'message' && ev.type === 'chat') note(String(ev.data).slice(0, 500), 'peer', ev.from.name);
    if (ev.kind === 'verified') note(`${ev.peer.name} a rejoint le salon`);
    if (ev.kind === 'rejoined') note('Connexion perdue : nouvelle tentative');
    poke();
  });
  testNet.channel = ch; await ch.open(); await addRecent(code);
  note(`Salon « ${code} » ouvert, en attente des autres joueurs…`);
}
export function leaveTest(silent = false) { if (testNet.channel) { testNet.channel.close(); testNet.channel = null; if (!silent) note('Salon quitté'); } }
export async function sayTest(text) { note(text, 'me'); await testNet.channel.send('chat', text); }
