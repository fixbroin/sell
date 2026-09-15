
"use client";

import { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, SendHorizonal, AlertTriangle, XCircle, Megaphone, Clock, Info } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { GlobalAdminPopup } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';

const globalMessageFormSchema = z.object({
  message: z.string().min(5, "Message must be at least 5 characters.").max(250, "Message cannot exceed 250 characters."),
  durationSeconds: z.coerce.number().min(3, "Duration must be at least 3 seconds.").max(60, "Duration cannot exceed 60 seconds.").optional().default(10),
  isActive: z.boolean().default(false),
});

type GlobalMessageFormData = z.infer<typeof globalMessageFormSchema>;

export default function AdminGlobalMessageForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<GlobalMessageFormData>({
    resolver: zodResolver(globalMessageFormSchema),
    defaultValues: {
      message: "",
      durationSeconds: 10,
      isActive: false,
    },
  });

  useEffect(() => {
    if (globalSettings?.globalAdminPopup && !isLoadingGlobalSettings) {
      form.reset({
        message: globalSettings.globalAdminPopup.message || "",
        durationSeconds: globalSettings.globalAdminPopup.durationSeconds || 10,
        isActive: globalSettings.globalAdminPopup.isActive || false,
      });
    }
  }, [globalSettings, isLoadingGlobalSettings, form]);

  const onSubmit = async (data: GlobalMessageFormData) => {
    setIsSaving(true);
    try {
      const popupDataToSave: GlobalAdminPopup = {
        message: data.message,
        isActive: true,
        durationSeconds: data.durationSeconds,
        sentAt: Timestamp.now(),
      };
      await setDoc(doc(db, "webSettings", "global"), { globalAdminPopup: popupDataToSave, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('global-cache');
      toast({ title: "Broadcast Sent", description: "All active users will now see your message." });
      form.setValue("isActive", true);
    } catch (error) {
      toast({ title: "Broadcast Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeactivatePopup = async () => {
    setIsSaving(true);
    try {
        const currentPopupSettings = globalSettings?.globalAdminPopup || { message: "", isActive: false, durationSeconds: 10 };
        await setDoc(doc(db, "webSettings", "global"), { 
            globalAdminPopup: { ...currentPopupSettings, isActive: false, sentAt: Timestamp.now() },
            updatedAt: Timestamp.now() 
        }, { merge: true });
        await triggerRefresh('global-cache');
        toast({ title: "Broadcast Stopped" });
        form.setValue("isActive", false);
    } catch (error) {
        toast({ title: "Deactivation Failed", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoadingGlobalSettings) {
    return (
      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Checking broadcast status...</p>
        </CardContent>
      </Card>
    );
  }

  const isActive = form.getValues("isActive") && globalSettings?.globalAdminPopup?.isActive;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-card">
          <CardHeader className="p-8 pb-4 bg-primary/[0.02]">
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Global Broadcast</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              Instantly push a popup notification to all connected users across the platform.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-8 space-y-6">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-semibold flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" /> Announcement Text
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter your broadcast message here..."
                      className="rounded-2xl border-none bg-muted/50 focus-visible:ring-primary/20 p-4 resize-none h-32"
                      {...field}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <div className="flex justify-end">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      field.value.length > 200 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {field.value.length} / 250
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationSeconds"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Display Duration
                  </FormLabel>
                  <FormControl>
                    <div className="relative max-w-[200px]">
                      <Input type="number" className="rounded-xl border-none bg-muted/50 h-11 pr-12 focus-visible:ring-primary/20 font-bold" {...field} disabled={isSaving} />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">SEC</span>
                    </div>
                  </FormControl>
                  <FormDescription className="text-[10px] uppercase font-bold tracking-tight">3 - 60 seconds recommended</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             {isActive && (
                <Alert className="rounded-2xl bg-primary/5 border-primary/20 animate-pulse">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    <AlertTitle className="text-xs font-extrabold uppercase tracking-wider text-primary">Live Broadcast Active</AlertTitle>
                    <AlertDescription className="text-xs mt-1 font-medium italic">
                       "{globalSettings.globalAdminPopup?.message}"
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>

          <CardFooter className="p-8 bg-muted/20 border-t flex flex-col sm:flex-row gap-3 sm:justify-between items-center">
            <div>
              {isActive ? (
                <Button type="button" variant="outline" onClick={handleDeactivatePopup} disabled={isSaving} className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive px-6">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Stop Broadcast
                </Button>
              ) : (
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">No Active Broadcast</p>
              )}
            </div>

            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button type="button" disabled={isSaving || !form.formState.isValid} className="rounded-xl px-8 shadow-lg shadow-primary/20 min-w-[200px]">
                        <SendHorizonal className="mr-2 h-4 w-4" /> Start Broadcast
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl p-8 border-none shadow-2xl">
                    <AlertDialogHeader>
                      <div className="bg-primary/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                        <Megaphone className="h-6 w-6 text-primary" />
                      </div>
                      <AlertDialogTitle className="text-2xl font-bold tracking-tight">Confirm Broadcast?</AlertDialogTitle>
                      <AlertDialogDescription className="text-base leading-relaxed mt-2">
                        You are about to push this message to all active users. This will be visible immediately.
                      </AlertDialogDescription>
                      <div className="bg-muted/50 p-4 rounded-2xl mt-4 border border-dashed border-muted-foreground/30">
                        <p className="text-sm italic font-medium">"{form.getValues("message")}"</p>
                      </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-3">
                      <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={form.handleSubmit(onSubmit)} className="rounded-xl bg-primary hover:bg-primary/90 px-8">
                        Push to Users
                      </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

    