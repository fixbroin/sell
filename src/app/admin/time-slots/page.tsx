
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, ListChecks, XCircle } from "lucide-react";
import type { FirestoreCategory, TimeSlotCategoryLimit } from '@/types/firestore';
import TimeSlotCategoryLimitForm from '@/components/admin/TimeSlotCategoryLimitForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy, onSnapshot } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PermissionGuard from '@/components/admin/PermissionGuard';

export default function AdminTimeSlotLimitsPage() {
  const [limits, setLimits] = useState<TimeSlotCategoryLimit[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<TimeSlotCategoryLimit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const limitsCollectionRef = collection(db, "timeSlotCategoryLimits");
  const categoriesCollectionRef = collection(db, "adminCategories");

  useEffect(() => {
    // Real-time listener for limits
    const qLimits = query(limitsCollectionRef, orderBy("categoryName", "asc"));
    const unsubscribeLimits = onSnapshot(qLimits, (snapshot) => {
      const fetchedLimits = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TimeSlotCategoryLimit));
      setLimits(fetchedLimits);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching limits: ", error);
      toast({ title: "Error", description: "Could not fetch time slot limits.", variant: "destructive" });
      setIsLoading(false);
    });

    // Fetch categories for the dropdown
    const fetchCategories = async () => {
      try {
        const data = await getDocs(categoriesCollectionRef);
        setCategories(data.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
      } catch (error) {
        console.error("Error fetching categories: ", error);
      }
    };

    fetchCategories();

    return () => unsubscribeLimits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddLimit = () => {
    setEditingLimit(null);
    setIsFormOpen(true);
  };

  const handleEditLimit = (limit: TimeSlotCategoryLimit) => {
    setEditingLimit(limit);
    setIsFormOpen(true);
  };

  const handleDeleteLimit = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "timeSlotCategoryLimits", id));
      toast({ title: "Success", description: "Limit deleted successfully." });
    } catch (error) {
      console.error("Error deleting limit: ", error);
      toast({ title: "Error", description: "Could not delete limit.", variant: "destructive" });
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
              <ListChecks className="mr-2 h-6 w-6 text-primary" />
              Time Slot Booking Limits
            </CardTitle>
            <CardDescription>
              Control how many bookings are allowed per category in any given time slot.
            </CardDescription>
          </div>
          <PermissionGuard moduleId="time_slots" action="create">
            <Button onClick={handleAddLimit} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Limit
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading limits...</p>
            </div>
          ) : limits.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">
              <p>No custom limits set. Default is unlimited.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category Name</TableHead>
                    <TableHead className="text-center">Max Bookings/Slot</TableHead>
                    <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {limits.map((limit) => (
                    <TableRow key={limit.id}>
                      <TableCell className="font-medium">{limit.categoryName}</TableCell>
                      <TableCell className="text-center">
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-bold">
                          {limit.maxConcurrentBookings}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <PermissionGuard moduleId="time_slots" action="write">
                            <Button variant="outline" size="icon" onClick={() => handleEditLimit(limit)} disabled={isSubmitting}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGuard>
                          <PermissionGuard moduleId="time_slots" action="delete">
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
                                    This will remove the booking limit for "{limit.categoryName}".
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteLimit(limit.id!)}
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingLimit(null); } }}>
        <DialogContent className="w-full max-w-md p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-3 pb-4 border-b bg-muted/20">
            <DialogTitle>{editingLimit ? 'Edit Limit' : 'Add New Limit'}</DialogTitle>
            <DialogDescription>
              {editingLimit ? 'Update the booking threshold.' : 'Set a maximum booking limit for a category.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3">
            <TimeSlotCategoryLimitForm
              categories={categories}
              existingLimitCategoryIds={limits.map(l => l.categoryId)}
              initialData={editingLimit}
              isSubmitting={isSubmitting}
              onSuccess={() => {
                setIsFormOpen(false);
                setEditingLimit(null);
              }}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingLimit(null);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
