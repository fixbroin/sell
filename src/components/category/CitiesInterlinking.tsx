"use client";

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getCategorySearchTerm } from '@/lib/seoAdvancedUtils';
import { MapPinned } from 'lucide-react';

interface City {
  id: string;
  name: string;
  slug: string;
}

interface CitiesInterlinkingProps {
  categoryName: string;
  categorySlug: string;
  cities: City[];
}

export default function CitiesInterlinking({ 
  categoryName, 
  categorySlug, 
  cities
}: CitiesInterlinkingProps) {
  if (!cities || cities.length === 0) return null;

  const searchTerm = getCategorySearchTerm(categoryName);

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center gap-2 mb-6">
        <MapPinned className="h-5 w-5 text-primary" />
        <h2 className="text-xl md:text-2xl font-headline font-semibold text-foreground">
          {searchTerm} in Major Cities
        </h2>
      </div>
      
      <div className="flex flex-wrap gap-2 md:gap-3">
        {cities.map((city) => (
          <Link 
            key={city.id} 
            href={`/${city.slug}/category/${categorySlug}`}
          >
            <Badge 
              variant="outline" 
              className="px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary transition-all cursor-pointer bg-card"
            >
              {searchTerm} in {city.name}
            </Badge>
          </Link>
        ))}
      </div>
      
      <p className="mt-4 text-xs text-muted-foreground italic">
        Yourbrand provides expert {searchTerm.toLowerCase()} services across all major cities in India.
      </p>
    </div>
  );
}
