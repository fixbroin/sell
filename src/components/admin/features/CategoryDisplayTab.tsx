
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, query, orderBy, getDocs } from '@/lib/mysqlDb';
import type { FeaturesConfiguration, FirestoreCategory } from '@/types/firestore';
import AppImage from '@/components/ui/AppImage';
import { triggerRefresh } from '@/lib/revalidateUtils';

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

interface CategoryVisibilityState {
  [categoryId: string]: boolean;
}

export default function CategoryDisplayTab() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>([]);
  const [categoryVisibility, setCategoryVisibility] = useState<CategoryVisibilityState>({});

  const loadSettingsAndCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all categories
      const categoriesQuery = query(collection(db, "adminCategories"), orderBy("order", "asc"));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      const fetchedCategories = categoriesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
      setAllCategories(fetchedCategories);

      // Fetch current visibility settings
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      const docSnap = await getDoc(configDocRef);
      let initialVisibility: CategoryVisibilityState = {};
      if (docSnap.exists()) {
        const data = docSnap.data() as FeaturesConfiguration;
        initialVisibility = data.homepageCategoryVisibility || {};
      }

      // Initialize visibility state, defaulting to true if not set
      const visibilityState: CategoryVisibilityState = {};
      fetchedCategories.forEach(cat => {
        visibilityState[cat.id] = initialVisibility[cat.id] === undefined ? true : initialVisibility[cat.id];
      });
      setCategoryVisibility(visibilityState);

    } catch (error) {
      console.error("Error loading data for category display tab:", error);
      toast({ title: "Error", description: "Could not load category settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettingsAndCategories();
  }, [loadSettingsAndCategories]);

  const handleToggleCategory = (categoryId: string, checked: boolean) => {
    setCategoryVisibility(prev => ({ ...prev, [categoryId]: checked }));
  };

  const handleSaveCategoryVisibility = async () => {
    setIsSaving(true);
    try {
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      await setDoc(configDocRef, { homepageCategoryVisibility: categoryVisibility, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Homepage category visibility saved." });
    } catch (error) {
      console.error("Error saving category visibility:", error);
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center"><ListChecks className="mr-2 h-5 w-5"/>Homepage Category Display</CardTitle><CardDescription>Control which categories appear in the "Category-wise Services" section on the homepage.</CardDescription></CardHeader>
        <CardContent className="space-y-4 p-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center"><ListChecks className="mr-2 h-5 w-5"/>Homepage Category Display</CardTitle>
        <CardDescription>Control which categories appear in the "Category-wise Services" section on the homepage.</CardDescription>
      </CardHeader>
      <CardContent>
        {allCategories.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No categories found. Please add categories in the "Categories" section first.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Image</TableHead>
                <TableHead>Category Name</TableHead>
                <TableHead className="text-center">Show on Homepage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    {category.imageUrl ? (
                      <div className="w-10 h-10 relative rounded-md overflow-hidden">
                        <AppImage src={category.imageUrl} alt={category.name} fill sizes="40px" className="object-cover" aiHint={category.imageHint || "category"}/>
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">No Img</div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={categoryVisibility[category.id] === undefined ? true : categoryVisibility[category.id]}
                      onCheckedChange={(checked) => handleToggleCategory(category.id, checked)}
                      disabled={isSaving}
                      aria-label={`Toggle homepage visibility for ${category.name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveCategoryVisibility} disabled={isSaving || allCategories.length === 0}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Category Display Settings
        </Button>
      </CardFooter>
    </Card>
  );
}

    