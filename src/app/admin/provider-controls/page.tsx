"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Settings, ListChecks, Languages, Paperclip, Power, MapPin, HandCoins, Banknote, FileText } from "lucide-react";
import ExperienceLevelManager from "@/components/admin/provider-controls/ExperienceLevelManager";
import SkillLevelManager from "@/components/admin/provider-controls/SkillLevelManager";
import QualificationManager from "@/components/admin/provider-controls/QualificationManager";
import LanguageManager from "@/components/admin/provider-controls/LanguageManager";
import AdditionalDocTypeManager from "@/components/admin/provider-controls/AdditionalDocTypeManager";
import ProviderRegistrationToggleTab from "@/components/admin/provider-controls/ProviderRegistrationToggleTab";
import ProviderFeesSetupTab from "@/components/admin/provider-controls/ProviderFeesSetupTab"; 
import WithdrawalSettingsTab from "@/components/admin/provider-controls/WithdrawalSettingsTab";
import ProviderTermsManager from "@/components/admin/provider-controls/ProviderTermsManager";
import { useAuth } from "@/hooks/useAuth";
import PermissionGuard from "@/components/admin/PermissionGuard";

export default function ProviderControlsPage() {
  const { adminPermissions } = useAuth();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Provider Registration & Payouts
          </CardTitle>
          <CardDescription>
            Manage options for provider registration forms, access, service fees, and withdrawals.
          </CardDescription>
        </CardHeader>
      </Card>

      <PermissionGuard moduleId="provider_controls" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to modify provider controls. Contact Super Admin for access.</div>}>
        <Tabs defaultValue="experience_levels" className="w-full">
          <div className="relative mb-6">
            <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
              <TabsTrigger 
                value="experience_levels"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <UserCheck className="mr-2 h-4 w-4"/>Experience
              </TabsTrigger>
              <TabsTrigger 
                value="skill_levels"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <ListChecks className="mr-2 h-4 w-4"/>Skills
              </TabsTrigger>
              <TabsTrigger 
                value="qualifications"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <ListChecks className="mr-2 h-4 w-4"/>Qualifications
              </TabsTrigger>
              <TabsTrigger 
                value="languages"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Languages className="mr-2 h-4 w-4"/>Languages
              </TabsTrigger>
              <TabsTrigger 
                value="additional_docs"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Paperclip className="mr-2 h-4 w-4"/>Additional Docs
              </TabsTrigger>
              <TabsTrigger 
                value="provider_fees"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <HandCoins className="mr-2 h-4 w-4"/>Provider Fees
              </TabsTrigger>
              <TabsTrigger 
                value="withdrawal_settings"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Banknote className="mr-2 h-4 w-4"/>Withdrawals
              </TabsTrigger>

              <TabsTrigger 
                value="registration_access"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Power className="mr-2 h-4 w-4"/>Registration
              </TabsTrigger>
              <TabsTrigger 
                value="terms_management"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <FileText className="mr-2 h-4 w-4"/>Terms
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="experience_levels" className="mt-0 focus-visible:outline-none">
            <ExperienceLevelManager />
          </TabsContent>
          <TabsContent value="skill_levels">
            <SkillLevelManager />
          </TabsContent>
          <TabsContent value="qualifications">
            <QualificationManager />
          </TabsContent>
          <TabsContent value="languages">
            <LanguageManager />
          </TabsContent>
          <TabsContent value="additional_docs">
            <AdditionalDocTypeManager />
          </TabsContent>
          <TabsContent value="provider_fees">
            <ProviderFeesSetupTab />
          </TabsContent>
          <TabsContent value="withdrawal_settings">
            <WithdrawalSettingsTab />
          </TabsContent>

          <TabsContent value="registration_access">
            <ProviderRegistrationToggleTab />
          </TabsContent>
          <TabsContent value="terms_management">
            <ProviderTermsManager />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}
