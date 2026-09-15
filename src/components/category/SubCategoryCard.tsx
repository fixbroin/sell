
"use client";

import { Button } from "@/components/ui/button";
import type { FirestoreSubCategory } from '@/types/firestore';
import AppImage from '@/components/ui/AppImage';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';

const DEFAULT_FALLBACK_SUB_CATEGORY_ICON = "/default-image.png";

interface SubCategoryCardProps {
  subCategory: FirestoreSubCategory;
  isActive: boolean;
  onClick: () => void;
}

export default function SubCategoryCard({ subCategory, isActive, onClick }: SubCategoryCardProps) {
  const displayImageUrl = subCategory.imageUrl && subCategory.imageUrl.trim() !== '' 
    ? subCategory.imageUrl 
    : DEFAULT_FALLBACK_SUB_CATEGORY_ICON;

  return (
    <Button
      variant={isActive ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-start h-full p-2 gap-1.5 w-24 md:w-28 transition-all duration-200 ease-in-out transform hover:scale-105",
        "min-h-[110px] md:min-h-[120px]"
      )}
      aria-pressed={isActive}
    >
      <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-md overflow-hidden mb-1 flex-shrink-0 bg-muted/50">
        <AppImage 
          src={displayImageUrl}
          alt={subCategory.name}
          fill
          sizes="(max-width: 768px) 48px, 56px"
          className="object-cover"
          data-ai-hint={subCategory.imageHint || "sub-category icon"}
          fallbackSrc={DEFAULT_FALLBACK_SUB_CATEGORY_ICON}
        />
      </div>
      <span className="text-xs text-center leading-tight font-semibold break-words whitespace-normal line-clamp-3">
        {subCategory.name}
      </span>
    </Button>
  );
}
