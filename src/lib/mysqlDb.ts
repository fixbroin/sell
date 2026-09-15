// src/lib/mysqlDb.ts
import { 
  executeDbGetDoc, 
  executeDbGetDocs, 
  executeDbAddDoc, 
  executeDbSetDoc, 
  executeDbUpdateDoc, 
  executeDbDeleteDoc, 
  executeDbBatch 
} from '@/app/actions/dbActions';
import { Timestamp, isTimestamp } from './timestamp';
import { auth } from './firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (typeof window === 'undefined') {
    const secret = process.env.INTERNAL_API_SECRET || "default_internal_secret_key_123456";
    headers['x-internal-token'] = secret;
  } else {
    try {
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      console.error("Error getting idToken in mysqlDb:", e);
    }
  }

  return headers;
}

export { Timestamp };

export const db = { type: 'db' };

export class FieldValue {
  type: string;
  elements: any[];
  constructor(type: string, elements: any[]) {
    this.type = type;
    this.elements = elements;
  }
}

export function arrayUnion(...elements: any[]) {
  return new FieldValue('arrayUnion', elements);
}

export function arrayRemove(...elements: any[]) {
  return new FieldValue('arrayRemove', elements);
}

export function deleteField() {
  return new FieldValue('deleteField', []);
}

export function serverTimestamp() {
  return new FieldValue('serverTimestamp', []);
}

export function increment(n: number) {
  return new FieldValue('increment', [n]);
}

export function serializeClientData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Date) {
    return { _seconds: Math.floor(obj.getTime() / 1000), _nanoseconds: 0, _isTimestamp: true };
  }

  if (isTimestamp(obj)) {
    const s = typeof obj.seconds === 'number' ? obj.seconds : (obj as any)._seconds;
    const ns = typeof obj.nanoseconds === 'number' ? obj.nanoseconds : (obj as any)._nanoseconds;
    return { _seconds: s, _nanoseconds: ns, _isTimestamp: true };
  }

  if (obj instanceof FieldValue) {
    return { _isFieldValue: true, type: obj.type, elements: serializeClientData(obj.elements) };
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeClientData);
  }

  if (typeof obj === 'object') {
    // If it has a custom class constructor that is not Object, serialize its properties
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = serializeClientData(obj[key]);
    }
    return res;
  }

  return obj;
}

export function deserializeClientData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(deserializeClientData);
  }

  if (typeof obj === 'object') {
    if (obj._isTimestamp) {
      return new Timestamp(obj._seconds, obj._nanoseconds);
    }
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = deserializeClientData(obj[key]);
    }
    return res;
  }

  return obj;
}

export interface DocumentReference {
  type: 'doc';
  path: string;
}

export interface CollectionReference {
  type: 'collection';
  path: string;
}

export interface Query {
  type: 'query';
  path: string;
  constraints: any[];
}

export function collection(dbInstance: any, path: string, ...pathSegments: string[]): CollectionReference {
  const fullPath = [path, ...pathSegments].filter(Boolean).join('/');
  return { type: 'collection', path: fullPath };
}

export function collectionGroup(dbInstance: any, collectionId: string): CollectionReference {
  return { type: 'collection', path: collectionId };
}

export interface DocumentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
  ref: any;
}

export interface QueryDocumentSnapshot extends DocumentSnapshot {}

export interface QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach: (callback: (doc: QueryDocumentSnapshot) => void) => void;
}

export function doc(dbOrColRef: any, path?: string, ...pathSegments: string[]): DocumentReference {
  let fullPath = '';
  if (dbOrColRef && dbOrColRef.type === 'collection') {
    if (!path) {
      const generatedId = require('nanoid').nanoid(20);
      fullPath = dbOrColRef.path + '/' + generatedId;
    } else {
      fullPath = dbOrColRef.path + '/' + path;
    }
  } else {
    fullPath = [path, ...pathSegments].filter(Boolean).join('/');
  }
  return { type: 'doc', path: fullPath };
}

export function documentId() {
  return '__name__';
}

