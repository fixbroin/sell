
"use client";

import React from 'react';
import AppImage from '@/components/ui/AppImage';
import { motion } from 'framer-motion';
import type { FirestoreService } from '@/types/firestore';

interface DashboardTrendingServiceCardProps {
  service: FirestoreService & { count: number };
  rank: number;
  maxCount: number;
}

const DashboardTrendingServiceCard: React.FC<DashboardTrendingServiceCardProps> = ({ service, rank, maxCount }) => {
  return (
    <div className="group flex items-center gap-3 p-2 md:p-2.5 rounded-xl border bg-card hover:bg-muted/50 transition-all border-border/60">
      <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden shrink-0 border border-muted shadow-inner">
        <AppImage 
          src={service.imageUrl || '/default-image.png'} 
          alt={service.name} 
          fill 
          sizes="(max-width: 768px) 40px, 48px" 
          className="object-cover transition-transform duration-500 group-hover:scale-110" 
        />
      </div>
      <div className="flex-grow min-w-0">
        <p className="font-bold text-[11px] leading-tight text-slate-800 dark:text-slate-200 line-clamp-2 mb-1">{service.name}</p>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-black text-primary uppercase tracking-tighter bg-primary/10 px-1.5 py-0.5 rounded-md">
            Rank #{rank}
          </span>
          <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
            {service.count} Booked
          </span>
        </div>
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }} 
            animate={{ width: `${(service.count / maxCount) * 100}%` }}
            className="h-full bg-primary"
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardTrendingServiceCard;
