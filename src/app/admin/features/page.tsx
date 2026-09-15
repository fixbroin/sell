
"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tv, ListChecks, LayoutGrid, Image as ImageIconLucide } from "lucide-react";
import SectionsControlTab from '@/components/admin/features/SectionsControlTab';
import CategoryDisplayTab from '@/components/admin/features/CategoryDisplayTab';
import AdsManagementTab from '@/components/admin/features/AdsManagementTab';
import type { FirestoreCategory, FirestoreService } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import PermissionGuard from '@/components/admin/PermissionGuard';

export default function FeaturesPage() {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const catQuery = query(collection(db, "adminCategories"), orderBy("name", "asc"));
        const servQuery = query(collection(db, "adminServices"), orderBy("name", "asc"));

        const [catSnap, servSnap] = await Promise.all([getDocs(catQuery), getDocs(servQuery)]);

        setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreCategory)));
        setServices(servSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreService)));

      } catch (error) {
        console.error("Error fetching categories/services for Ads Management:", error);
        toast({ title: "Error Loading Data", description: "Could not load categories or services needed for ad targeting.", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchData();
  }, [toast]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Tv className="mr-2 h-6 w-6 text-primary" /> Homepage Features & Layout
          </CardTitle>
          <CardDescription>
            Control which sections appear on your homepage, manage category visibility for specific displays, and configure ad banners.
          </CardDescription>
        </CardHeader>
      </Card>

      <PermissionGuard moduleId="features" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to modify homepage features. Contact Super Admin for access.</div>}>
        <Tabs defaultValue="sections_control" className="w-full">
          <div className="relative mb-6">
            <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
              <TabsTrigger 
                value="sections_control"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <LayoutGrid className="mr-2 h-4 w-4"/>Sections Control
              </TabsTrigger>
              <TabsTrigger 
                value="category_display"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <ListChecks className="mr-2 h-4 w-4"/>Homepage Categories
              </TabsTrigger>
              <TabsTrigger 
                value="ads_management"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <ImageIconLucide className="mr-2 h-4 w-4"/>Ad Banners
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sections_control" className="mt-0 focus-visible:outline-none">
            <SectionsControlTab />
          </TabsContent>

          <TabsContent value="category_display">
            <CategoryDisplayTab />
          </TabsContent>

          <TabsContent value="ads_management">
            <AdsManagementTab
              allCategories={categories}
              allServices={services}
              isLoadingPrerequisites={isLoadingData}
            />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}
