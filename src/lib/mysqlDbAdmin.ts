// src/lib/mysqlDbAdmin.ts
import { 
  getPool, 
  getDocInternal, 
  getDocsInternal, 
  addDocInternal, 
  setDocInternal, 
  updateDocInternal, 
  deleteDocInternal
} from './mysql';
import { Timestamp } from './timestamp';

export { Timestamp };

export class FieldValue {
  type: string;
  elements: any[];
  constructor(type: string, elements: any[]) {
    this.type = type;
    this.elements = elements;
  }
  static increment(n: number) {
    return new FieldValue('increment', [n]);
  }
  static serverTimestamp() {
    return new FieldValue('serverTimestamp', []);
  }
  static arrayUnion(...elements: any[]) {
    return new FieldValue('arrayUnion', elements);
  }
  static arrayRemove(...elements: any[]) {
    return new FieldValue('arrayRemove', elements);
  }
  static deleteField() {
    return new FieldValue('deleteField', []);
  }
}

export function deserializeAdminData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(deserializeAdminData);
  }

  if (typeof obj === 'object') {
    if (obj._isTimestamp) {
      return new Timestamp(obj._seconds, obj._nanoseconds);
    }
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = deserializeAdminData(obj[key]);
    }
    return res;
  }

  return obj;
}

class MySQLAdminDocReference {
  path: string;
  id: string;

  constructor(path: string, id: string) {
    this.path = path;
    this.id = id;
  }

  collection(subCollectionName: string) {
    return new MySQLAdminQueryBuilder(`${this.path}/${subCollectionName}`);
  }

  async get(): Promise<MySQLAdminDocSnapshot> {
    const pool = await getPool();
    const result = await getDocInternal(pool, this.path);
    return {
      id: this.id,
      exists: result.exists,
      data: () => deserializeAdminData(result.data),
      ref: this,
      updateTime: Timestamp.now()
    };
  }

  async set(data: any, options: any = {}) {
    const pool = await getPool();
    const parts = this.path.split('/');
    const collectionPath = parts.slice(0, -1).join('/');
    await setDocInternal(pool, collectionPath, this.id, data, options);
    return { success: true };
  }

  async update(data: any) {
    const pool = await getPool();
    const parts = this.path.split('/');
    const collectionPath = parts.slice(0, -1).join('/');
    await updateDocInternal(pool, collectionPath, this.id, data);
    return { success: true };
  }

  async delete() {
    const pool = await getPool();
    await deleteDocInternal(pool, this.path);
    return { success: true };
  }
}

export type DocumentReference = MySQLAdminDocReference;

class MySQLAdminQueryBuilder {
  path: string;
  constraints: any[];

  constructor(path: string, constraints: any[] = []) {
    this.path = path;
    this.constraints = constraints;
  }

  doc(docId?: string) {
    const id = docId || require('nanoid').nanoid(20);
    return new MySQLAdminDocReference(`${this.path}/${id}`, id);
  }

  where(field: string, op: string, value: any) {
    return new MySQLAdminQueryBuilder(this.path, [
      ...this.constraints,
      { type: 'where', field, op: op === '==' ? '==' : op, value }
    ]);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new MySQLAdminQueryBuilder(this.path, [
      ...this.constraints,
      { type: 'orderBy', field, direction }
    ]);
  }

  limit(n: number) {
    return new MySQLAdminQueryBuilder(this.path, [
      ...this.constraints,
      { type: 'limit', value: n }
    ]);
  }

  offset(n: number) {
    return new MySQLAdminQueryBuilder(this.path, [
      ...this.constraints,
      { type: 'offset', value: n }
    ]);
  }

  async get() {
    const pool = await getPool();
    const rawDocs = await getDocsInternal(pool, this.path, this.constraints);
    
    const docs: MySQLAdminDocSnapshot[] = rawDocs.map((docItem: any) => {
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
        data: () => deserializeAdminData(docItem.data),
        exists: true,
        ref: new MySQLAdminDocReference(`${this.path}/${docItem.id}`, docItem.id),
        updateTime: {
          toMillis: () => millis
        }
      };
    });

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (callback: (doc: MySQLAdminDocSnapshot) => void) => docs.forEach(callback)
    };
  }

  async add(data: any) {
    const pool = await getPool();
    const result = await addDocInternal(pool, this.path, data);
    return {
      id: result.id,
      path: `${this.path}/${result.id}`
    };
  }
}

class MySQLAdminDb {
  collection(collectionName: string) {
    return new MySQLAdminQueryBuilder(collectionName);
  }

  async getAll(...docRefs: any[]) {
    const results = [];
    for (const ref of docRefs) {
      const snap = await ref.get();
      results.push(snap);
    }
    return results;
  }

  batch() {
    const operations: any[] = [];
    return {
      set: (docRef: MySQLAdminDocReference, data: any, options: any = {}) => {
        const parts = docRef.path.split('/');
        const collectionPath = parts.slice(0, -1).join('/');
        operations.push({ action: 'setDoc', collection: collectionPath, id: docRef.id, data, options });
      },
      update: (docRef: MySQLAdminDocReference, data: any) => {
        const parts = docRef.path.split('/');
        const collectionPath = parts.slice(0, -1).join('/');
        operations.push({ action: 'updateDoc', collection: collectionPath, id: docRef.id, data });
      },
      delete: (docRef: MySQLAdminDocReference) => {
        const parts = docRef.path.split('/');
        const collectionPath = parts.slice(0, -1).join('/');
        operations.push({ action: 'deleteDoc', collection: collectionPath, id: docRef.id });
      },
      commit: async () => {
        const pool = await getPool();
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          for (const op of operations) {
            if (op.action === 'setDoc') {
              await setDocInternal(conn, op.collection, op.id, op.data, op.options);
            } else if (op.action === 'updateDoc') {
              await updateDocInternal(conn, op.collection, op.id, op.data);
            } else if (op.action === 'deleteDoc') {
              await deleteDocInternal(conn, op.collection, op.id);
            }
          }
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        } finally {
          conn.release();
        }
      }
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      const transaction = {
        get: async (docRef: MySQLAdminDocReference): Promise<MySQLAdminDocSnapshot> => {
          const result = await getDocInternal(conn, docRef.path);
          return {
            id: docRef.id,
            exists: result.exists,
            data: () => deserializeAdminData(result.data),
            ref: docRef,
            updateTime: Timestamp.now()
          };
        },
        set: async (docRef: MySQLAdminDocReference, data: any, options: any = {}) => {
          const parts = docRef.path.split('/');
          const collectionPath = parts.slice(0, -1).join('/');
          await setDocInternal(conn, collectionPath, docRef.id, data, options);
        },
        update: async (docRef: MySQLAdminDocReference, data: any) => {
          const parts = docRef.path.split('/');
          const collectionPath = parts.slice(0, -1).join('/');
          await updateDocInternal(conn, collectionPath, docRef.id, data);
        },
        delete: async (docRef: MySQLAdminDocReference) => {
          const parts = docRef.path.split('/');
          const collectionPath = parts.slice(0, -1).join('/');
          await deleteDocInternal(conn, collectionPath, docRef.id);
        }
      };

      const result = await updateFunction(transaction);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

export const adminDb = new MySQLAdminDb();

export function getFirestore() {
  return adminDb;
}

export interface MySQLAdminDocSnapshot {
  id: string;
  exists: boolean;
  data: () => any;
  ref?: any;
  updateTime?: any;
}
