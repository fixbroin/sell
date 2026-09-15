
'use client';

import { nanoid } from 'nanoid';

const GUEST_ID_KEY = 'yourbrandGuestId';
const GUEST_ID_EXPIRY_DAYS = 30; // How long to keep the guest ID

export const getGuestId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedData = localStorage.getItem(GUEST_ID_KEY);
    if (storedData) {
      const { id, expiry } = JSON.parse(storedData);
      if (expiry && new Date(expiry) > new Date()) {
        // Extend expiry on activity
        const newExpiry = new Date(new Date().getTime() + GUEST_ID_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
        localStorage.setItem(GUEST_ID_KEY, JSON.stringify({ id, expiry: newExpiry }));
        return id;
      }
    }
  } catch (e) {
    console.error("Error accessing guest ID from localStorage:", e);
  }

  // If no valid ID, generate a new one
  const newId = nanoid(21); // Generate a new unique ID
  const newExpiry = new Date(new Date().getTime() + GUEST_ID_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    localStorage.setItem(GUEST_ID_KEY, JSON.stringify({ id: newId, expiry: newExpiry }));
  } catch (e) {
    console.error("Error setting new guest ID in localStorage:", e);
  }
  return newId;
};

export const clearGuestId = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(GUEST_ID_KEY);
  } catch (e) {
    console.error("Error clearing guest ID from localStorage:", e);
  }
};
