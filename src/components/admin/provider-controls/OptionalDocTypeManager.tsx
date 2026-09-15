
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Edit, Trash2, Loader2, Paperclip, PackageSearch } from "lucide-react";
import type { OptionalDocumentTypeOption } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';

const optionalDocTypeSchema = z.object({
  label: z.string().min(1, "Label is required.").max(100, "Label is too long."),
  description: z.string().max(250, "Description is too long.").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
});

type OptionalDocTypeFormData = z.infer<typeof optionalDocTypeSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "optionalDocTypes";
const ARRAY_FIELD_NAME = "options";

export default function OptionalDocTypeManager() {
  const [options, setOptions] = useState<OptionalDocumentTypeOption[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<OptionalDocumentTypeOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<OptionalDocTypeFormData>({
    resolver: zodResolver(optionalDocTypeSchema),
    defaultValues: { label: "", description: "", order: 0 },
  });

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOptions((data[ARRAY_FIELD_NAME] as OptionalDocumentTypeOption[] || []).sort((a, b) => a.order - b.order));
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error("Error fetching optional document types: ", error);
      toast({ title: "Error", description: "Could not fetch optional document types.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const handleAdd = () => {
    setEditingOption(null);
    form.reset({ label: "", description: "", order: options.length > 0 ? Math.max(...options.map(opt => opt.order)) + 1 : 0 });
    setIsFormOpen(true);
  };

  const handleEdit = (option: OptionalDocumentTypeOption) => {
    setEditingOption(option);
    form.reset({ label: option.label, description: option.description || "", order: option.order });
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
      toast({ title: "Success", description: "Optional document type deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete optional document type.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: OptionalDocTypeFormData) => {
    setIsSubmitting(true);
    let updatedOptionsArray: OptionalDocumentTypeOption[];
    if (editingOption) {
      updatedOptionsArray = options.map(opt => opt.id === editingOption.id ? { ...editingOption, ...data, updatedAt: Timestamp.now() } : opt);
    } else {
      const newOption: OptionalDocumentTypeOption = {
        id: nanoid(),
        ...data,
        isActive: true,
        isRequired: false,
        imageCount: 1,
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
      toast({ title: "Success", description: `Optional document type ${editingOption ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save optional document type.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><Paperclip className="mr-2 h-5 w-5"/>Optional Document Types</CardTitle>
          <CardDescription>Define types of optional documents providers can upload.</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Document Type
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : options.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No optional document types defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Description</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {options.map((opt) => (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={opt.description || undefined}>{opt.description || "N/A"}</TableCell>
                  <TableCell className="text-center">{opt.order}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(opt)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescriptionComponent>Delete "{opt.label}" document type?</AlertDialogDescriptionComponent></AlertDialogHeader>
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
          <DialogHeader><DialogTitle>{editingOption ? "Edit" : "Add"} Optional Document Type</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="label" render={({ field }) => (<FormItem><FormLabel>Label</FormLabel><FormControl><Input placeholder="e.g., Voter ID, Work Certificate" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Brief explanation of this document type" {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
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

