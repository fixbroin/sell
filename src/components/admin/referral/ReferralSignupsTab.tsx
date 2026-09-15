
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch } from "lucide-react";
import type { Referral, FirestoreUser, FirestoreBooking } from '@/types/firestore'; 
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where, getDocs, doc, getDoc, collectionGroup, limit } from '@/lib/mysqlDb';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

interface EnrichedReferral extends Referral {
    referrerName?: string;
    referrerCode?: string;
    referredUserName?: string;
    referredUserEmail?: string;
    referredUserMobile?: string;
    bookingStatus?: string;
}

const formatDate = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};

export default function ReferralSignupsTab() {
  const [referrals, setReferrals] = useState<EnrichedReferral[]>([]);
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
          let referrerName, referrerCode, referredUserName, referredUserEmail, referredUserMobile, bookingStatus;
          
          // Fetch referrer details
          if(ref.referrerId) {
            const referrerSnap = await getDoc(doc(db, "users", ref.referrerId));
            if(referrerSnap.exists()) {
                referrerName = referrerSnap.data().displayName;
                referrerCode = referrerSnap.data().referralCode;
            }
          }
          
          // Fetch referred user details
          if(ref.referredUserId) {
            const referredUserSnap = await getDoc(doc(db, "users", ref.referredUserId));
            if(referredUserSnap.exists()) {
                referredUserName = referredUserSnap.data().displayName;
                referredUserEmail = referredUserSnap.data().email;
                referredUserMobile = referredUserSnap.data().mobileNumber;
            }
          }

          // Fetch booking status if bookingId exists
          if(ref.bookingId) {
             // Firestore does not support collectionGroup queries with 'in' or '!='.
             // We have to query by the bookingId which we now store on the referral doc.
             const bookingQuery = query(collectionGroup(db, 'bookings'), where('bookingId', '==', ref.bookingId), limit(1));
             const bookingSnap = await getDocs(bookingQuery);
             if(!bookingSnap.empty) {
                 bookingStatus = bookingSnap.docs[0].data().status;
             }
          } else {
             // Check if user has ANY booking to display status
             const firstBookingQuery = query(collection(db, "bookings"), where("userId", "==", ref.referredUserId), orderBy("createdAt"), limit(1));
             const firstBookingSnap = await getDocs(firstBookingQuery);
             if(!firstBookingSnap.empty) {
                 bookingStatus = `Booked (${firstBookingSnap.docs[0].data().status})`;
             } else {
                 bookingStatus = "Not Booked Yet";
             }
          }

          return { ...ref, referrerName, referrerCode, referredUserName, referredUserEmail, referredUserMobile, bookingStatus };
        });

        const enrichedReferrals = await Promise.all(enrichedDataPromises);
        setReferrals(enrichedReferrals);

      } catch (error) {
        console.error("Error enriching referral data:", error);
        toast({ title: "Data Error", description: "Could not fully load referral details.", variant: "destructive" });
        setReferrals(fetchedReferrals as EnrichedReferral[]); // Show basic data on error
      } finally {
        setIsLoading(false);
      }

    }, (error) => {
      console.error("Error fetching referrals:", error);
      setIsLoading(false);
      toast({ title: "Error", description: "Could not fetch referral list.", variant: "destructive" });
    });

    return () => unsubscribe();
  }, [toast]);


  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral Signups</CardTitle>
        <CardDescription>Users who have signed up using a referral code.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
            <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No referral signups found yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referred User</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead>Signup Date</TableHead>
                <TableHead>Booking Status</TableHead>
                <TableHead>Bonus Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map(ref => (
                 <TableRow key={ref.id}>
                    <TableCell>
                        <div className="font-medium">{ref.referredUserName || ref.referredUserId}</div>
                        <div className="text-xs text-muted-foreground">{ref.referredUserEmail || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">{ref.referredUserMobile || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                        <div>{ref.referrerName || ref.referrerId}</div>
                        <div className="text-xs text-muted-foreground">{ref.referrerCode || 'N/A'}</div>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(ref.createdAt)}</TableCell>
                    <TableCell><Badge variant="outline">{ref.bookingStatus || 'N/A'}</Badge></TableCell>
                    <TableCell>
                        <Badge variant={ref.status === 'completed' ? 'default' : ref.status === 'failed' ? 'destructive' : 'secondary'} className={`capitalize ${ref.status === 'completed' ? 'bg-green-500' : ''}`}>
                            {ref.status}
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
