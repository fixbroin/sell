
"use client";

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { BreadcrumbItem } from '@/types/ui';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className }) => {
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  // Generate BreadcrumbList JSON-LD Schema
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.label,
      "item": item.href ? `${baseUrl}${item.href}` : undefined
    }))
  };

  return (
    <>
      {baseUrl && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />
      )}
      <nav aria-label="Breadcrumb" className={cn("mb-4 sm:mb-6", className)}>
        <ol className="flex items-center space-x-1.5 text-xs sm:text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 bg-muted/70" />
              )}
              {item.href && index < items.length - 1 ? (
                <Link href={item.href} className="ml-1.5 hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className={cn(
                  "ml-1.5",
                  index === items.length - 1 ? "font-medium text-foreground" : ""
                )}>
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
};

export default Breadcrumbs;

