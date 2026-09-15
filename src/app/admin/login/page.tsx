
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import Logo from '@/components/shared/Logo';
import { Mail, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { LogInData } from '@/contexts/AuthContext';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db, collection, query, where, getDocs, limit } from '@/lib/mysqlDb';

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, adminPermissions, isAdminLoading, logIn, isLoading } = useAuth();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (user && !isAdminLoading) {
      if (adminPermissions) {
        router.push('/admin'); 
      } else {
        toast({ title: "Access Denied", description: "You are not authorized to access the admin panel.", variant: "destructive"});
        router.push('/');
      }
    }
  }, [user, adminPermissions, isAdminLoading, router, toast]);

  const onSubmit = async (data: LoginFormValues) => {
    form.clearErrors('email');
    form.clearErrors('password');
    
    const emailLower = data.email.toLowerCase();
    let isAdmin = emailLower === ADMIN_EMAIL.toLowerCase();

    if (!isAdmin) {
      try {
        const adminsRef = collection(db, 'admins');
        const q = query(adminsRef, where('email', '==', emailLower), where('status', '==', 'active'), limit(1));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          isAdmin = true;
        }
      } catch (dbError) {
        console.error("Failed to verify admin status from database:", dbError);
      }
    }

    if (!isAdmin) {
      form.setError("email", { 
        type: "manual", 
        message: "This login is for admin use only." 
      });
      toast({ 
        title: "Access Denied", 
        description: "This login is for admin use only.", 
        variant: "destructive" 
      });
      return;
    }

    try {
      await logIn(data as LogInData);
      // Redirection is handled within logIn or useEffect
    } catch (error: any) {
      console.error("Admin login page error:", error);
      form.setError("password", {
        type: "manual",
        message: error?.message || "Wrong password you entered"
      });
    }
  };

  if (user && isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
         <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-4" size="large" />
          <CardTitle className="text-2xl font-headline">Admin Panel Login</CardTitle>
          <CardDescription>Restricted access for staff and administrators.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email" className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground" />Staff Email</FormLabel>
                    <FormControl>
                      <Input id="email" type="email" placeholder="Enter staff email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password" className="flex items-center"><KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />Password</FormLabel>
                    <FormControl>
                      <Input id="password" type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login to Admin Panel
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
