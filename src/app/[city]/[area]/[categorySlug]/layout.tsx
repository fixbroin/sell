import type { Metadata, ResolvingMetadata } from 'next';
import React from 'react';

interface AreaCategoryPageLayoutProps {
  params: Promise<{ city: string; area: string; categorySlug: string }>;
  children: React.ReactNode;
}

export default function AreaCategoryLayout({ children }: AreaCategoryPageLayoutProps) {
  return <>{children}</>;
}
