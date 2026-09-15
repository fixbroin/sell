
"use client";

import type { PropsWithChildren } from 'react';
import React, { createContext, useState, useContext, useCallback } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  showLoading: () => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);

  const showLoading = useCallback(() => {
    console.log("GlobalActionLoader: showLoading called");
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    console.log("GlobalActionLoader: hideLoading called");
    setIsLoading(false);
  }, []);

  const value = { isLoading, showLoading, hideLoading };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

