
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Settings, ListChecks, Languages, Paperclip, Power, MapPin } from "lucide-react";
import ExperienceLevelManager from "@/components/admin/provider-controls/ExperienceLevelManager";
import SkillLevelManager from "@/components/admin/provider-controls/SkillLevelManager";
import QualificationManager from "@/components/admin/provider-controls/QualificationManager";
import LanguageManager from "@/components/admin/provider-controls/LanguageManager";
import OptionalDocTypeManager from "@/components/admin/provider-controls/OptionalDocTypeManager";
import ProviderRegistrationToggleTab from "@/components/admin/provider-controls/ProviderRegistrationToggleTab";

export default function ProviderControlsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Provider Registration Controls
          </CardTitle>
          <CardDescription>
            Manage options for provider registration forms and toggle registration access.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="experience_levels" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="experience_levels"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <UserCheck className="mr-2 h-4 w-4"/>Experience Levels
            </TabsTrigger>
            <TabsTrigger 
              value="skill_levels"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ListChecks className="mr-2 h-4 w-4"/>Skill Levels
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
              value="optional_docs"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Paperclip className="mr-2 h-4 w-4"/>Optional Docs
            </TabsTrigger>
            <TabsTrigger 
              value="registration_access"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Power className="mr-2 h-4 w-4"/>Registration Access
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
        <TabsContent value="optional_docs">
          <OptionalDocTypeManager />
        </TabsContent>
        <TabsContent value="registration_access">
          <ProviderRegistrationToggleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
