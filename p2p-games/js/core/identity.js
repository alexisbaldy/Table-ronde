// Profil local : pseudo (nom d'affichage) + clé cryptographique (identité réelle).
import { kvGet, kvSet } from './db.js';
import { generateIdentityKeys, fingerprint } from './crypto.js';

export const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export function validateName(raw) {
  const name = (raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 1) return { ok: false, error: 'Saisis un pseudo.' };
  if (name.length > 24) return { ok: false, error: '24 caractères maximum.' };
  if (/[\u0000-\u001f<>]/.test(name)) return { ok: false, error: 'Caractères non autorisés (< > ou contrôle).' };
  return { ok: true, name };
}
// Pastille dérivée de la clé : sépare deux amis qui portent le même pseudo.
export function badge(fp) {
  let h = 0; for (const c of fp) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { color: `hsl(${h} 70% 62%)`, tag: fp.slice(0, 3).toUpperCase() };
}
export async function loadIdentity() {
  const [name, keys, createdAt] = await Promise.all([kvGet('name'), kvGet('keys'), kvGet('createdAt')]);
  if (!name || !keys) return null;
  return { name, createdAt, privateKey: keys.privateKey, pubRaw: keys.pubRaw, fp: await fingerprint(keys.pubRaw) };
}
export async function createProfile(rawName) {
  const v = validateName(rawName); if (!v.ok) throw new Error(v.error);
  const keys = await generateIdentityKeys();
  await kvSet('keys', keys); await kvSet('createdAt', Date.now()); await kvSet('name', v.name);
  return loadIdentity();
}
export async function renameProfile(rawName) {
  const v = validateName(rawName); if (!v.ok) throw new Error(v.error);
  await kvSet('name', v.name); return v.name;
}
export async function getPrefs() { return { ice: DEFAULT_ICE, ...(await kvGet('prefs') || {}) }; }
export async function setPrefs(p) { await kvSet('prefs', p); }
// Lien d'invitation : contient la clé publique, donc ajoute à coup sûr la bonne personne.
export const inviteLink = me => `${location.origin}${location.pathname}#/add?k=${me.pubRaw}&n=${encodeURIComponent(me.name)}`;
