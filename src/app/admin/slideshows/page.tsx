
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, PlaySquare } from "lucide-react";
import type { FirestoreSlideshow, FirestoreCategory, FirestoreSubCategory, FirestoreService } from '@/types/firestore';
import SlideshowForm from '@/components/admin/SlideshowForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy, onSnapshot, updateDoc, addDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AppImage from '@/components/ui/AppImage';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { Switch } from "@/components/ui/switch";

export default function AdminSlideshowsPage() {
  const [slides, setSlides] = useState<FirestoreSlideshow[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<FirestoreSlideshow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Real-time listener for slides
    const qSlides = query(collection(db, "adminSlideshows"), orderBy("order", "asc"));
    const unsubscribeSlides = onSnapshot(qSlides, (snapshot) => {
      setSlides(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreSlideshow)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching slides: ", error);
      toast({ title: "Error", description: "Could not fetch slideshow slides.", variant: "destructive" });
      setIsLoading(false);
    });

    // Fetch related data for forms
    const fetchData = async () => {
      try {
        const [catSnap, subSnap, servSnap] = await Promise.all([
          getDocs(collection(db, "adminCategories")),
          getDocs(collection(db, "adminSubCategories")),
          getDocs(collection(db, "adminServices"))
        ]);
        setCategories(catSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
        setSubCategories(subSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreSubCategory)));
        setServices(servSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreService)));
      } catch (error) {
        console.error("Error fetching related data: ", error);
      }
    };

    fetchData();

    return () => unsubscribeSlides();
  }, [toast]);

  const handleAddSlide = () => {
    setEditingSlide(null);
    setIsFormOpen(true);
  };

  const handleEditSlide = (slide: FirestoreSlideshow) => {
    setEditingSlide(slide);
    setIsFormOpen(true);
  };

  const handleDeleteSlide = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminSlideshows", id));
      await triggerRefresh('content');
      toast({ title: "Success", description: "Slide deleted successfully." });
    } catch (error) {
      console.error("Error deleting slide: ", error);
      toast({ title: "Error", description: "Could not delete slide.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (slide: FirestoreSlideshow) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "adminSlideshows", slide.id!), { isActive: !slide.isActive, updatedAt: Timestamp.now() });
      toast({ title: "Status Updated", description: `Slide "${slide.title || 'Promo'}" ${!slide.isActive ? "enabled" : "disabled"}.` });
      await triggerRefresh('content');
    } catch (error) {
      console.error("Error toggling slide status: ", error);
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreSlideshow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    try {
      const { id, ...slideData } = data;
      if (id) {
        await updateDoc(doc(db, "adminSlideshows", id), { ...slideData, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Slide updated successfully." });
      } else {
        await addDoc(collection(db, "adminSlideshows"), { ...slideData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "New slide added." });
      }
      await triggerRefresh('content');
      setIsFormOpen(false);
      setEditingSlide(null);
    } catch (error) {
      console.error("Error saving slide: ", error);
      toast({ title: "Error", description: "Could not save slide.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <PlaySquare className="mr-2 h-6 w-6 text-primary" />
              Homepage Slideshow
            </CardTitle>
            <CardDescription>
              Manage the banners and slides on your homepage hero section.
            </CardDescription>
          </div>
          <PermissionGuard moduleId="slideshows" action="create">
            <Button onClick={handleAddSlide} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Slide
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading slides...</p>
            </div>
          ) : slides.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">
              <p>No slides found. Create your first banner above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Preview</TableHead>
                    <TableHead>Title/Description</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slides.map((slide) => (
                    <TableRow key={slide.id}>
                      <TableCell>
                        <div className="relative w-16 h-10 rounded border overflow-hidden">
                           <AppImage src={slide.imageUrl} alt={slide.title || "Slide"} fill sizes="100px" className="object-cover" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{slide.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{slide.description}</div>
                      </TableCell>
                      <TableCell>{slide.order}</TableCell>
                      <TableCell className="text-center">
                        <PermissionGuard moduleId="slideshows" action="write">
                          <Switch 
                            checked={slide.isActive} 
                            onCheckedChange={() => handleToggleActive(slide)} 
                            disabled={isSubmitting}
                            aria-label={`Toggle active status for ${slide.title || "slide"}`}
                          />
                        </PermissionGuard>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <PermissionGuard moduleId="slideshows" action="write">
                            <Button variant="outline" size="icon" onClick={() => handleEditSlide(slide)} disabled={isSubmitting}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGuard>
                          <PermissionGuard moduleId="slideshows" action="delete">
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
                                    This will permanently delete this slide.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteSlide(slide.id!)}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingSlide(null); } }}>
        <DialogContent className="w-full max-w-3xl p-0 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="p-3 pb-4 border-b bg-muted/20 flex-shrink-0">
            <DialogTitle>{editingSlide ? 'Edit Slide' : 'Add New Slide'}</DialogTitle>
            <DialogDescription>
              {editingSlide ? 'Update the details for this slide.' : 'Fill in the details for a new slide.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            <SlideshowForm
                onSubmit={handleFormSubmit}
                initialData={editingSlide}
                categories={categories}
                subCategories={subCategories}
                services={services}
                onCancel={() => { setIsFormOpen(false); setEditingSlide(null); }}
                isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
