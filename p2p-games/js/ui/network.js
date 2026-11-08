import { esc, toast } from './util.js';
import { badge } from '../core/identity.js';
import { testNet, joinTest, leaveTest, sayTest, getRecent, removeRecent } from '../net/manager.js';

const LABEL = { connecting: 'connexion…', verified: 'connecté · identité vérifiée', stale: 'connexion instable', rejected: 'refusé' };

const peersHtml = () => {
  const ch = testNet.channel, l = ch ? ch.list() : [], own = ch ? ch.ownWindows() : 0;
  const rows = l.length ? l.map(p => { const b = p.fp ? badge(p.fp) : { color: '#666', tag: '' };
    return `<div class="row" style="padding:.35rem 0"><span class="dot" style="background:${b.color}"></span><strong>${esc(p.name)}</strong>
    <span class="badge">${b.tag} · ${LABEL[p.status]}${p.windows > 1 ? ` · ${p.windows} fenêtres` : ''}${p.reason && p.status === 'rejected' ? ' : ' + esc(p.reason) : ''}</span></div>`; }).join('')
    : '<div class="empty">Personne d\'autre dans le salon pour l\'instant.</div>';
  return rows + (own ? `<p class="muted" style="margin:.6rem 0 0;font-size:.85rem">Une autre fenêtre avec ton propre profil est ouverte (ignorée).</p>` : '');
};
const diagHtml = () => {
  const ch = testNet.channel; if (!ch) return '<span class="muted">Salon fermé.</span>';
  const rs = ch.relayStatus(), open = rs.reduce((a, r) => a + r.open, 0), total = rs.reduce((a, r) => a + r.total, 0);
  const waited = (Date.now() - ch.openedAt) / 1000, none = ch.list().length === 0;
  let hint = '';
  if (open === 0 && waited > 6) hint = 'Aucun serveur de rencontre joignable : vérifie ta connexion, un pare-feu, un VPN ou un bloqueur qui coupe les WebSocket.';
  else if (none && waited > 25) hint = 'Les serveurs répondent mais aucune connexion directe ne se fait : vérifie que le code est identique ; sur des réseaux différents (4G, entreprise) un serveur TURN est probablement nécessaire (Réglages).';
  return `<span class="muted">Serveurs de rencontre joignables : <strong>${open}/${total}</strong> (${rs.map(r => `${r.name} ${r.open}/${r.total}`).join(', ')})</span>${hint ? `<p class="err" style="margin-top:.5rem">${hint}</p>` : ''}`;
};
const logHtml = () => testNet.log.length ? testNet.log.map(e => e.kind === 'sys'
  ? `<div class="sys">${esc(e.text)}</div>`
  : `<div class="msg ${e.kind}">${e.kind === 'peer' ? `<span class="who">${esc(e.who)}</span>` : ''}${esc(e.text)}</div>`).join('') : '<div class="sys">Aucun message pour l\'instant.</div>';
const chipsHtml = list => list.length ? `<div class="chips">${list.map(c => `<span class="chip"><button data-code="${esc(c)}">${esc(c)}</button><button data-del="${esc(c)}" aria-label="Oublier ${esc(c)}">×</button></span>`).join('')}</div>` : '';

export async function render() {
  const open = !!testNet.channel, recent = await getRecent();
  return `<h1>Réseau</h1>
  <p class="muted">Test de connexion directe entre ordinateurs. Convenez d'un code commun (par exemple « pizza42 ») et entrez-le de chaque côté.</p>
  <div class="cols"><div>
    <div class="panel"><label for="code">Code du salon</label>
      <div class="row"><input id="code" maxlength="40" autocomplete="off" ${open ? 'disabled' : ''}><button id="go" class="primary">${open ? 'Quitter le salon' : 'Rejoindre'}</button></div>
      <div id="chips">${chipsHtml(recent)}</div></div>
    <div class="panel"><h2>Joueurs dans le salon</h2><div id="peers">${peersHtml()}</div><div id="diag" style="margin-top:.8rem">${diagHtml()}</div></div>
  </div>
  <div class="panel chat"><h2>Messages</h2><div id="log" class="chatlog">${logHtml()}</div>
    <div class="row"><input id="msg" maxlength="200" placeholder="Écris quelque chose"><button id="send">Envoyer</button></div></div></div>`;
}
export function bind(root, ctx) {
  const $ = s => root.querySelector(s), code = $('#code'), log = $('#log');
  if (testNet.channel) code.value = testNet.channel.code;
  log.scrollTop = log.scrollHeight;
  const refresh = () => {
    if (!root.isConnected) { testNet.subs.delete(refresh); clearInterval(poll); return; }
    $('#peers').innerHTML = peersHtml(); $('#diag').innerHTML = diagHtml();
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = logHtml(); if (stick) log.scrollTop = log.scrollHeight;
  };
  testNet.subs.add(refresh); const poll = setInterval(refresh, 2000);

  const join = async value => {
    try { await joinTest(ctx.me, value); ctx.show(); } catch (e) { toast(e.message); }
  };
  $('#go').onclick = () => { if (testNet.channel) { leaveTest(); ctx.show(); } else join(code.value); };
  code.onkeydown = e => { if (e.key === 'Enter' && !testNet.channel) join(code.value); };
  $('#chips').onclick = async e => {
    const c = e.target.closest('button'); if (!c) return;
    if (c.dataset.del) { await removeRecent(c.dataset.del); $('#chips').innerHTML = chipsHtml(await getRecent()); }
    else if (c.dataset.code) join(c.dataset.code);
  };
  const send = async () => {
    const i = $('#msg'); if (!i.value.trim()) return;
    if (!testNet.channel) return toast('Rejoins d\'abord un salon');
    await sayTest(i.value.trim()); i.value = ''; log.scrollTop = log.scrollHeight;
  };
  $('#send').onclick = send; $('#msg').onkeydown = e => { if (e.key === 'Enter') send(); };
}
