"use client";

// Ported near-verbatim from serve-intake-mvp's public/capture/idb.js — the proven durability
// layer: a chunk is written here the moment MediaRecorder produces it, before any network
// attempt, so backgrounding/killing the tab never loses already-captured audio. Deliberately
// unchanged in behavior/shape from the source engine; only the module wrapper (TS types,
// ES module exports instead of a `window.captureIdb` global) differs, since Serve OS bundles
// this via Next.js rather than loading a bare script tag.

const DB_NAME = "serve-os-assessment-capture";
const DB_VERSION = 1;
const STORE = "chunks";

export interface StoredChunkRecord {
  sessionId: string;
  chunkIndex: number;
  blob: Blob;
  mimeType: string;
  uploaded: boolean;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["sessionId", "chunkIndex"] });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putChunk(sessionId: string, chunkIndex: number, blob: Blob, mimeType: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      sessionId,
      chunkIndex,
      blob,
      mimeType,
      uploaded: false,
      createdAt: Date.now(),
    } satisfies StoredChunkRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markUploaded(sessionId: string, chunkIndex: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get([sessionId, chunkIndex]);
    getReq.onsuccess = () => {
      const record = getReq.result as StoredChunkRecord | undefined;
      if (record) {
        record.uploaded = true;
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunksForSession(sessionId: string): Promise<StoredChunkRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("bySession");
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const rows = (request.result as StoredChunkRecord[]) || [];
      rows.sort((a, b) => a.chunkIndex - b.chunkIndex);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingChunks(sessionId: string): Promise<StoredChunkRecord[]> {
  const all = await getChunksForSession(sessionId);
  return all.filter((row) => !row.uploaded);
}
