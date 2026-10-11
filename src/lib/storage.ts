import type { AlbumEntry, SavedSticker } from '../types';

const DB_NAME = 'lovebug-booth-local';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local albums.'));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('strips')) db.createObjectStore('strips', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('stickers')) db.createObjectStore('stickers', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
  });
}

async function withStore<T>(name: string, mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = act(tx.objectStore(name));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => { /* transaction abort will reject below */ };
    tx.onerror = () => { /* onabort is the single rejection path */ };
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Storage transaction failed.')); };
  });
}

export const saveStrip = (entry: AlbumEntry) => withStore('strips', 'readwrite', store => store.put(entry));
export const listStrips = () => withStore<AlbumEntry[]>('strips', 'readonly', store => store.getAll());
export const deleteStrip = (id: string) => withStore('strips', 'readwrite', store => store.delete(id));
export const saveCustomSticker = (item: SavedSticker) => withStore('stickers', 'readwrite', store => store.put(item));
export const listCustomStickers = () => withStore<SavedSticker[]>('stickers', 'readonly', store => store.getAll());
export const deleteCustomSticker = (id: string) => withStore('stickers', 'readwrite', store => store.delete(id));

export async function dataUrlToBlob(url: string): Promise<Blob> { return (await fetch(url)).blob(); }
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
