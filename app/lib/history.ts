import type { StoredScan } from '../types';

const DB_NAME = 'foodscanner';
const DB_VERSION = 1;
const STORE = 'scans';
const MAX_SCANS = 20;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open scan history'));
    request.onblocked = () => reject(new Error('Scan history is blocked by another tab'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function readAll(db: IDBDatabase): Promise<StoredScan[]> {
  const tx = db.transaction(STORE, 'readonly');
  const items = await requestToPromise(tx.objectStore(STORE).index('createdAt').getAll());
  return (items as StoredScan[]).sort((a, b) => b.createdAt - a.createdAt);
}

async function trimScans(db: IDBDatabase): Promise<void> {
  const items = await readAll(db);
  if (items.length <= MAX_SCANS) return;

  const tx = db.transaction(STORE, 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore(STORE);
  for (const item of items.slice(MAX_SCANS)) {
    store.delete(item.id);
  }
  await done;
}

export async function listScans(limit = MAX_SCANS): Promise<StoredScan[]> {
  const db = await openDb();
  try {
    return (await readAll(db)).slice(0, limit);
  } finally {
    db.close();
  }
}

export async function saveScan(scan: StoredScan): Promise<void> {
  const db = await openDb();
  try {
    const newest = (await readAll(db))[0];

    const tx = db.transaction(STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);

    if (newest && newest.image === scan.image) {
      store.put({ ...scan, id: newest.id, createdAt: Date.now() });
    } else {
      store.add(scan);
    }

    await done;
    await trimScans(db);
  } finally {
    db.close();
  }
}

export async function clearScans(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(STORE).clear();
    await done;
  } finally {
    db.close();
  }
}
