"use client";

import AppImage from '@/components/ui/AppImage';
import type { FirestoreCategory } from '@/types/firestore';
import { useState, useEffect, useCallback } from 'react';
import { getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext'; 
import { cn } from '@/lib/utils';

interface CategoryCardProps {
  category: FirestoreCategory;
  priority?: boolean;
  index?: number;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "category";
};

const CategoryCard: React.FC<CategoryCardProps> = ({ category, priority = false, index = 0 }) => {
  const router = useRouter();
  const { showLoading } = useLoading(); 
  const { user, triggerAuthRedirect } = useAuth();
  
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!category) return;
    const intendedHref = `/category/${category.slug}`;
    showLoading();
    if (!user) {
      triggerAuthRedirect(intendedHref);
      return;
    }
    router.push(intendedHref);
  }, [router, category?.slug, showLoading, user, triggerAuthRedirect]);

  if (!category) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-full bg-muted" />
        <Skeleton className="h-6 w-24 bg-muted" />
      </div>
    );
  }
  
  const displayName = category.name;
  const displayCategoryImageUrl = category.imageUrl && category.imageUrl.trim() !== '' ? category.imageUrl : "/default-image.png";
  const categoryAiHintValue = generateAiHint(category.imageHint, category.name);

  // Dynamic gradient based on index for variety
  const gradients = [
    "from-blue-500/20 to-teal-400/20 group-hover:from-blue-500/40 group-hover:to-teal-400/40",
    "from-purple-500/20 to-pink-400/20 group-hover:from-purple-500/40 group-hover:to-pink-400/40",
    "from-amber-500/20 to-orange-400/20 group-hover:from-amber-500/40 group-hover:to-orange-400/40",
    "from-emerald-500/20 to-cyan-400/20 group-hover:from-emerald-500/40 group-hover:to-cyan-400/40",
    "from-rose-500/20 to-indigo-400/20 group-hover:from-rose-500/40 group-hover:to-indigo-400/40"
  ];
  const activeGradient = gradients[index % gradients.length];

  return (
    <div 
      onClick={handleClick} 
      className="flex flex-col items-center group cursor-pointer transition-all duration-500"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as unknown as React.MouseEvent<HTMLDivElement>); }}
    >
      {/* Ultra-Premium Large Circular Container */}
      <div className="relative mb-4">
          {/* Outer Ambient Glow */}
          <div className={cn(
              "absolute inset-[-10px] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl",
              "bg-gradient-to-tr", activeGradient
          )} />
          
          <div className={cn(
            "relative w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-full flex items-center justify-center overflow-hidden transition-all duration-500",
            "bg-card border-2 border-border/40 shadow-lg group-hover:shadow-3xl group-hover:border-primary/60 group-hover:-translate-y-3",
            "before:absolute before:inset-0 before:bg-gradient-to-tr before:opacity-10 group-hover:before:opacity-20 before:transition-opacity",
            activeGradient
          )}>
            <div className="relative w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24">
                <AppImage
                    src={displayCategoryImageUrl}
                    alt={displayName || category.name}
                    fill
                    sizes="(max-width: 768px) 150px, 200px"
                    className="object-contain transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 drop-shadow-xl"
                    data-ai-hint={categoryAiHintValue}
                    priority={priority}
                    loading={priority ? "eager" : "lazy"}
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== "/default-image.png") {
                            target.src = "/default-image.png";
                        }
                    }}
                />
            </div>
            
            {/* Glossy Overlay Reflection */}
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/25 to-transparent rotate-45 group-hover:translate-x-[15%] group-hover:translate-y-[15%] transition-transform duration-1000" />
          </div>
      </div>

      {/* Bold Modern Typography */}
      <h3 className="text-sm sm:text-base md:text-xl font-black text-foreground text-center line-clamp-2 leading-tight px-2 group-hover:text-primary transition-all duration-300 transform group-hover:scale-110 tracking-tight max-w-[120px] sm:max-w-[140px] md:max-w-[160px]">
        {displayName}
      </h3>
    </div>
  );
};

export default CategoryCard;
