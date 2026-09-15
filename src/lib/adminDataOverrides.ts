
'use client';

const CATEGORY_NAME_OVERRIDES_KEY = 'yourbrandCategoryNameOverrides';

interface CategoryNameOverrides {
  [categoryId: string]: string;
}

export const getCategoryNameOverrides = (): CategoryNameOverrides => {
  if (typeof window === 'undefined') return {};
  try {
    const storedOverrides = localStorage.getItem(CATEGORY_NAME_OVERRIDES_KEY);
    return storedOverrides ? JSON.parse(storedOverrides) : {};
  } catch (e) {
    console.error("Error parsing category name overrides from localStorage:", e);
    return {};
  }
};

export const setCategoryNameOverride = (categoryId: string, newName: string): void => {
  if (typeof window === 'undefined') return;
  const overrides = getCategoryNameOverrides();
  overrides[categoryId] = newName;
  try {
    localStorage.setItem(CATEGORY_NAME_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error("Error saving category name overrides to localStorage:", e);
  }
};

export const getOverriddenCategoryName = (categoryId: string, defaultName: string): string => {
  if (typeof window === 'undefined') return defaultName;
  const overrides = getCategoryNameOverrides();
  return overrides[categoryId] || defaultName;
};