export function query(collectionRef: any, ...constraints: any[]): Query {
  return {
    type: 'query',
    path: collectionRef.path,
    constraints: constraints.filter(Boolean)
  };
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export function or(...conditions: any[]) {
  return { type: 'or', conditions };
}

export function and(...conditions: any[]) {
  return { type: 'and', conditions };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(n: number) {
  return { type: 'limit', value: n };
}

export function startAfter(snapshotOrVal: any) {
  return { type: 'startAfter', value: snapshotOrVal };
}

function getApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return path;
  }
  const port = process.env.PORT || '3006';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${port}`;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export async function getDoc(docRef: DocumentReference): Promise<DocumentSnapshot> {
  let result = { exists: false, data: null };
  try {
    const res = await fetch(getApiUrl('/api/db/getDoc'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ path: docRef.path })
    });
    if (res.ok) {
      result = await res.json();
    }
  } catch (e) {
    console.error("getDoc API fetch error:", e);
  }

  return {
    id: docRef.path.split('/').pop() || '',
    exists: () => !!result.exists,
    data: () => deserializeClientData(result.data),
    ref: docRef
  };
}

export async function getDocs(queryRef: CollectionReference | Query): Promise<QuerySnapshot> {
  const constraints = queryRef.type === 'query' ? (queryRef as Query).constraints : [];
  const cleanConstraints = serializeClientData(constraints);
  
  let rawDocs: any[] = [];
  try {
    const res = await fetch(getApiUrl('/api/db/getDocs'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ path: queryRef.path, constraints: cleanConstraints })
    });
    if (res.ok) {
      const data = await res.json();
      rawDocs = Array.isArray(data) ? data : (data.docs || []);
    }
  } catch (e) {
    console.error("getDocs API fetch error:", e);
  }
  
  const docs: QueryDocumentSnapshot[] = rawDocs.map((docItem: any) => {
    const dataObj = docItem.data || {};
    const updatedAt = dataObj.updatedAt;
    let millis = 0;
    if (updatedAt) {
      const sec = typeof updatedAt._seconds === 'number' ? updatedAt._seconds : (typeof updatedAt.seconds === 'number' ? updatedAt.seconds : 0);
      if (sec) {
        millis = sec * 1000;
      } else {
        const d = new Date(updatedAt);
        if (!isNaN(d.getTime())) millis = d.getTime();
      }
    }
    return {
      id: docItem.id,
      data: () => deserializeClientData(docItem.data),
      exists: () => true,
      ref: { path: `${queryRef.path}/${docItem.id}`, id: docItem.id },
      updateTime: {
        toMillis: () => millis
      }
    };
  });

  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (callback: (doc: QueryDocumentSnapshot) => void) => docs.forEach(callback)
  };
}

export async function addDoc(collectionRef: CollectionReference, data: any) {
  const cleanData = serializeClientData(data);
  const res = await fetch(getApiUrl('/api/db/mutate'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'addDoc', path: collectionRef.path, data: cleanData })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`addDoc failed: ${errText || res.statusText}`);
  }
  const result = await res.json();
  return {
    id: result.id,
    path: `${collectionRef.path}/${result.id}`
  };
}

export async function setDoc(docRef: DocumentReference, data: any, options?: any) {
  const parts = docRef.path.split('/');
  const collectionPath = parts.slice(0, -1).join('/');
  const docId = parts.pop() || '';
  const cleanData = serializeClientData(data);
  const res = await fetch(getApiUrl('/api/db/mutate'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'setDoc', path: collectionPath, id: docId, data: cleanData, options })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`setDoc failed: ${errText || res.statusText}`);
  }
  return { success: true };
}

export async function updateDoc(docRef: DocumentReference, data: any) {
  const parts = docRef.path.split('/');
  const collectionPath = parts.slice(0, -1).join('/');
  const docId = parts.pop() || '';
  const cleanData = serializeClientData(data);
  const res = await fetch(getApiUrl('/api/db/mutate'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'updateDoc', path: collectionPath, id: docId, data: cleanData })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`updateDoc failed: ${errText || res.statusText}`);
  }
  return { success: true };
}

export async function deleteDoc(docRef: DocumentReference) {
  const res = await fetch(getApiUrl('/api/db/mutate'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'deleteDoc', path: docRef.path })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`deleteDoc failed: ${errText || res.statusText}`);
  }
  return { success: true };
}

export function writeBatch(dbInstance: any) {
  const operations: any[] = [];
  return {
    set: (docRef: DocumentReference, data: any, options?: any) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      const cleanData = serializeClientData(data);
      operations.push({ action: 'setDoc', collection: collectionPath, id: docId, data: cleanData, options });
    },
    update: (docRef: DocumentReference, data: any) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      const cleanData = serializeClientData(data);
      operations.push({ action: 'updateDoc', collection: collectionPath, id: docId, data: cleanData });
    },
    delete: (docRef: DocumentReference) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      operations.push({ action: 'deleteDoc', collection: collectionPath, id: docId });
    },
    commit: async () => {
      const res = await fetch(getApiUrl('/api/db/batch'), {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ operations })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Batch commit failed: ${errText || res.statusText}`);
      }
    }
  };
}

