
"use client";

import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from '@/lib/mysqlStorage';
import { nanoid } from 'nanoid';
import { isWebView, requestFileDownload } from './webview-bridge'; // Import WebView bridge functions

/**
 * Converts a data URI string to a Blob object.
 * @param dataURI The data URI string (e.g., "data:application/pdf;base64,...").
 * @returns A Blob object or null if conversion fails.
 */
export function dataUriToBlob(dataURI: string): Blob | null {
  try {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (error) {
    console.error("Error converting data URI to Blob:", error);
    return null;
  }
}

/**
 * Uploads a PDF Blob to Firebase Storage.
 * @param pdfBlob The PDF Blob to upload.
 * @param storagePath The desired path in Firebase Storage (e.g., "quotations_pdf/quotationId.pdf").
 * @returns A Promise that resolves with the public downloadable URL of the uploaded PDF.
 */
export async function uploadPdfToStorage(pdfBlob: Blob, storagePath: string): Promise<string> {
  if (!(pdfBlob instanceof Blob)) {
    throw new Error("Invalid PDF Blob provided for upload.");
  }
  const fileRef = storageRef(storage, storagePath);
  try {
    const snapshot = await uploadBytes(fileRef, pdfBlob, {
      contentType: 'application/pdf',
    });
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading PDF to Firebase Storage:", error);
    throw error; // Re-throw to be caught by the caller
  }
}

/**
 * Triggers a browser download for a PDF from a data URI, or requests a native download if in a WebView.
 * @param pdfDataUri The data URI string of the PDF.
 * @param fileName The desired file name for the download (e.g., "quotation-123.pdf").
 */
export function triggerPdfDownload(pdfDataUri: string, fileName: string): void {
  try {
    if (isWebView()) {
      // In WebView, request the native app to handle the download.
      // The native side will need to handle the base64 data URI.
      requestFileDownload(pdfDataUri, fileName);
    } else {
      // Standard web download behavior
      const link = document.createElement('a');
      link.href = pdfDataUri;
      link.download = fileName;
      document.body.appendChild(link); // Required for Firefox
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error("Error triggering PDF download:", error);
    // Optionally, show a toast message to the user
  }
}
