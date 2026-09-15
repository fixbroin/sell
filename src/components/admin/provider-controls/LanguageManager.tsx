
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, Trash2, Loader2, Languages, PackageSearch } from "lucide-react";
import type { LanguageOption } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';

const languageSchema = z.object({
  label: z.string().min(1, "Language name is required.").max(50, "Name too long."),
  code: z.string().max(10, "Code too long (e.g., en, hi-IN).").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
});

type LanguageFormData = z.infer<typeof languageSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "languageOptions";
const ARRAY_FIELD_NAME = "options";

export default function LanguageManager() {
  const [options, setOptions] = useState<LanguageOption[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<LanguageOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<LanguageFormData>({
    resolver: zodResolver(languageSchema),
    defaultValues: { label: "", code: "", order: 0 },
  });

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOptions((data[ARRAY_FIELD_NAME] as LanguageOption[] || []).sort((a, b) => a.order - b.order));
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error("Error fetching language options: ", error);
      toast({ title: "Error", description: "Could not fetch language options.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const handleAdd = () => {
    setEditingOption(null);
    form.reset({ label: "", code: "", order: options.length > 0 ? Math.max(...options.map(opt => opt.order)) + 1 : 0 });
    setIsFormOpen(true);
  };

  const handleEdit = (option: LanguageOption) => {
    setEditingOption(option);
    form.reset({ label: option.label, code: option.code || "", order: option.order });
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
      toast({ title: "Success", description: "Language option deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete language option.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: LanguageFormData) => {
    setIsSubmitting(true);
    let updatedOptionsArray: LanguageOption[];
    if (editingOption) {
      updatedOptionsArray = options.map(opt => opt.id === editingOption.id ? { ...editingOption, ...data, updatedAt: Timestamp.now() } : opt);
    } else {
      const newOption: LanguageOption = {
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
      toast({ title: "Success", description: `Language option ${editingOption ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save language option.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><Languages className="mr-2 h-5 w-5"/>Language Options</CardTitle>
          <CardDescription>Manage languages spoken by providers.</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Language
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : options.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No language options defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Code</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {options.map((opt) => (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{opt.code || "N/A"}</TableCell>
                  <TableCell className="text-center">{opt.order}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(opt)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescriptionComponent>Delete "{opt.label}" language option?</AlertDialogDescriptionComponent></AlertDialogHeader>
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
          <DialogHeader><DialogTitle>{editingOption ? "Edit" : "Add"} Language Option</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="label" render={({ field }) => (<FormItem><FormLabel>Language Name</FormLabel><FormControl><Input placeholder="e.g., English, Hindi" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="code" render={({ field }) => (<FormItem><FormLabel>Language Code (Optional)</FormLabel><FormControl><Input placeholder="e.g., en, hi-IN" {...field} /></FormControl><FormDescription>Standard language code (e.g., IETF BCP 47).</FormDescription><FormMessage /></FormItem>)} />
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

