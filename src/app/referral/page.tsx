import { adminDb } from '@/lib/firebaseAdmin';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Handshake, Wallet, Banknote, ShieldOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import ReferralInfoTab from '@/components/referral/ReferralInfoTab';
import WalletTab from '@/components/referral/WalletTab';
import WithdrawalTab from '@/components/referral/WithdrawalTab';
import ReferralBalanceHeader from '@/components/referral/ReferralBalanceHeader';
import type { ReferralSettings, WithdrawalSettings } from '@/types/firestore';
import { unstable_cache } from 'next/cache';

const REFERRAL_CONFIG_DOC_ID = "referral";
const WITHDRAWAL_CONFIG_DOC_ID = "withdrawal_referral";
const CONFIG_COLLECTION = "appConfiguration";

export const revalidate = false;

import { serializeFirestoreData } from '@/lib/serializeUtils';

const getReferralSettings = unstable_cache(
  async () => {
    try {
      const referralRef = adminDb.collection(CONFIG_COLLECTION).doc(REFERRAL_CONFIG_DOC_ID);
      const referralSnap = await referralRef.get();
      return referralSnap.exists ? serializeFirestoreData<ReferralSettings>(referralSnap.data()) : null;
    } catch (error) {
      console.error("Error fetching referral settings:", error);
      return null;
    }
  },
  ['referral-settings'],
  { tags: ['config', 'referral-config', 'global-cache'] }
);

const getWithdrawalSettings = unstable_cache(
  async () => {
    try {
      const withdrawalRef = adminDb.collection(CONFIG_COLLECTION).doc(WITHDRAWAL_CONFIG_DOC_ID);
      const withdrawalSnap = await withdrawalRef.get();
      if (withdrawalSnap.exists) {
        return serializeFirestoreData<WithdrawalSettings>(withdrawalSnap.data());
      }
      // Return default settings if document doesn't exist
      return {
        isWithdrawalEnabled: false,
        minWithdrawalAmount: 200,
        enabledMethods: {
          amazon_gift_card: false,
          bank_transfer: true,
          upi: true,
        }
      } as WithdrawalSettings;
    } catch (error) {
      console.error("Error fetching withdrawal settings:", error);
      return null;
    }
  },
  ['withdrawal-referral-settings'],
  { tags: ['config', 'withdrawal-referral-config', 'global-cache'] }
);


export default async function ReferralPage() {
  const [referralSettings, withdrawalSettings] = await Promise.all([
    getReferralSettings(),
    getWithdrawalSettings()
  ]);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Profile", href: "/profile" },
    { label: "Refer & Earn" },
  ];

  if (!referralSettings?.isReferralSystemEnabled) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="text-center py-20 bg-card rounded-3xl border border-border/50 shadow-sm mt-8">
          <CardHeader>
            <ShieldOff className="mx-auto h-20 w-20 text-muted-foreground/50 mb-6" />
            <CardTitle className="text-3xl font-headline font-bold">Referral Program Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Our referral program is temporarily disabled. Please check back later for exciting rewards!
            </p>
            <Link href="/" passHref className="mt-8 inline-block">
              <Button size="lg" className="rounded-full px-10">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        
        <div className="mt-8 mb-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
                <h1 className="text-4xl md:text-5xl font-headline font-bold text-foreground mb-4 flex items-center gap-4">
                    <Handshake className="h-10 w-10 text-primary" />
                    Refer & Earn
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl">
                    Share the Yourbrand experience with your friends and earn rewards. Track your earnings and manage your wallet here.
                </p>
            </div>
            <div className="shrink-0">
                <ReferralBalanceHeader />
            </div>
        </div>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-10 h-14 p-1 bg-muted/50 rounded-2xl">
            <TabsTrigger value="info" className="rounded-xl font-bold transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Handshake className="mr-2 h-5 w-5"/>Info
            </TabsTrigger>
            <TabsTrigger value="wallet" className="rounded-xl font-bold transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Wallet className="mr-2 h-5 w-5"/>Wallet
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="rounded-xl font-bold transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Banknote className="mr-2 h-5 w-5"/>Withdraw
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <TabsContent value="info" className="focus-visible:outline-none focus-visible:ring-0">
                <ReferralInfoTab settings={referralSettings} />
            </TabsContent>
            <TabsContent value="wallet" className="focus-visible:outline-none focus-visible:ring-0">
                <WalletTab />
            </TabsContent>
            <TabsContent value="withdraw" className="focus-visible:outline-none focus-visible:ring-0">
                {withdrawalSettings && <WithdrawalTab settings={withdrawalSettings} />}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
