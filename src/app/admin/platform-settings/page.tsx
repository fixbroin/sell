
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Save, Loader2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { AppSettings, PlatformFeeSetting } from '@/types/firestore'; 
import { defaultAppSettings } from '@/config/appDefaults'; 
import PlatformSettingsForm from '@/components/admin/PlatformSettingsForm';
import PermissionGuard from '@/components/admin/PermissionGuard';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";

export default function AdminPlatformSettingsPage() {
  const { toast } = useToast();
  const [platformFees, setPlatformFees] = useState<PlatformFeeSetting[]>(defaultAppSettings.platformFees || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<AppSettings>;
        setPlatformFees(firestoreData.platformFees || defaultAppSettings.platformFees || []);
      } else {
        setPlatformFees(defaultAppSettings.platformFees || []);
      }
    } catch (e) {
      console.error("Failed to load platform fee settings:", e);
      toast({ title: "Error Loading Settings", description: "Could not load platform fee settings.", variant: "destructive" });
      setPlatformFees(defaultAppSettings.platformFees || []);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSavePlatformFees = async (updatedFees: PlatformFeeSetting[]) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      // We only update the platformFees part of the AppSettings and merge it.
      await setDoc(settingsDocRef, 
        { platformFees: updatedFees, updatedAt: Timestamp.now() }, 
        { merge: true }
      );
      await triggerRefresh('app-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      setPlatformFees(updatedFees); // Update local state to reflect saved data
      toast({
        title: "Platform Fees Saved",
        description: "Your platform fee configurations have been updated.",
      });
    } catch (e) {
      console.error("Failed to save platform fees to Firestore", e);
      toast({
        title: "Error Saving Settings",
        description: "Could not save platform fee settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading platform settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Platform Fees & Charges
          </CardTitle>
          <CardDescription>
            Define platform fees or other charges that can be applied to bookings. These are calculated on the subtotal of services.
          </CardDescription>
        </CardHeader>
      </Card>

      <PermissionGuard moduleId="platform_settings" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to modify platform fees. Contact Super Admin for access.</div>}>
        <PlatformSettingsForm
          initialFees={platformFees}
          onSave={handleSavePlatformFees}
          isSaving={isSaving}
        />
      </PermissionGuard>
    </div>
  );
}
