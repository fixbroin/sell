
      
"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Handshake, Banknote, UserPlus, SendToBack, Users } from "lucide-react";
import ReferralSettingsTab from '@/components/admin/referral/ReferralSettingsTab';
import WithdrawalSettingsTab from '@/components/admin/referral/WithdrawalSettingsTab';
import ReferralSignupsTab from "@/components/admin/referral/ReferralSignupsTab";
import WithdrawalRequestsTab from "@/components/admin/referral/WithdrawalRequestsTab";
import ReferralUsersTab from "@/components/admin/referral/ReferralUsersTab";
import { useAuth } from "@/hooks/useAuth";
import PermissionGuard from "@/components/admin/PermissionGuard";

export default function ReferralSettingsPage() {
  const { adminPermissions } = useAuth();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Handshake className="mr-2 h-6 w-6 text-primary" /> Referral &amp; Wallet System
          </CardTitle>
          <CardDescription>
            Configure your referral program, manage withdrawal settings, and track user activity.
          </CardDescription>
        </CardHeader>
      </Card>

      <PermissionGuard moduleId="referral_settings" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to modify referral settings. Contact Super Admin for access.</div>}>
        <Tabs defaultValue="referral_settings" className="w-full">
          <div className="relative mb-6">
            <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
              <TabsTrigger 
                value="referral_settings"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Handshake className="mr-2 h-4 w-4"/>Referral Settings
              </TabsTrigger>
              <TabsTrigger 
                value="withdrawal_settings"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Banknote className="mr-2 h-4 w-4"/>Withdrawal Settings
              </TabsTrigger>
              <TabsTrigger 
                value="referral_signups"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <UserPlus className="mr-2 h-4 w-4"/>Referral Signups
              </TabsTrigger>
              <TabsTrigger 
                value="referral_users"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Users className="mr-2 h-4 w-4"/>Users
              </TabsTrigger>
              <TabsTrigger 
                value="withdrawal_requests"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <SendToBack className="mr-2 h-4 w-4"/>Withdrawal Requests
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="referral_settings" className="mt-0 focus-visible:outline-none">
            <ReferralSettingsTab />
          </TabsContent>
          <TabsContent value="withdrawal_settings">
            <WithdrawalSettingsTab />
          </TabsContent>
          <TabsContent value="referral_signups">
            <ReferralSignupsTab />
          </TabsContent>
          <TabsContent value="referral_users">
            <ReferralUsersTab />
          </TabsContent>
          <TabsContent value="withdrawal_requests">
            <WithdrawalRequestsTab />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}

    