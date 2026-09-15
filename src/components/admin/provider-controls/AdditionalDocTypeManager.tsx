
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PlusCircle, Edit, Trash2, Loader2, Paperclip, PackageSearch, AlertTriangle, CheckCircle, XCircle, Check, ChevronsUpDown } from "lucide-react";
import type { AdditionalDocumentTypeOption } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';
import { Badge } from '@/components/ui/badge';

const additionalDocTypeSchema = z.object({
  label: z.string().min(1, "Label is required.").max(100, "Label is too long."),
  description: z.string().max(250, "Description is too long.").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
  isActive: z.boolean().default(true),
  isRequired: z.boolean().default(false),
  imageCount: z.coerce.number().min(1).max(2).default(1),
  docNumberType: z.enum(['numeric', 'alphabetic', 'alphanumeric', 'any']).default('any'),
  docNumberMinLength: z.coerce.number().min(0).optional().nullable(),
  docNumberMaxLength: z.coerce.number().min(0).optional().nullable(),
});

type AdditionalDocTypeFormData = z.infer<typeof additionalDocTypeSchema>;

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "additionalDocTypes";
const ARRAY_FIELD_NAME = "options";

export default function AdditionalDocTypeManager() {
  const [options, setOptions] = useState<AdditionalDocumentTypeOption[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<AdditionalDocumentTypeOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidePickerOpen, setIsSidePickerOpen] = useState(false);
  const [isRulePickerOpen, setIsRulePickerOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<AdditionalDocTypeFormData>({
    resolver: zodResolver(additionalDocTypeSchema),
    defaultValues: { label: "", description: "", order: 0, isActive: true, isRequired: false, imageCount: 1, docNumberType: 'any', docNumberMinLength: null, docNumberMaxLength: null },
  });

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOptions((data[ARRAY_FIELD_NAME] as AdditionalDocumentTypeOption[] || []).sort((a, b) => a.order - b.order));
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error("Error fetching additional document types: ", error);
      toast({ title: "Error", description: "Could not fetch document types.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const handleAdd = () => {
    setEditingOption(null);
    form.reset({ label: "", description: "", order: options.length > 0 ? Math.max(...options.map(opt => opt.order)) + 1 : 0, isActive: true, isRequired: false, imageCount: 1, docNumberType: 'any', docNumberMinLength: null, docNumberMaxLength: null });
    setIsFormOpen(true);
  };

  const handleEdit = (option: AdditionalDocumentTypeOption) => {
    setEditingOption(option);
    form.reset({ 
      label: option.label, 
      description: option.description || "", 
      order: option.order,
      isActive: option.isActive ?? true,
      isRequired: option.isRequired ?? false,
      imageCount: option.imageCount ?? 1,
      docNumberType: option.docNumberType || 'any',
      docNumberMinLength: option.docNumberMinLength ?? null,
      docNumberMaxLength: option.docNumberMaxLength ?? null,
    });
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
      toast({ title: "Success", description: "Document type deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete document type.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: AdditionalDocTypeFormData) => {
    setIsSubmitting(true);
    let updatedOptionsArray: AdditionalDocumentTypeOption[];
    if (editingOption) {
      updatedOptionsArray = options.map(opt => opt.id === editingOption.id ? { 
        ...editingOption, 
        ...data, 
        docNumberMinLength: data.docNumberMinLength ?? undefined,
        docNumberMaxLength: data.docNumberMaxLength ?? undefined,
        updatedAt: Timestamp.now() 
      } : opt);
    } else {
      const newOption: AdditionalDocumentTypeOption = {
        id: nanoid(),
        ...data,
        docNumberType: data.docNumberType as any || 'any',
        docNumberMinLength: data.docNumberMinLength ?? undefined,
        docNumberMaxLength: data.docNumberMaxLength ?? undefined,
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
      toast({ title: "Success", description: `Document type ${editingOption ? 'updated' : 'added'}.` });
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: `Could not save document type.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center"><Paperclip className="mr-2 h-5 w-5"/>Additional Document Types</CardTitle>
          <CardDescription>Configure document requirements for providers during registration.</CardDescription>
        </div>
        <Button onClick={handleAdd} disabled={isSubmitting || isLoading}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Document
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : options.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No additional document types defined yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Num. Validation</TableHead>
                <TableHead className="text-center">Mandatory</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((opt) => (
                <TableRow key={opt.id}>
                  <TableCell>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{opt.description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1">
                        <Badge variant="outline" className="capitalize">{opt.docNumberType || 'Any'}</Badge>
                        { (opt.docNumberMinLength || opt.docNumberMaxLength) && (
                            <p className="text-[10px] text-muted-foreground">
                                L: {opt.docNumberMinLength ?? 0} - {opt.docNumberMaxLength ?? '∞'}
                            </p>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {opt.isRequired ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />}
                  </TableCell>
                  <TableCell className="text-center">
                    {opt.isActive ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(opt)} disabled={isSubmitting} className="mr-2"><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescriptionComponent>This will delete the "{opt.label}" document type definition.</AlertDialogDescriptionComponent></AlertDialogHeader>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingOption ? "Edit" : "Add"} Additional Document Type</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <FormField control={form.control} name="label" render={({ field }) => (<FormItem><FormLabel>Document Name</FormLabel><FormControl><Input placeholder="e.g., Voter ID, Driving License" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Instructions for the user" {...field} rows={2} /></FormControl><FormMessage /></FormItem>)} />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="imageCount" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Required Images</FormLabel>
                    <Dialog open={isSidePickerOpen} onOpenChange={setIsSidePickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !field.value && "text-muted-foreground"
                          )}
                          type="button"
                        >
                          {String(field.value) === "1" ? "Single Image" : String(field.value) === "2" ? "Two Images (Front/Back)" : "Select count..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Required Images</DialogTitle>
                          <DialogDescription>
                            Select how many images providers must upload for this document type.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="space-y-1">
                            {[
                              { value: "1", label: "Single Image" },
                              { value: "2", label: "Two Images (Front/Back)" },
                            ].map((opt) => (
                              <Button
                                key={opt.value}
                                variant={String(field.value) === opt.value ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                onClick={() => {
                                  field.onChange(Number(opt.value));
                                  setIsSidePickerOpen(false);
                                }}
                                type="button"
                              >
                                <span className="text-sm font-medium">{opt.label}</span>
                                {String(field.value) === opt.value && (
                                  <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                )}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Display Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>

              <div className="pt-4 border-t space-y-4">
                <h4 className="text-sm font-bold">Document Number Validation</h4>
                <FormField control={form.control} name="docNumberType" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Allowed Characters</FormLabel>
                    <Dialog open={isRulePickerOpen} onOpenChange={setIsRulePickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !field.value && "text-muted-foreground"
                          )}
                          type="button"
                        >
                          {field.value === "any"
                            ? "Any (No Restriction)"
                            : field.value === "numeric"
                            ? "Numbers Only (0-9)"
                            : field.value === "alphabetic"
                            ? "Alphabets Only (A-Z)"
                            : field.value === "alphanumeric"
                            ? "Alphanumeric (A-Z, 0-9)"
                            : "Select type..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Allowed Characters</DialogTitle>
                          <DialogDescription>
                            Configure formatting constraints for this document number.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <ScrollArea className="h-[200px] rounded-md border p-2">
                            <div className="space-y-1">
                              {[
                                { value: "any", label: "Any (No Restriction)" },
                                { value: "numeric", label: "Numbers Only (0-9)" },
                                { value: "alphabetic", label: "Alphabets Only (A-Z)" },
                                { value: "alphanumeric", label: "Alphanumeric (A-Z, 0-9)" },
                              ].map((opt) => (
                                <Button
                                  key={opt.value}
                                  variant={field.value === opt.value ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                  onClick={() => {
                                    field.onChange(opt.value);
                                    setIsRulePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="text-sm font-medium">{opt.label}</span>
                                  {field.value === opt.value && (
                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="docNumberMinLength" render={({ field }) => (<FormItem><FormLabel>Min Length</FormLabel><FormControl><Input type="number" placeholder="0" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="docNumberMaxLength" render={({ field }) => (<FormItem><FormLabel>Max Length</FormLabel><FormControl><Input type="number" placeholder="Unlimited" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </div>

              <div className="pt-4 border-t space-y-3">
                <FormField control={form.control} name="isRequired" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5"><FormLabel>Mandatory</FormLabel><FormDescription className="text-xs">User must upload this to proceed.</FormDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                )} />

                <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5"><FormLabel>Active</FormLabel><FormDescription className="text-xs">Show this document slot to users.</FormDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                )} />
              </div>

              <DialogFooter className="pt-4 border-t">
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
