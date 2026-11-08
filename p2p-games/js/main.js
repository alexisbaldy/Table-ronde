import { loadIdentity, badge } from './core/identity.js';
import { esc, toast } from './ui/util.js';
import { social, startSocial, friendsOf } from './social/social.js';
import * as onboarding from './ui/onboarding.js';
import * as home from './ui/home.js';
import * as friends from './ui/friends.js';
import * as games from './ui/games.js';
import * as network from './ui/network.js';
import * as settings from './ui/settings.js';
import * as add from './ui/add.js';
import * as game from './ui/game.js';

const app = document.getElementById('app');
const ROUTES = { '/': home, '/friends': friends, '/games': games, '/network': network, '/settings': settings, '/add': add, '/game': game };
const NAV = [['/', 'Accueil'], ['/friends', 'Amis'], ['/games', 'Jeux'], ['/network', 'Réseau'], ['/settings', 'Réglages']];
const meHtml = () => { const b = badge(ctx.me.fp); return `<span class="dot" style="background:${b.color}"></span>${esc(ctx.me.name)}`; };
const ctx = {
  me: null,
  setMe(m) { ctx.me = m; startSocial(m); },
  navigate(p) { location.hash = '#' + p; },
  show,
  refreshShell() { const m = document.getElementById('me'); if (m) m.innerHTML = meHtml(); },
};
const path = () => location.hash.slice(1).split('?')[0] || '/';
const count = h => h === '/' ? social.invites.length : h === '/friends' ? friendsOf('pending_in').length : 0;
const navHtml = cur => NAV.map(([h, l]) => `<a href="#${h}" ${h === cur ? 'aria-current="page"' : ''}>${l}${count(h) ? `<span class="count">${count(h)}</span>` : ''}</a>`).join('');
let token = 0;

async function show() {
  if (!ctx.me) { app.innerHTML = onboarding.render(); onboarding.bind(app, ctx); return; }
  const my = ++token, p = path(), view = ROUTES[p] || home, cur = ROUTES[p] ? p : '/';
  if (!document.getElementById('main')) app.innerHTML = `<div class="shell"><nav><div class="brand">Table ronde</div><div id="links"></div><div class="me" id="me">${meHtml()}</div></nav><main id="main"></main></div>`;
  document.getElementById('links').innerHTML = navHtml(cur);
  const html = await view.render(ctx); if (my !== token) return;
  const main = document.getElementById('main'); main.innerHTML = html; main.dataset.route = cur;
  if (view.bind) view.bind(main, ctx);
}
let t;
social.subs.add(() => {
  if (!ctx.me) return; clearTimeout(t);
  t = setTimeout(async () => {
    const main = document.getElementById('main'); if (!main) return;
    const cur = main.dataset.route, view = ROUTES[cur];
    document.getElementById('links').innerHTML = navHtml(cur);
    if (view && view.live === 'full') show();                                                // pages sans saisie : on redessine
    else if (cur === '/friends') { const l = main.querySelector('#live'); if (l) l.innerHTML = friends.renderLive(); }   // la saisie n'est jamais écrasée
  }, 120);
});
social.toasts.add(toast);
window.addEventListener('hashchange', show);
(async () => {
  if (!window.isSecureContext || !crypto.subtle) { app.innerHTML = '<div class="onboard"><p>Ouvre l\'application via http://localhost:8080 (start.bat) ou en HTTPS.</p></div>'; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // demande au navigateur de ne pas effacer l'identité
  ctx.me = await loadIdentity();
  if (ctx.me) startSocial(ctx.me);
  show();
})();
