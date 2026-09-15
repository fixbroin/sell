
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Gift, Loader2, IndianRupee, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getBaseUrl } from '@/lib/config';
import type { ReferralSettings, Referral, EnrichedReferral } from '@/types/firestore';
import { doc, getDoc, collection, query, where, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import AppImage from '@/components/ui/AppImage';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';


const formatDate = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};


interface ReferralInfoTabProps {
  settings: ReferralSettings | null;
}

export default function ReferralInfoTab({ settings }: ReferralInfoTabProps) {
  const { firestoreUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const { toast } = useToast();
  const [referralLink, setReferralLink] = useState('');
  const [referralHistory, setReferralHistory] = useState<EnrichedReferral[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (firestoreUser?.referralCode) {
      setReferralLink(`${getBaseUrl()}/auth/signup?ref=${firestoreUser.referralCode}`);
    }
  }, [firestoreUser?.referralCode]);

  useEffect(() => {
    if (!firestoreUser?.id) {
        setIsLoadingHistory(false);
        return;
    }
    setIsLoadingHistory(true);
    const q = query(collection(db, "referrals"), where("referrerId", "==", firestoreUser.id));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const refs: EnrichedReferral[] = [];
        for (const docSnap of snapshot.docs) {
            const refData = docSnap.data() as Referral;
            const referredUserDoc = await getDoc(doc(db, "users", refData.referredUserId));
            const referredUserName = referredUserDoc.exists() ? referredUserDoc.data().displayName : "A User";
            refs.push({ ...refData, id: docSnap.id, referredUserName });
        }
        setReferralHistory(refs);
        setIsLoadingHistory(false);
    });
    return () => unsubscribe();
  }, [firestoreUser?.id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ description: "Copied to clipboard!" });
    });
  };

  if (authIsLoading) {
    return <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  
  if (!firestoreUser) {
    return <p>Please log in to see your referral details.</p>;
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Referral program details are currently unavailable.
        </CardContent>
      </Card>
    )
  }

  const referrerBonusDisplay = settings.bonusType === 'percentage' 
    ? `${settings.referrerBonus}%` 
    : `${symbol}${settings.referrerBonus || 0}`;

  const referredBonusDisplay = settings.bonusType === 'percentage' 
    ? `${settings.referredUserBonus}%` 
    : `${symbol}${settings.referredUserBonus || 0}`;

  const shareMessage = `Hey! I've been using Yourbrand for my home services and they are excellent. You should try them too! Sign up using my link you'll get a ${referredBonusDisplay} welcome reward in your wallet immediately! 🏠🛠️\n\nJoin here: ${referralLink}`;
  const codeShareMessage = `Hey! Use my referral code: ${firestoreUser?.referralCode} on Yourbrand to get a ${referredBonusDisplay} welcome bonus in your wallet! 🏠🛠️\n\nJoin here: ${referralLink}`;

  const shareOnWhatsApp = () => {
    const encodedMessage = encodeURIComponent(shareMessage);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <CardTitle className="text-xl">Refer & Earn</CardTitle>
          <CardDescription>Share your code and link with friends. When they sign up and complete their first qualifying booking, you both get a bonus!</CardDescription>
        </CardHeader>
        {settings.minBookingValueForBonus > 0 && (
          <CardFooter>
             <Alert variant="default" className="text-xs w-full bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600"/>
                <AlertDescription className="text-blue-700">
                    You will receive your referral bonus once your friend completes their first booking of minimum value <span className="font-semibold">{symbol}{settings.minBookingValueForBonus}</span>.
                </AlertDescription>
            </Alert>
          </CardFooter>
        )}
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="p-3 bg-primary/10 rounded-lg text-center">
                <p className="text-muted-foreground">Invite friends & Earn</p>
                <p className="text-3xl font-bold text-primary">{referrerBonusDisplay}</p>
            </div>
             <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-muted-foreground">Your friend gets</p>
                <p className="text-3xl font-bold text-secondary-foreground">{referredBonusDisplay}</p>
            </div>
        </CardContent>
        
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Gift className="mr-2 h-5 w-5 text-primary" />Your Referral Details</CardTitle>
          <CardDescription>Share your code or link with your friends. When they sign up via Google or Mobile Number, you both get rewarded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium">Your Unique Referral Code</label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                readOnly
                value={firestoreUser.referralCode || 'Generating...'}
                className="font-mono text-lg bg-muted h-11"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                onClick={() => copyToClipboard(codeShareMessage)}
                disabled={!firestoreUser.referralCode}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <label className="text-sm font-medium">Ready-to-Share Invite</label>
            <div className="bg-muted p-4 rounded-lg text-sm italic text-muted-foreground border border-dashed border-primary/30 relative">
                {shareMessage}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => copyToClipboard(shareMessage)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy Message
                </Button>
                <Button variant="default" size="sm" className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white border-none" onClick={shareOnWhatsApp}>
                    <AppImage src="/whatsapp.png" alt="WA" width={18} height={18} className="mr-2" /> Share on WhatsApp
                </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
          <CardDescription>Track the status of your referrals.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingHistory ? (
                <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div>
            ) : referralHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">You haven't referred anyone yet.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Referred User</TableHead>
                            <TableHead>Signup Date</TableHead>
                            <TableHead>Bonus Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {referralHistory.map((ref, index) => (
                            <TableRow key={ref.id || index}>
                                <TableCell>{ref.referredUserName || 'A User'}</TableCell>
                                <TableCell className="text-xs">{formatDate(ref.createdAt)}</TableCell>
                                <TableCell>
                                    <Badge variant={ref.status === 'completed' ? 'default' : 'secondary'} className={`capitalize ${ref.status === 'completed' ? 'bg-green-500' : ''}`}>
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
    </div>
  );
}
