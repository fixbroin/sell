
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, Hourglass, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Referral, EnrichedReferral } from '@/types/firestore';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

const formatDate = (timestamp?: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return formatDateInTimezone(date, 'Asia/Kolkata');
};

// Define a type for combined history items for clarity
type WalletHistoryItem = {
    id: string;
    type: 'earned' | 'welcome';
    userName: string; // Name of the referred user, or "Welcome Bonus"
    amount: number;
    date: any; // Firestore Timestamp
};

export default function WalletTab() {
  const { firestoreUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [walletHistory, setWalletHistory] = useState<WalletHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  useEffect(() => {
    if (!firestoreUser?.id) {
        setIsLoadingHistory(false);
        return;
    }
    setIsLoadingHistory(true);
    
    // Query for bonuses earned by referring others
    const earnedBonusQuery = query(
        collection(db, "referrals"), 
        where("referrerId", "==", firestoreUser.id),
        where("status", "==", "completed")
    );

    // Query for the welcome bonus this user received
    const welcomeBonusQuery = query(
        collection(db, "referrals"),
        where("referredUserId", "==", firestoreUser.id)
    );

    const unsubscribeEarned = onSnapshot(earnedBonusQuery, async (earnedSnapshot) => {
        const earnedPromises = earnedSnapshot.docs.map(async (docSnap) => {
            const refData = docSnap.data() as Referral;
            const referredUserDoc = await getDoc(doc(db, "users", refData.referredUserId));
            const referredUserName = referredUserDoc.exists() ? referredUserDoc.data().displayName : "A User";
            return {
                id: docSnap.id,
                type: 'earned' as const,
                userName: referredUserName || 'A User',
                amount: refData.referrerBonus,
                date: refData.updatedAt || refData.createdAt,
            };
        });
        
        // This part runs every time either query returns new data
        Promise.all([Promise.all(earnedPromises), getDocs(welcomeBonusQuery)]).then(([earnedBonuses, welcomeSnapshot]) => {
             const combinedHistory: WalletHistoryItem[] = [...earnedBonuses];
             
             if (!welcomeSnapshot.empty) {
                const welcomeData = welcomeSnapshot.docs[0].data() as Referral;
                if (welcomeData.referredBonus > 0) {
                     combinedHistory.push({
                        id: welcomeSnapshot.docs[0].id,
                        type: 'welcome' as const,
                        userName: "Welcome Bonus",
                        amount: welcomeData.referredBonus,
                        date: welcomeData.createdAt,
                    });
                }
             }

             // Sort combined history by date, descending
             combinedHistory.sort((a,b) => getTimestampMillis(b.date) - getTimestampMillis(a.date));

             setWalletHistory(combinedHistory);
             setIsLoadingHistory(false);
        });
    });

    // We also listen to the welcome bonus query separately in case it's created later
    const unsubscribeWelcome = onSnapshot(welcomeBonusQuery, () => {
        // The main listener above will re-run and re-combine everything,
        // so we don't need to duplicate logic here. This just ensures updates are caught.
    });


    return () => {
        unsubscribeEarned();
        unsubscribeWelcome();
    };
  }, [firestoreUser?.id]);

  if (authIsLoading) {
    return <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  
  if (!firestoreUser) {
    return <p>Please log in to see your wallet details.</p>;
  }

  const walletBalance = firestoreUser.walletBalance || 0;
  const pendingBalance = firestoreUser.pendingWalletBalance || 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-green-500/10 border-green-500/30">
          <CardHeader>
            <CardTitle className="text-lg text-green-700 flex items-center">
              <Wallet className="mr-2 h-5 w-5" /> Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{symbol}{walletBalance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Available for withdrawal.</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-700 flex items-center">
              <Hourglass className="mr-2 h-5 w-5" /> Pending Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{symbol}{pendingBalance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">From referrals with pending first bookings.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5"/>Bonus History</CardTitle>
          <CardDescription>A log of your successfully earned bonuses.</CardDescription>
        </CardHeader>
        <CardContent>
           {isLoadingHistory ? (
                <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div>
           ) : walletHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">You have not earned any referral bonuses yet.</p>
           ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Bonus Amount</TableHead>
                            <TableHead>Date Credited</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {walletHistory.map(item => (
                             <TableRow key={item.id}>
                                <TableCell>
                                    {item.type === 'welcome' ? 
                                        <span className="font-medium">{item.userName}</span> : 
                                        <span>Bonus for referring <span className="font-medium">{item.userName}</span></span>
                                    }
                                </TableCell>
                                <TableCell>
                                    <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                        + {symbol}{item.amount.toFixed(2)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{formatDate(item.date)}</TableCell>
                             </TableRow>
                        ))}
                    </TableBody>
                </Table>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
