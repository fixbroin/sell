// src/lib/mysqlStorage.ts

export const storage = { type: 'storage' };
export const getStorage = () => storage;
import { auth } from './firebase';

// Global map to hold resolved URLs for uploaded references
const resolvedUrls = new Map<string, string>();

class MySQLStorageRef {
  type = 'storageRef';
  path: string; // can be "public/uploads/categories/abc.png" or "/uploads/categories/abc.png"

  constructor(path: string) {
    this.path = path;
  }
}

export function ref(storageInstance: any, path: string) {
  return new MySQLStorageRef(path);
}

/**
 * Extracts folder name from the storage ref path.
 * e.g., "public/uploads/categories/filename.png" -> "categories"
 */
function getUploadPath(refPath: string): string {
  if (refPath.includes('pdf') || refPath.endsWith('.pdf')) {
    return 'pdf';
  }
  if (refPath.includes('sounds') || refPath.startsWith('sounds/')) {
    return 'sounds';
  }
  const match = refPath.match(/uploads\/([^/]+)/);
  return match ? match[1] : 'general';
}

export function uploadBytesResumable(refInstance: MySQLStorageRef, file: File | Blob) {
  const uploadPath = getUploadPath(refInstance.path);
  const filename = refInstance.path.split('/').pop() || 'file';
  
  // Custom mock UploadTask object
  let progressCallback: any = null;
  let errorCallback: any = null;
  let completeCallback: any = null;

  const task = {
    snapshot: {
      ref: refInstance
    },
    on: (
      event: string, 
      onProgress?: (snapshot: any) => void, 
      onError?: (error: any) => void, 
      onComplete?: () => void
    ) => {
      progressCallback = onProgress;
      errorCallback = onError;
      completeCallback = onComplete;
      
      // Start actual upload process asynchronously
      (async () => {
        try {
          const token = await auth.currentUser?.getIdToken();

          // Detach from Android OS file handles by reading into an in-memory Blob
          let uploadPayload: Blob = file;
          try {
            const buffer = await file.arrayBuffer();
            uploadPayload = new Blob([buffer], { type: file.type || 'image/jpeg' });
          } catch (readErr) {
            console.warn("Could not convert file to in-memory Blob:", readErr);
          }

          const formData = new FormData();
          formData.append('file', uploadPayload, filename);
          formData.append('uploadPath', uploadPath);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && progressCallback) {
              const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
              progressCallback({ bytesTransferred: percent, totalBytes: 100 });
            }
          };

          xhr.onload = () => {
            let data: any = null;
            try {
              data = JSON.parse(xhr.responseText);
            } catch {
              data = null;
            }

            if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
              resolvedUrls.set(refInstance.path, data.url);
              if (progressCallback) progressCallback({ bytesTransferred: 100, totalBytes: 100 });
              if (completeCallback) completeCallback();
            } else {
              const errorMsg = data?.error || (xhr.status === 413 ? "File size exceeds server limit (Max 5MB)." : `Upload failed (Status ${xhr.status}: ${xhr.statusText || 'Server Error'})`);
              if (errorCallback) errorCallback(new Error(errorMsg));
            }
          };

          xhr.onerror = () => {
            if (errorCallback) errorCallback(new Error("Network connection failed during upload. Please check your internet connection."));
          };

          xhr.ontimeout = () => {
            if (errorCallback) errorCallback(new Error("Upload timed out. Please try again."));
          };

          xhr.timeout = 90000; // 90 seconds timeout
          xhr.send(formData);
        } catch (error: any) {
          if (errorCallback) errorCallback(error);
        }
      })();
    }
  };

  return task;
}

export async function uploadBytes(refInstance: MySQLStorageRef, file: File | Blob, metadata: any = {}) {
  const uploadPath = getUploadPath(refInstance.path);
  const filename = refInstance.path.split('/').pop() || 'file';
  let uploadPayload: Blob = file;
  try {
    const buffer = await file.arrayBuffer();
    uploadPayload = new Blob([buffer], { type: file.type || 'image/jpeg' });
  } catch (readErr) {
    console.warn("Could not convert file to in-memory Blob in uploadBytes:", readErr);
  }

  const formData = new FormData();
  formData.append('file', uploadPayload, filename);
  formData.append('uploadPath', uploadPath);

  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok || !data?.success) {
    const errorMsg = data?.error || (res.status === 413 ? "File size exceeds server limit (Max 5MB)." : `Upload failed (Status ${res.status}: ${res.statusText || 'Error'})`);
    throw new Error(errorMsg);
  }

  resolvedUrls.set(refInstance.path, data.url);
  return { ref: refInstance };
}

export async function getDownloadURL(refInstance: MySQLStorageRef): Promise<string> {
  // If we already have the URL resolved from a recent upload
  if (resolvedUrls.has(refInstance.path)) {
    return resolvedUrls.get(refInstance.path) || '';
  }

  // If the ref path is already a direct URL (e.g. starting with /uploads/)
  if (refInstance.path.startsWith('/uploads/')) {
    return refInstance.path;
  }

  // Fallback to converting standard path public/uploads/... to /uploads/...
  const cleanPath = refInstance.path.replace(/^public\//, '/');
  if (cleanPath.startsWith('/uploads/')) {
    return cleanPath;
  }

  return refInstance.path;
}

export async function deleteObject(refInstance: any): Promise<void> {
  const targetUrl = typeof refInstance === 'string' 
    ? refInstance 
    : (refInstance?.path || refInstance?.name || String(refInstance || ''));
    
  if (!targetUrl || targetUrl.trim() === '') return;

  let cleanUrl = targetUrl.trim();
  if (cleanUrl.startsWith('public/')) {
    cleanUrl = cleanUrl.replace(/^public\//, '/');
  }

  try {
    const token = await auth.currentUser?.getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/upload', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ fileUrl: cleanUrl })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("deleteObject warning:", data?.error || 'Deletion warning');
    }
  } catch (err) {
    console.error("deleteObject error:", err);
  }
}
