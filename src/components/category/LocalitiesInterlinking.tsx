"use client";

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getCategorySearchTerm } from '@/lib/seoAdvancedUtils';
import { MapPin } from 'lucide-react';

interface Area {
  id: string;
  name: string;
  slug: string;
}

interface LocalitiesInterlinkingProps {
  categoryName: string;
  categorySlug: string;
  citySlug: string;
  cityName: string;
  areas: Area[];
  currentAreaSlug?: string;
}

export default function LocalitiesInterlinking({ 
  categoryName, 
  categorySlug, 
  citySlug, 
  cityName,
  areas,
  currentAreaSlug 
}: LocalitiesInterlinkingProps) {
  if (!areas || areas.length === 0) return null;

  const searchTerm = getCategorySearchTerm(categoryName);

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center gap-2 mb-6">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="text-xl md:text-2xl font-headline font-semibold text-foreground">
          {searchTerm} in Other Areas of {cityName}
        </h2>
      </div>
      
      <div className="flex flex-wrap gap-2 md:gap-3">
        {areas.map((area) => {
          if (area.slug === currentAreaSlug) return null;
          
          return (
            <Link 
              key={area.id} 
              href={`/${citySlug}/${area.slug}/${categorySlug}`}
            >
              <Badge 
                variant="outline" 
                className="px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary transition-all cursor-pointer bg-card"
              >
                {searchTerm} in {area.name}
              </Badge>
            </Link>
          );
        })}
      </div>
      
      <p className="mt-4 text-xs text-muted-foreground italic">
        Yourbrand provides verified {searchTerm.toLowerCase()} experts across all major localities in {cityName}.
      </p>
    </div>
  );
}
