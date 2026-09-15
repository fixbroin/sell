
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, Layers, Search, ChevronRight } from "lucide-react";
import type { FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import SubCategoryForm from '@/components/admin/SubCategoryForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, deleteDoc, query, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { Input } from "@/components/ui/input";
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AppImage from '@/components/ui/AppImage';
import { Skeleton } from '@/components/ui/skeleton';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getCache, setCache } from '@/lib/client-cache';
import { getAdminSubCategories, getAdminCategories } from '@/lib/webServerUtils';

export default function AdminSubCategoriesPage() {
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [parentCategories, setParentCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubCategory, setEditingSubCategory] = useState<FirestoreSubCategory | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const fetchData = async (forceRefresh = false) => {
    setIsLoadingData(true);
    try {
      // --- SmartSync: Version Checking ---
      const [subData, catData] = await Promise.all([
        getDocs(query(collection(db, "adminSubCategories"), orderBy("order", "asc"))),
        getDocs(query(collection(db, "adminCategories"), orderBy("order", "asc")))
      ]);

      const fetchedSubCats = subData.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreSubCategory));
      const fetchedCats = catData.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory));

      setSubCategories(fetchedSubCats);
      setParentCategories(fetchedCats);
    } catch (error) {
      console.error("Error fetching sub-categories data: ", error);
      toast({ title: "Error", description: "Could not fetch data.", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData(true);
  }, [toast]);

  if (!isMounted) {
    return (
      <div className="space-y-6">
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4 mt-2" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  const handleAddSubCategory = () => {
    setEditingSubCategory(null);
    setIsFormOpen(true);
  };

  const handleEditSubCategory = (subCat: FirestoreSubCategory) => {
    setEditingSubCategory(subCat);
    setIsFormOpen(true);
  };

  const handleToggleActive = async (sub: FirestoreSubCategory) => {
    setIsSubmitting(true);
    try {
      const newStatus = !(sub.isActive === undefined ? true : sub.isActive);
      await updateDoc(doc(db, "adminSubCategories", sub.id!), { 
        isActive: newStatus,
        updatedAt: serverTimestamp() 
      });
      toast({ 
        title: "Status Updated", 
        description: `Sub-category "${sub.name}" is now ${newStatus ? 'active' : 'inactive'}.` 
      });
      await triggerRefresh('categories');
      await triggerRefresh('services');
    } catch (error) {
      console.error("Error toggling sub-category status: ", error);
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubCategory = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminSubCategories", id));
      toast({ title: "Success", description: "Sub-category deleted successfully." });
      await triggerRefresh('categories');
      await triggerRefresh('services');
      await triggerRefresh('sitemap');
    } catch (error) {
      console.error("Error deleting sub-category: ", error);
      toast({ title: "Error", description: "Could not delete sub-category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const { id, ...cleanData } = data;
      if (id) {
        await updateDoc(doc(db, "adminSubCategories", id), {
          ...cleanData,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Success", description: "Sub-category updated successfully." });
      } else {
        await addDoc(collection(db, "adminSubCategories"), {
          ...cleanData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Success", description: "Sub-category created successfully." });
      }
      await triggerRefresh('categories');
      await triggerRefresh('services');
      await triggerRefresh('sitemap');
      setIsFormOpen(false);
      setEditingSubCategory(null);
    } catch (error) {
      console.error("Error saving sub-category: ", error);
      toast({ title: "Error", description: "Could not save sub-category.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSubCategories = subCategories.filter(sub => 
    sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sub.parentCategoryName || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const subCategoriesByCategory = parentCategories.reduce((acc, cat) => {
    // Check both parentCategoryId and parentId for backward compatibility
    const subs = filteredSubCategories
      .filter(sub => sub.parentCategoryId === cat.id || sub.parentId === cat.id)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    if (subs.length > 0 || !searchQuery) {
        acc.push({ category: cat, subs });
    }
    return acc;
  }, [] as { category: FirestoreCategory, subs: FirestoreSubCategory[] }[]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Layers className="mr-2 h-6 w-6 text-primary" />
              Sub-Categories
            </CardTitle>
            <CardDescription>
              Organize your services into detailed sub-groups within parent categories.
            </CardDescription>
          </div>
          <PermissionGuard moduleId="sub_categories" action="create">
            <Button onClick={handleAddSubCategory} disabled={isSubmitting || isLoadingData} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Sub-Category
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
           <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by name or category..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                />
            </div>
        </CardContent>
      </Card>

      {isLoadingData ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : subCategoriesByCategory.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center text-muted-foreground">
            <p>No sub-categories found.</p>
          </CardContent>
        </Card>
      ) : (
        subCategoriesByCategory.map(({ category, subs }) => (
          <Card key={category.id} className="overflow-hidden border-l-4 border-l-primary">
            <CardHeader className="bg-muted/30 py-4 flex flex-row items-center gap-3">
               <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
                  <AppImage src={category.imageUrl} alt={category.name} fill sizes="32px" className="object-cover" />
               </div>
               <CardTitle className="text-lg font-bold">{category.name}</CardTitle>
               <ChevronRight className="h-4 w-4 text-muted-foreground" />
               <CardDescription className="font-medium text-primary">
                 {subs.length} Sub-categories
               </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {subs.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground italic">
                  No sub-categories in this group matching your search.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow>
                      <TableHead className="pl-6">Image</TableHead>
                      <TableHead>Sub-Category Name</TableHead>
                      <TableHead className="text-center">Order</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-right pr-6 min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((sub) => {
                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="pl-6">
                            <div className="relative w-10 h-10 rounded border overflow-hidden">
                               <AppImage src={sub.imageUrl} alt={sub.name} fill sizes="40px" className="object-cover" />
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{sub.name}</TableCell>
                          <TableCell className="text-center">{sub.order || 0}</TableCell>
                          <TableCell className="text-center">
                            <Switch 
                                checked={sub.isActive === undefined ? true : sub.isActive}
                                onCheckedChange={() => handleToggleActive(sub)}
                                disabled={isSubmitting}
                            />
                          </TableCell>
                          <TableCell className="pr-6">
                            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                              <PermissionGuard moduleId="sub_categories" action="write">
                                <Button variant="outline" size="icon" onClick={() => handleEditSubCategory(sub)} disabled={isSubmitting}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                              <PermissionGuard moduleId="sub_categories" action="delete">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete "{sub.name}". This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteSubCategory(sub.id!)}
                                        disabled={isSubmitting}
                                        className="bg-destructive hover:bg-destructive/90">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </PermissionGuard>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingSubCategory(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-3">
          <DialogHeader><DialogTitle>{editingSubCategory ? 'Edit Sub-Category' : 'Add New Sub-Category'}</DialogTitle><DialogDescription>{editingSubCategory ? 'Update details.' : 'Fill in details.'}</DialogDescription></DialogHeader>
          {parentCategories.length === 0 && !isLoadingData ? (
             <div className="py-8 text-center"><p className="text-destructive">Cannot add sub-categories: no parent categories exist.</p><p className="text-muted-foreground text-sm mt-2">Add at least one category first.</p></div>
          ) : (
            <SubCategoryForm onSubmit={handleFormSubmit} initialData={editingSubCategory} parentCategories={parentCategories} allSubCategories={subCategories} onCancel={() => { setIsFormOpen(false); setEditingSubCategory(null); }} isSubmitting={isSubmitting}/>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
