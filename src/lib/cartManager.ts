
"use client";

import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, getDoc, Timestamp } from '@/lib/mysqlDb';
import type { UserCart } from '@/types/firestore';

export interface CartEntry {
  serviceId: string;
  quantity: number;
}

const CART_STORAGE_KEY = 'yourbrandUserCart';

/**
 * Gets cart entries from localStorage. This is the primary source for guests and the initial source for logged-in users before sync.
 */
export const getCartEntries = (): CartEntry[] => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
  if (storedCart) {
    try {
      const parsedCart = JSON.parse(storedCart);
      return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (e) {
      console.error("Error parsing cart from localStorage", e);
      return [];
    }
  }
  return [];
};

/**
 * Saves cart entries to localStorage. This is always done for both guests and logged-in users to provide instant UI feedback.
 */
export const saveCartEntries = (entries: CartEntry[]): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(entries));
};

/**
 * Synchronizes the local cart with Firestore upon login.
 * It fetches the Firestore cart, merges it with the local cart (giving precedence to local items),
 * saves the merged result back to both Firestore and localStorage.
 * @param userId The UID of the logged-in user.
 */
export const syncCartOnLogin = async (userId: string): Promise<void> => {
    if (!userId) return;

    const localCart = getCartEntries();
    const cartDocRef = doc(db, 'userCarts', userId);

    try {
        const firestoreCartSnap = await getDoc(cartDocRef);
        const firestoreCartItems: CartEntry[] = firestoreCartSnap.exists() ? (firestoreCartSnap.data() as UserCart).items : [];

        // Merge logic: local cart takes precedence
        const mergedCartMap = new Map<string, number>();

        firestoreCartItems.forEach(item => {
            mergedCartMap.set(item.serviceId, item.quantity);
        });
        localCart.forEach(item => {
            mergedCartMap.set(item.serviceId, item.quantity); // Overwrite with local quantity if it exists
        });

        const mergedCart: CartEntry[] = Array.from(mergedCartMap.entries()).map(([serviceId, quantity]) => ({ serviceId, quantity }));
        
        // Save the final merged cart to both locations
        saveCartEntries(mergedCart); 
        await syncCartToFirestore(userId, mergedCart);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
        }

    } catch (error) {
        console.error("Error during cart sync on login:", error);
    }
};

/**
 * Saves the cart to Firestore for a logged-in user. Also used for clearing the cart.
 * @param userId The UID of the logged-in user.
 * @param cartEntries The current state of the cart to save.
 */
export const syncCartToFirestore = async (userId: string, cartEntries: CartEntry[]) => {
  if (!userId) return;

  const cartDocRef = doc(db, 'userCarts', userId);

  if (cartEntries.length > 0) {
    try {
      await setDoc(cartDocRef, {
        userId: userId,
        items: cartEntries,
        updatedAt: Timestamp.now(),
        marketingStatus: {
          reminderSent: false // Reset flag so they get a new reminder if they abandon this update
        }
      }, { merge: true });
    } catch (error) {
      console.error("Error syncing cart to Firestore:", error);
    }
  } else {
    // If cart is empty, delete the document from Firestore
    try {
      await deleteDoc(cartDocRef);
    } catch (error) {
      console.error("Error deleting empty cart from Firestore:", error);
    }
  }
};

/**
 * Saves the active checkout items to localStorage when proceeding from the cart.
 */
export const saveActiveCheckoutEntries = (entries: CartEntry[]): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('yourbrandActiveCheckoutItems', JSON.stringify(entries));
  }
};

/**
 * Gets the active checkout cart entries. If none are explicitly set (e.g. older flow), it falls back to the full cart.
 */
export const getActiveCheckoutEntries = (): CartEntry[] => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  const storedActive = window.localStorage.getItem('yourbrandActiveCheckoutItems');
  if (storedActive) {
    try {
      const parsed = JSON.parse(storedActive);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : getCartEntries();
    } catch (e) {
      return getCartEntries();
    }
  }
  return getCartEntries();
};

/**
 * Removes checked out items from the main cart after a successful booking.
 */
export const removeCheckedOutItemsFromCart = async (userId: string | undefined): Promise<void> => {
  const allCart = getCartEntries();
  const checkedOut = getActiveCheckoutEntries();
  const remaining = allCart.filter(item => !checkedOut.some(c => c.serviceId === item.serviceId));
  
  saveCartEntries(remaining);
  if (userId) {
    await syncCartToFirestore(userId, remaining);
  }
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('yourbrandActiveCheckoutItems');
    window.localStorage.removeItem('yourbrandActiveCheckoutCategory');
    window.localStorage.removeItem('yourbrandActiveCheckoutCategoryName');
    window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
  }
};
