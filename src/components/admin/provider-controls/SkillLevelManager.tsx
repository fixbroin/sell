
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"; // Added FormDescription
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Edit, Trash2, Loader2, ListChecks, PackageSearch, AlertTriangle } from "lucide-react";
import type { SkillLevelOption } from '@/types/firestore'; // Ensure this type is defined
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; // Renamed DialogDescription import
import { nanoid } from 'nanoid';

const skillLevelSchema = z.object({
  label: z.string().min(1, "Label is required.").max(100, "Label is too long."),
  description: z.string().max(250, "Description is too long.").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
  // categoryId: z.string().optional(), // Add this if skills become category-specific
});

type SkillLevelFormData = z.infer<typeof skillLevelSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "skillLevels";
const ARRAY_FIELD_NAME = "levels";

export default function SkillLevelManager() {
  const [levels, setLevels] = useState<SkillLevelOption[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<SkillLevelOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<SkillLevelFormData>({
    resolver: zodResolver(skillLevelSchema),
    defaultValues: { label: "", description: "", order: 0 },
  });

  const fetchLevels = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLevels((data[ARRAY_FIELD_NAME] as SkillLevelOption[] || []).sort((a, b) => a.order - b.order));
      } else {
        setLevels([]);
      }
    } catch (error) {
      console.error("Error fetching skill levels: ", error);
      toast({ title: "Error", description: "Could not fetch skill levels.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLevels();
  }, [fetchLevels]);

  const handleAdd = () => {
    setEditingLevel(null);
    form.reset({ label: "", description: "", order: levels.length > 0 ? Math.max(...levels.map(l => l.order)) + 1 : 0 });
    setIsFormOpen(true);
  };

  const handleEdit = (level: SkillLevelOption) => {
    setEditingLevel(level);
    form.reset({ label: level.label, description: level.description || "", order: level.order });
    setIsFormOpen(true);
  };

  const handleDelete = async (levelId: string) => {
    setIsSubmitting(true);
    try {
      const currentLevels = levels.filter(l => l.id !== levelId);
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: currentLevels, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('global-cache');
      setLevels(currentLevels.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: "Skill level deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete skill level.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: SkillLevelFormData) => {
    setIsSubmitting(true);
    let updatedLevels: SkillLevelOption[];
    if (editingLevel) {
      updatedLevels = levels.map(l => l.id === editingLevel.id ? { ...editingLevel, ...data, updatedAt: Timestamp.now() } : l);
    } else {
      const newLevel: SkillLevelOption = {
        id: nanoid(), // Use nanoid for unique ID
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      updatedLevels = [...levels, newLevel];
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, { [ARRAY_FIELD_NAME]: updatedLevels, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('global-cache');
      setLevels(updatedLevels.sort((a,b) => a.order - b.order));
      toast({ title: "Success", description: `Skill level ${editingLevel ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save skill level.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><ListChecks className="mr-2 h-5 w-5"/>Skill Levels</CardTitle>
          <CardDescription>Define skill proficiency levels for providers.</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Level
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : levels.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No skill levels defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Description</TableHead><TableHead className="text-center">Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {levels.map((level) => (
                <TableRow key={level.id}>
                  <TableCell className="font-medium">{level.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={level.description || undefined}>{level.description || "N/A"}</TableCell>
                  <TableCell className="text-center">{level.order}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(level)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescriptionComponent>Delete "{level.label}" skill level?</AlertDialogDescriptionComponent></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(level.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
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
          <DialogHeader><DialogTitle>{editingLevel ? "Edit" : "Add"} Skill Level</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="label" render={({ field }) => (<FormItem><FormLabel>Label</FormLabel><FormControl><Input placeholder="e.g., Helper, Senior Technician" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Brief explanation of this skill level" {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormDescription>Lower numbers appear first.</FormDescription><FormMessage /></FormItem>)} />
              {/* Add CategoryId Select here if skills become category-specific in the future */}
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
