
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Mail, Phone, MessageSquare, Loader2, Send } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, limit } from '@/lib/mysqlDb';
import type { FirestoreContactUsInquiry, InquiryStatus, FirestoreNotification } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { useState } from 'react';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';

const contactUsFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(100, { message: "Name cannot exceed 100 characters."}),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string()
    .min(10, { message: "Phone number must be at least 10 digits." })
    .max(15, { message: "Phone number cannot exceed 15 digits." })
    .regex(/^\+?[1-9]\d{1,14}$/, { message: "Invalid phone number format." })
    .optional().or(z.literal('')),
  message: z.string().min(10, { message: "Message must be at least 10 characters." }).max(1000, { message: "Message cannot exceed 1000 characters."}),
});

type ContactUsFormData = z.infer<typeof contactUsFormSchema>;

export default function ContactUsForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContactUsFormData>({
    resolver: zodResolver(contactUsFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const onSubmit = async (data: ContactUsFormData) => {
    setIsSubmitting(true);
    try {
      const inquiryData: Omit<FirestoreContactUsInquiry, 'id' | 'repliedByAdminUid' | 'replyMessage' | 'repliedAt'> = {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined, // Store as undefined if empty
        message: data.message,
        submittedAt: Timestamp.now(),
        status: 'new' as InquiryStatus,
        source: 'contact_form',
      };
      const docRef = await addDoc(collection(db, "contactUsSubmissions"), inquiryData);
      
      // --- ADMIN NOTIFICATION FOR NEW INQUIRY ---
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminId = adminSnapshot.docs[0].id;
          const adminNotification: Omit<FirestoreNotification, 'id'> = {
            userId: adminId,
            title: "New Contact Inquiry",
            message: `From ${data.name} (${data.email})`,
            type: "info",
            href: `/admin/inquiries`,
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), adminNotification);
          triggerPushNotification({
            userId: adminId,
            title: adminNotification.title,
            body: adminNotification.message,
            href: adminNotification.href
          }).catch(err => console.error("Error sending admin inquiry push:", err));
        }
      } catch (notifyErr) {
        console.error("Error sending admin inquiry notifications:", notifyErr);
      }
      // --- END ADMIN NOTIFICATION ---

      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. We'll get back to you soon.",
        className: "bg-green-100 border-green-300 text-green-700",
      });
      form.reset();
    } catch (error) {
      console.error("Error submitting contact form:", error);
      toast({
        title: "Error",
        description: "Could not send your message. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center">
          <MessageSquare className="mr-2 h-6 w-6 text-primary" /> Send Us a Message
        </CardTitle>
        <CardDescription>
          Have questions or need support? Fill out the form below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4 text-muted-foreground" />Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John Doe" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground" />Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground" />Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="e.g., +919876543210" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />Your Message</FormLabel>
                  <FormControl>
                    <Textarea placeholder="How can we help you today?" rows={5} {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full sm:w-auto" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Message
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