export async function runTransaction(dbInstance: any, updateFunction: (transaction: any) => Promise<any>) {
  const reads: { path: string; id: string }[] = [];
  const writes: any[] = [];

  const transaction = {
    get: async (docRef: DocumentReference): Promise<DocumentSnapshot> => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      reads.push({ path: collectionPath, id: docId });
      return await getDoc(docRef);
    },
    set: (docRef: DocumentReference, data: any, options?: any) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      const cleanData = serializeClientData(data);
      writes.push({ action: 'setDoc', collection: collectionPath, id: docId, data: cleanData, options });
    },
    update: (docRef: DocumentReference, data: any) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      const cleanData = serializeClientData(data);
      writes.push({ action: 'updateDoc', collection: collectionPath, id: docId, data: cleanData });
    },
    delete: (docRef: DocumentReference) => {
      const parts = docRef.path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.pop() || '';
      writes.push({ action: 'deleteDoc', collection: collectionPath, id: docId });
    }
  };

  const result = await updateFunction(transaction);

  if (writes.length > 0) {
    await executeDbBatch(writes);
  }

  return result;
}

export function onSnapshot(
  docRef: DocumentReference,
  callback: (snapshot: DocumentSnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  queryRef: CollectionReference | Query,
  callback: (snapshot: QuerySnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  docRef: DocumentReference,
  options: any,
  callback: (snapshot: DocumentSnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  queryRef: CollectionReference | Query,
  options: any,
  callback: (snapshot: QuerySnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(queryOrDocRef: any, arg2: any, arg3?: any, arg4?: any): () => void {
  let callback: (snapshot: any) => void;
  let onError: ((error: any) => void) | undefined;

  if (typeof arg2 === 'function') {
    callback = arg2;
    onError = arg3;
  } else {
    callback = arg3;
    onError = arg4;
  }

  let isCancelled = false;
  let intervalId: any = null;
  let lastDataHash = '';

  const run = async () => {
    try {
      if (queryOrDocRef.type === 'doc') {
        const docSnap = await getDoc(queryOrDocRef);
        if (isCancelled) return;
        const currentData = docSnap.data();
        const dataHash = JSON.stringify(currentData);
        if (dataHash !== lastDataHash) {
          lastDataHash = dataHash;
          callback(docSnap);
        }
      } else {
        const querySnap = await getDocs(queryOrDocRef);
        if (isCancelled) return;
        const docsData = querySnap.docs.map((d: any) => d.data());
        const dataHash = JSON.stringify(docsData);
        if (dataHash !== lastDataHash) {
          lastDataHash = dataHash;
          callback(querySnap);
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError' && !e?.message?.includes('Failed to fetch')) {
        console.error("Error in onSnapshot polling:", e);
        if (onError) onError(e);
      }
    }
  };

  run();
  intervalId = setInterval(run, 8000);

  return () => {
    isCancelled = true;
    if (intervalId) clearInterval(intervalId);
  };
}
