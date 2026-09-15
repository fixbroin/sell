
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';

export interface AdminStats {
  completedRevenue: number;
  totalBookings: number;
  completedBookings: number;
  activeUsers: number;
  newSignups30d: number;
  earnedCommission: number;
  totalDiscountGiven?: number;
  updatedAt?: any;
}

export function useAdminStats() {
  const [stats, setStats] = useState<AdminStats>({
    completedRevenue: 0,
    totalBookings: 0,
    completedBookings: 0,
    activeUsers: 0,
    newSignups30d: 0,
    earnedCommission: 0,
    totalDiscountGiven: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const statsDocRef = doc(db, "appConfiguration", "stats");

    const unsubscribe = onSnapshot(statsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats({
          completedRevenue: data.totalRevenue || 0,
          totalBookings: data.totalBookings || 0,
          completedBookings: data.completedBookings || 0,
          activeUsers: data.totalUsers || 0,
          newSignups30d: data.newSignups30d || 0,
          earnedCommission: data.earnedCommission || 0,
          totalDiscountGiven: data.totalDiscountGiven || 0,
          updatedAt: data.updatedAt,
        });
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching admin stats:", err);
      setError("Failed to load statistics.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { stats, isLoading, error };
}
