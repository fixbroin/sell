// src/lib/serializeUtils.ts

/**
 * Serializes data to a JSON-safe object.
 * Converts Firestore Timestamps (both client and admin) to ISO strings.
 */
export function serializeFirestoreData<T>(data: any): T {
    if (data === null || data === undefined) return data;
    
    // Check for both firebase-admin and firebase client Timestamps
    if (data && typeof data.toDate === 'function') {
        return data.toDate().toISOString() as any;
    }

    // Handle plain objects that look like Timestamps (seconds/_seconds property)
    if (data && typeof data === 'object') {
        if (data.seconds !== undefined && typeof data.seconds === 'number') {
            return new Date(data.seconds * 1000).toISOString() as any;
        }
        if (data._seconds !== undefined && typeof data._seconds === 'number') {
            return new Date(data._seconds * 1000).toISOString() as any;
        }
    }
    
    if (Array.isArray(data)) {
        return data.map(item => serializeFirestoreData(item)) as any;
    }
    
    if (typeof data === 'object') {
        const serialized: any = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                serialized[key] = serializeFirestoreData(data[key]);
            }
        }
        return serialized as T;
    }
    
    return data;
}
