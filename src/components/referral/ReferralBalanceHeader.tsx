// src/components/referral/ReferralBalanceHeader.tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

export default function ReferralBalanceHeader() {
  const { firestoreUser, isLoading } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  if (isLoading) {
    return <Skeleton className="h-10 w-32 rounded-full" />;
  }

  const balance = firestoreUser?.walletBalance || 0;

  return (
    <Badge variant="outline" className="h-10 px-4 rounded-full border-green-200 bg-green-50 flex items-center gap-2 group transition-all hover:border-green-300">
      <Wallet className="h-4 w-4 text-green-600 group-hover:scale-110 transition-transform" />
      <div className="flex flex-col items-start leading-none">
        <span className="text-[10px] uppercase text-green-600 font-bold tracking-tighter">Your Wallet</span>
        <span className="text-sm font-black text-green-700">{symbol}{balance.toFixed(2)}</span>
      </div>
    </Badge>
  );
}
