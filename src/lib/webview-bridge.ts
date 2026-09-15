
"use client";

// --- Global Functions for Flutter to Call ---
if (typeof window !== 'undefined') {
  // Authentication
  (window as any).onGoogleSignInSuccess = (idToken: string) => {
    const event = new CustomEvent('nativeGoogleSignIn', { detail: { idToken } });
    window.dispatchEvent(event);
  };
  (window as any).onGoogleSignInError = (error: string) => {
    const event = new CustomEvent('nativeGoogleSignInError', { detail: { error } });
    window.dispatchEvent(event);
  };

  // Payment
  (window as any).onNativePaymentSuccess = (paymentDetails: any) => {
    const event = new CustomEvent('nativePaymentSuccess', { detail: paymentDetails });
    window.dispatchEvent(event);
  };
  (window as any).onNativePaymentError = (errorDetails: any) => {
    const event = new CustomEvent('nativePaymentError', { detail: errorDetails });
    window.dispatchEvent(event);
  };
  
  // File Upload
  (window as any).onFileSelected = (fileName: string, mimeType: string, base64Data: string) => {
    const event = new CustomEvent('nativeFileSelected', { detail: { fileName, mimeType, base64Data }});
    window.dispatchEvent(event);
  };
  (window as any).onFileSelectionError = (error: string) => {
    const event = new CustomEvent('nativeFileSelectionError', { detail: { error }});
    window.dispatchEvent(event);
  };
}


/**
 * Checks if the app is running inside a Flutter WebView.
 * It looks for a specific handler name that the Flutter InAppWebView should expose.
 */
export const isWebView = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).flutter_inappwebview;
};

/**
 * Sends a message to the Flutter app to initiate the native Google Sign-In flow.
 */
export const requestNativeGoogleSignIn = () => {
  if (isWebView()) {
    try {
      (window as any).flutter_inappwebview.callHandler('requestGoogleSignIn');
    } catch (e) {
      console.error("Error calling native handler 'requestGoogleSignIn':", e);
    }
  } else {
    console.warn("requestNativeGoogleSignIn called, but not in a WebView environment.");
  }
};

/**
 * Sends payment details to the Flutter app to be processed by a native SDK.
 */
export const requestNativePayment = (paymentDetails: { amount: number; currency: string; description: string }) => {
  if (isWebView()) {
    try {
      (window as any).flutter_inappwebview.callHandler('requestNativePayment', paymentDetails);
    } catch (e) {
      console.error("Error calling native handler 'requestNativePayment':", e);
    }
  } else {
    console.warn("requestNativePayment called, but not in a WebView environment.");
  }
};

/**
 * Sends push notification data to the Flutter app so it can be handled natively.
 */
export const sendPushNotificationData = (notificationPayload: any) => {
  if (isWebView()) {
    try {
      (window as any).flutter_inappwebview.callHandler('onPushNotificationReceived', notificationPayload);
    } catch (e) {
      console.error("Error calling native handler 'onPushNotificationReceived':", e);
    }
  }
};

/**
 * Requests the native app to handle a file download.
 * @param url The URL of the file to download.
 * @param fileName The suggested file name.
 */
export const requestFileDownload = (url: string, fileName: string) => {
  if (isWebView()) {
    try {
      (window as any).flutter_inappwebview.callHandler('requestFileDownload', { url, fileName });
    } catch(e) {
        console.error("Error calling native handler 'requestFileDownload':", e);
        // Fallback for safety, might not work well in webview
        window.open(url, '_blank');
    }
  } else {
    // Standard web download behavior
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Requests the native app to open the file picker.
 * @param accept A string of comma-separated file types (e.g., 'image/png, image/jpeg').
 */
export const requestFileUpload = (accept: string = 'image/*') => {
  if (isWebView()) {
     try {
       (window as any).flutter_inappwebview.callHandler('requestFileUpload', { accept });
     } catch(e) {
        console.error("Error calling native handler 'requestFileUpload':", e);
        // As a fallback, maybe click a hidden file input if one exists? For now, just log.
     }
  } else {
    console.warn("requestFileUpload called, but not in a WebView environment. Standard file input should be used.");
  }
};
