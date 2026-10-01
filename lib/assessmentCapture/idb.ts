"use client";

// On-device durability layer for Assessment Mobile Capture v0.1. Every MediaRecorder blob is
// written here BEFORE any network attempt, so backgrounding, reloading, or losing signal never
// loses already-recorded audio. Ported in spirit from feature/assessment-aws-transcription-
// pipeline's lib/assessmentCapture/idb.ts (itself from serve-intake-mvp's public/capture/idb.js),
// extended with the per-chunk metadata this slice requires (runId, MIME type, byte size, recorded
// timestamp) and an explicit upload state so a terminal problem (conflict, session closed) stops
// retrying instead of looping forever.
//
// A new database name (not the old branch's) so a device that ever ran the old recorder can't
// collide with this record shape. Blobs are stored exactly as produced — never concatenated or
// re-encoded.

import type { RunLogEntry } from "./recordingHealth.ts";

const DB_NAME = "serve-os-mobile-capture";
// v2 (resilience hardening): adds the "runs" store — the per-assessment recorder-run log
// (start/end/reason), so interruption history survives a reload. Upgrading from v1 only ADDS a
// store; existing chunks are untouched.
const DB_VERSION = 2;
const STORE = "chunks";
const RUN_STORE = "runs";

export type LocalChunkState = "pending" | "uploaded" | "conflict" | "orphaned";

export interface LocalChunkRecord {
  sessionId: string;
  chunkIndex: number;
  runId: string;
  blob: Blob;
  mimeType: string;
  size: number;
  recordedAt: number;
  state: LocalChunkState;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["sessionId", "chunkIndex"] });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(RUN_STORE)) {
        const runs = db.createObjectStore(RUN_STORE, { keyPath: ["sessionId", "runId"] });
        runs.createIndex("bySession", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Adds a NEW chunk. Uses add(), not put(): an existing record at the same key is never
 * overwritten — a reused index surfaces as an error instead of silently replacing audio. */
export async function addChunk(record: Omit<LocalChunkRecord, "state">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).add({ ...record, state: "pending" } satisfies LocalChunkRecord);
  await txDone(tx);
}

export async function setChunkState(sessionId: string, chunkIndex: number, state: LocalChunkState, lastError?: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const getReq = store.get([sessionId, chunkIndex]);
  getReq.onsuccess = () => {
    const record = getReq.result as LocalChunkRecord | undefined;
    if (record) store.put({ ...record, state, lastError });
  };
  await txDone(tx);
}

export async function getChunksForSession(sessionId: string): Promise<LocalChunkRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).index("bySession").getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const rows = ((request.result as LocalChunkRecord[]) || []).sort((a, b) => a.chunkIndex - b.chunkIndex);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Removes this session's local copies — called only after the server has confirmed the session
 * is 'captured' (every chunk verified in storage). */
export async function deleteChunksForSession(sessionId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const index = tx.objectStore(STORE).index("bySession");
  const request = index.openCursor(IDBKeyRange.only(sessionId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await txDone(tx);
}

// ─── Recorder-run log (interruption metadata) ─────────────────────────────────────────────────

export interface LocalRunRecord extends RunLogEntry {
  sessionId: string;
}

/** Writes the current state of one run (insert or update — a run's end is recorded after its
 * start). Never touches chunk records. */
export async function saveRun(sessionId: string, run: RunLogEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(RUN_STORE, "readwrite");
  tx.objectStore(RUN_STORE).put({ ...run, sessionId } satisfies LocalRunRecord);
  await txDone(tx);
}

export async function getRunsForSession(sessionId: string): Promise<RunLogEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RUN_STORE, "readonly");
    const request = tx.objectStore(RUN_STORE).index("bySession").getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const rows = ((request.result as LocalRunRecord[]) || []).map(({ runId, startedAt, endedAt, endReason }) => ({ runId, startedAt, endedAt, endReason }));
      resolve(rows.sort((a, b) => a.startedAt - b.startedAt));
    };
    request.onerror = () => reject(request.error);
  });
}

/** Removes this session's run log — only after the server has confirmed 'captured'. */
export async function deleteRunsForSession(sessionId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(RUN_STORE, "readwrite");
  const request = tx.objectStore(RUN_STORE).index("bySession").openCursor(IDBKeyRange.only(sessionId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await txDone(tx);
}
