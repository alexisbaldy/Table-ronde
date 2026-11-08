// Stockage local IndexedDB : kv (profil, clés, préférences), friends, games (historique).
const NAME = 'table-ronde', VERSION = 1;
let dbp;
const open = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open(NAME, VERSION);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore('kv');
    d.createObjectStore('friends', { keyPath: 'fp' });
    d.createObjectStore('games', { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function run(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const kvGet = k => run('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => run('kv', 'readwrite', s => s.put(v, k));
export const getAll = store => run(store, 'readonly', s => s.getAll());
export const put = (store, v) => run(store, 'readwrite', s => s.put(v));
export const remove = (store, k) => run(store, 'readwrite', s => s.delete(k));
