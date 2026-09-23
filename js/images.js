/* Card pictures. They live in IndexedDB, which has room for them, while the
   cards in localStorage keep only their ids. A picture is shrunk before it
   is kept, so a set of photos stays small. */

import { el } from './dom.js';
import { uid, toBase64, fromBase64 } from './util.js';

const DB_NAME = 'quizzer';
const STORE = 'images';
const MAX_SIDE = 800;
const KEEP_AS_IS = 200 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
/* A picture no card uses yet may belong to a draft still open, maybe in
   another tab, so it is only let go once it is a day old. */
const GRACE_MS = 24 * 60 * 60 * 1000;

let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('unavailable'));
    });
  }
  return opening;
}

/* Runs work on the store in one transaction and settles once it is written. */
function transact(mode, work) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/* Scaled down to MAX_SIDE on its longest side. JPEG stays JPEG; anything
   else may hold transparency, so it becomes WebP, or PNG where the browser
   cannot write WebP. A browser that cannot decode the file keeps it whole. */
async function shrink(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext ? canvas.getContext('2d') : null;
  if ((scale === 1 && file.size <= KEEP_AS_IS) || !context) {
    if (bitmap.close) bitmap.close();
    return file;
  }
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  return blob && blob.size < file.size ? blob : file;
}

/* Keeps a picture and returns its id. Fails with "type" for a file that is
   not a picture, "size" for one still too large once shrunk, and
   "unavailable" where the browser keeps no IndexedDB. */
export async function addImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('type');
  const blob = await shrink(file);
  if (blob.size > MAX_BYTES) throw new Error('size');
  const id = uid();
  await transact('readwrite', (store) => store.put({ blob, created: Date.now() }, id));
  return id;
}

const urls = new Map();

/* An object URL for the picture, or null once it is gone. */
export function imageUrl(id) {
  if (!urls.has(id)) {
    urls.set(id, transact('readonly', (store) => store.get(id))
      .then((record) => (record ? URL.createObjectURL(record.blob) : null))
      .catch(() => null));
  }
  return urls.get(id);
}

/* The picture as an element, filled in once it is read. alt is empty when
   text next to the picture already says what it shows. */
export function cardImage(id, alt, extra) {
  const image = el('img', { class: extra ? 'card-image ' + extra : 'card-image', alt, decoding: 'async' });
  imageUrl(id).then((url) => {
    if (url) image.setAttribute('src', url);
    else image.dataset.missing = '1';
  });
  return image;
}

async function dataUrl(blob) {
  return 'data:' + (blob.type || 'image/png') + ';base64,' + toBase64(new Uint8Array(await blob.arrayBuffer()));
}

/* The pictures named by ids, as data URLs, for a backup. */
export async function exportImages(ids) {
  const out = {};
  for (const id of ids) {
    const record = await transact('readonly', (store) => store.get(id));
    if (record) out[id] = await dataUrl(record.blob);
  }
  return out;
}

/* Puts back pictures from a backup. Anything that is not a picture's data
   URL, or that is larger than a picture kept here could be, is skipped. The
   base64 is decoded here rather than fetched, which a strict content
   security policy would forbid. */
export async function importImages(images) {
  if (!images || typeof images !== 'object') return 0;
  let count = 0;
  for (const [id, url] of Object.entries(images)) {
    const head = typeof url === 'string' ? /^data:(image\/[\w.+-]+);base64,/.exec(url) : null;
    if (!head || (url.length - head[0].length) * 0.75 > MAX_BYTES) continue;
    let blob;
    try {
      blob = new Blob([fromBase64(url.slice(head[0].length))], { type: head[1] });
    } catch {
      continue;
    }
    await transact('readwrite', (store) => store.put({ blob, created: Date.now() }, id));
    urls.delete(id);
    count += 1;
  }
  return count;
}

/* Lets go of the pictures no card uses, once past the grace period. */
export async function pruneImages(keep) {
  const cutoff = Date.now() - GRACE_MS;
  await transact('readwrite', (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      if (!keep.has(entry.key) && !(entry.value.created > cutoff)) entry.delete();
      entry.continue();
    };
    return null;
  });
}

export async function clearImages() {
  await transact('readwrite', (store) => store.clear());
  urls.clear();
}
