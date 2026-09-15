"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch } from "lucide-react";
import type { Referral } from '@/types/firestore'; 
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, collectionGroup, where, limit } from '@/lib/mysqlDb';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

interface ReferralUserRecord extends Referral {
    referrerName?: string;
    referrerCode?: string;
    referrerWalletBalance?: number;
    
    referredUserName?: string;
    referredUserEmail?: string;
    referredUserMobile?: string;
    referredUserWalletBalance?: number;
    
    bookingStatus?: string;
}

const formatDate = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};

export default function ReferralUsersTab() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [records, setRecords] = useState<ReferralUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const referralsRef = collection(db, "referrals");
    const q = query(referralsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedReferrals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referral));
      
      try {
        const enrichedDataPromises = fetchedReferrals.map(async (ref) => {
          let referrerName, referrerCode, referrerWalletBalance = 0;
          let referredUserName, referredUserEmail, referredUserMobile, referredUserWalletBalance = 0;
          let bookingStatus;
          
          // Fetch referrer details & wallet balance
          if(ref.referrerId) {
            const referrerSnap = await getDoc(doc(db, "users", ref.referrerId));
            if(referrerSnap.exists()) {
                referrerName = referrerSnap.data().displayName;
                referrerCode = referrerSnap.data().referralCode;
                referrerWalletBalance = referrerSnap.data().walletBalance || 0;
            }
          }
          
          // Fetch referred user details & wallet balance
          if(ref.referredUserId) {
            const referredUserSnap = await getDoc(doc(db, "users", ref.referredUserId));
            if(referredUserSnap.exists()) {
                referredUserName = referredUserSnap.data().displayName;
                referredUserEmail = referredUserSnap.data().email;
                referredUserMobile = referredUserSnap.data().mobileNumber;
                referredUserWalletBalance = referredUserSnap.data().walletBalance || 0;
            }
          }
          
          // Fetch booking status
          if(ref.bookingId) {
             const bookingQuery = query(collectionGroup(db, 'bookings'), where('bookingId', '==', ref.bookingId), limit(1));
             const bookingSnap = await getDocs(bookingQuery);
             if(!bookingSnap.empty) {
                 bookingStatus = bookingSnap.docs[0].data().status;
             }
          } else {
             const firstBookingQuery = query(collection(db, "bookings"), where("userId", "==", ref.referredUserId), orderBy("createdAt"), limit(1));
             const firstBookingSnap = await getDocs(firstBookingQuery);
             if(!firstBookingSnap.empty) {
                 bookingStatus = `Booked (${firstBookingSnap.docs[0].data().status})`;
             } else {
                 bookingStatus = "Not Booked Yet";
             }
          }

          return { 
            ...ref, 
            referrerName, 
            referrerCode, 
            referrerWalletBalance,
            referredUserName, 
            referredUserEmail, 
            referredUserMobile, 
            referredUserWalletBalance,
            bookingStatus 
          };
        });

        const enrichedRecords = await Promise.all(enrichedDataPromises);
        setRecords(enrichedRecords);

      } catch (error) {
        console.error("Error enriching referral users data:", error);
        toast({ title: "Data Error", description: "Could not fully load wallet balances.", variant: "destructive" });
        setRecords(fetchedReferrals as ReferralUserRecord[]);
      } finally {
        setIsLoading(false);
      }

    }, (error) => {
      console.error("Error fetching referral users list:", error);
      setIsLoading(false);
      toast({ title: "Error", description: "Could not fetch referral list.", variant: "destructive" });
    });

    return () => unsubscribe();
  }, [toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referred Users & Wallet Balances</CardTitle>
        <CardDescription>View all referred registrations, the link owners, and their current wallet balances.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
            <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No referral records found yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referred User (New Member)</TableHead>
                <TableHead>User Wallet Balance</TableHead>
                <TableHead>Referrer (Inviting Member)</TableHead>
                <TableHead>Referrer Wallet Balance</TableHead>
                <TableHead>Signup Date</TableHead>
                <TableHead>Booking Status</TableHead>
                <TableHead>Bonus Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(record => (
                 <TableRow key={record.id}>
                    <TableCell>
                        <div className="font-medium">{record.referredUserName || record.referredUserId}</div>
                        <div className="text-xs text-muted-foreground">{record.referredUserEmail || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">{record.referredUserMobile || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                        <span className="font-bold text-green-600">{symbol}{(record.referredUserWalletBalance || 0).toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                        <div className="font-medium">{record.referrerName || record.referrerId}</div>
                        <div className="text-xs text-muted-foreground">Code: {record.referrerCode || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                        <span className="font-bold text-green-600">{symbol}{(record.referrerWalletBalance || 0).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(record.createdAt)}</TableCell>
                    <TableCell><Badge variant="outline">{record.bookingStatus || 'N/A'}</Badge></TableCell>
                    <TableCell>
                        <Badge variant={record.status === 'completed' ? 'default' : record.status === 'failed' ? 'destructive' : 'secondary'} className={`capitalize ${record.status === 'completed' ? 'bg-green-500' : ''}`}>
                            {record.status}
                        </Badge>
                    </TableCell>
                 </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
