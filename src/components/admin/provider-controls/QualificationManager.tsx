
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, Trash2, Loader2, ListChecks, PackageSearch } from "lucide-react";
import type { QualificationOption } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';

const qualificationSchema = z.object({
  label: z.string().min(1, "Label is required.").max(100, "Label is too long."),
  order: z.coerce.number().min(0, "Order must be non-negative."),
});

type QualificationFormData = z.infer<typeof qualificationSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "qualificationOptions";
const ARRAY_FIELD_NAME = "options";

export default function QualificationManager() {
  const [options, setOptions] = useState<QualificationOption[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<QualificationOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<QualificationFormData>({
    resolver: zodResolver(qualificationSchema),
    defaultValues: { label: "", order: 0 },
  });

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOptions((data[ARRAY_FIELD_NAME] as QualificationOption[] || []).sort((a, b) => a.order - b.order));
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error("Error fetching qualification options: ", error);
      toast({ title: "Error", description: "Could not fetch qualification options.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const handleAdd = () => {
    setEditingOption(null);
    form.reset({ label: "", order: options.length > 0 ? Math.max(...options.map(opt => opt.order)) + 1 : 0 });
    setIsFormOpen(true);
  };

  const handleEdit = (option: QualificationOption) => {
    setEditingOption(option);
    form.reset({ label: option.label, order: option.order });
    setIsFormOpen(true);
  };

  const handleDelete = async (optionId: string) => {
    setIsSubmitting(true);
    try {
      const currentOptions = options.filter(opt => opt.id !== optionId);
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: currentOptions, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('global-cache');
      setOptions(currentOptions.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: "Qualification option deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete qualification option.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: QualificationFormData) => {
    setIsSubmitting(true);
    let updatedOptionsArray: QualificationOption[];
    if (editingOption) {
      updatedOptionsArray = options.map(opt => opt.id === editingOption.id ? { ...editingOption, ...data, updatedAt: Timestamp.now() } : opt);
    } else {
      const newOption: QualificationOption = {
        id: nanoid(),
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      updatedOptionsArray = [...options, newOption];
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: updatedOptionsArray, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('global-cache');
      setOptions(updatedOptionsArray.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: `Qualification option ${editingOption ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save qualification option.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><ListChecks className="mr-2 h-5 w-5"/>Qualification Options</CardTitle>
          <CardDescription>Manage educational qualifications for providers (e.g., 10th, ITI, Diploma).</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Option
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : options.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No qualification options defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {options.map((opt) => (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.label}</TableCell>
                  <TableCell className="text-center">{opt.order}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(opt)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescriptionComponent>Delete "{opt.label}" qualification option?</AlertDialogDescriptionComponent></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(opt.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingOption ? "Edit" : "Add"} Qualification Option</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="label" render={({ field }) => (<FormItem><FormLabel>Label</FormLabel><FormControl><Input placeholder="e.g., ITI Diploma" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormDescription>Lower numbers appear first.</FormDescription><FormMessage /></FormItem>)} />
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

