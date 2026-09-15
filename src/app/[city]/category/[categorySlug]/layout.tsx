import type { Metadata, ResolvingMetadata } from 'next';
import React from 'react';

interface CityCategoryPageLayoutProps {
  params: Promise<{ city: string; categorySlug: string }>;
  children: React.ReactNode;
}

export default function CityCategoryLayout({ children }: CityCategoryPageLayoutProps) {
  return <>{children}</>;
}
