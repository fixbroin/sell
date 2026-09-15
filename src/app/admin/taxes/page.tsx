
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, Percent, CheckCircle, XCircle, PackageSearch } from "lucide-react";
import type { FirestoreTax } from '@/types/firestore';
import TaxForm, { type TaxFormData } from '@/components/admin/TaxForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';

export default function AdminTaxesPage() {
  const [taxes, setTaxes] = useState<FirestoreTax[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTax, setEditingTax] = useState<FirestoreTax | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const taxesCollectionRef = collection(db, "adminTaxes");

  const fetchTaxes = async () => {
    setIsLoading(true);
    try {
      const q = query(taxesCollectionRef, orderBy("taxName", "asc"));
      const data = await getDocs(q);
      let fetchedTaxes = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreTax));
      
      const hasNoTax = fetchedTaxes.some(t => t.taxPercent === 0 || t.taxName.toLowerCase() === "no tax");
      if (!hasNoTax) {
        const defaultTax = {
          taxName: "No Tax",
          taxPercent: 0,
          isActive: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        const docRef = await addDoc(taxesCollectionRef, defaultTax);
        fetchedTaxes.push({ ...defaultTax, id: docRef.id });
        fetchedTaxes.sort((a, b) => a.taxName.localeCompare(b.taxName));
        await triggerRefresh('global-cache');
      }

      setTaxes(fetchedTaxes);
    } catch (error) {
      console.error("Error fetching taxes: ", error);
      toast({ title: "Error", description: "Could not fetch tax configurations.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddTax = () => {
    setEditingTax(null);
    setIsFormOpen(true);
  };

  const handleEditTax = (tax: FirestoreTax) => {
    setEditingTax(tax);
    setIsFormOpen(true);
  };

  const handleDeleteTax = async (taxId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminTaxes", taxId));
      await triggerRefresh('global-cache');
      setTaxes(taxes.filter(tax => tax.id !== taxId));
      toast({ title: "Success", description: "Tax configuration deleted successfully." });
    } catch (error) {
      console.error("Error deleting tax: ", error);
      toast({ title: "Error", description: "Could not delete tax configuration.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (tax: FirestoreTax) => {
    setIsSubmitting(true);
    try {
      const taxDocRef = doc(db, "adminTaxes", tax.id);
      await updateDoc(taxDocRef, { isActive: !tax.isActive, updatedAt: Timestamp.now() });
      await triggerRefresh('global-cache');
      await fetchTaxes(); // Re-fetch to update UI state
      toast({ title: "Status Updated", description: `Tax ${tax.taxName} ${!tax.isActive ? "activated" : "deactivated"}.`});
    } catch (error) {
        console.error("Error toggling tax status:", error);
        toast({ title: "Error", description: "Could not update tax status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: TaxFormData & { id?: string }) => {
    setIsSubmitting(true);
    
    const payload: Omit<FirestoreTax, 'id' | 'createdAt' | 'updatedAt'> = {
      taxName: data.taxName,
      taxPercent: data.taxPercent,
      isActive: data.isActive === undefined ? true : data.isActive,
    };

    try {
      if (data.id) { 
        const taxDoc = doc(db, "adminTaxes", data.id);
        await updateDoc(taxDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Tax configuration updated successfully." });
      } else { 
        await addDoc(taxesCollectionRef, { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Tax configuration added successfully." });
      }
      await triggerRefresh('global-cache');
      setIsFormOpen(false);
      setEditingTax(null);
      await fetchTaxes(); 
    } catch (error) {
      console.error("Error saving tax: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save tax configuration.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Percent className="mr-2 h-6 w-6 text-primary" />Manage Taxes</CardTitle>
            <CardDescription>Define tax rates to be applied to services.</CardDescription>
          </div>
          <Button onClick={handleAddTax} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Tax
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading tax configurations...</p>
            </div>
          ) : taxes.length === 0 ? (
            <div className="text-center py-10">
                <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No tax configurations found. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Name</TableHead>
                  <TableHead className="text-center">Percentage (%)</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxes.map((tax) => (
                  <TableRow key={tax.id}>
                    <TableCell className="font-medium">{tax.taxName}</TableCell>
                    <TableCell className="text-center">{tax.taxPercent}%</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={tax.isActive}
                        onCheckedChange={() => handleToggleActive(tax)}
                        disabled={isSubmitting}
                        aria-label={`Toggle active status for ${tax.taxName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <Button variant="outline" size="icon" onClick={() => handleEditTax(tax)} disabled={isSubmitting}>
                          <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" disabled={isSubmitting}>
                              <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the tax "{tax.taxName}". This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteTax(tax.id)}
                                disabled={isSubmitting}
                                className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingTax(null); } }}>
        <DialogContent className="w-full max-w-md max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-3 pb-4 border-b">
            <DialogTitle>{editingTax ? 'Edit Tax Configuration' : 'Add New Tax Configuration'}</DialogTitle>
            <DialogDescription>
              {editingTax ? 'Update the details for this tax.' : 'Fill in the details for a new tax configuration.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3">
            <TaxForm
              onSubmit={handleFormSubmit}
              initialData={editingTax}
              onCancel={() => { setIsFormOpen(false); setEditingTax(null); }}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

    