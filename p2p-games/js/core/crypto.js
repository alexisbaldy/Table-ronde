// Primitives cryptographiques (WebCrypto natif, aucune dépendance).
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// La clé privée est ré-importée NON EXTRACTIBLE : un script ne peut pas la lire, seulement signer.
export async function generateIdentityKeys() {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const pubRaw = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ALG, false, ['sign']);
  return { privateKey, pubRaw };
}
// Identité réelle = empreinte SHA-256 de la clé publique (22 caractères).
export async function fingerprint(pubRaw) {
  return b64u(await crypto.subtle.digest('SHA-256', unb64u(pubRaw))).slice(0, 22);
}
export async function sign(privateKey, text) {
  return b64u(await crypto.subtle.sign(SIGN, privateKey, enc.encode(text)));
}
export async function verify(pubRaw, text, sigB64) {
  try {
    const key = await crypto.subtle.importKey('raw', unb64u(pubRaw), ALG, false, ['verify']);
    return await crypto.subtle.verify(SIGN, key, unb64u(sigB64), enc.encode(text));
  } catch { return false; }
}
