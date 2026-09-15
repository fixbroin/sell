
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, PlusCircle, PackageSearch, CheckCircle, Clock } from "lucide-react";
import CustomServiceRequestForm from '@/components/forms/CustomServiceRequestForm';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp } from '@/lib/mysqlDb';
import type { FirestoreCategory, CustomServiceRequest } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

const formatDate = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};

const getStatusBadgeVariant = (status: CustomServiceRequest['status']) => {
    switch (status) {
      case 'new': return 'destructive';
      case 'reviewed': return 'secondary';
      case 'contacted': return 'default';
      case 'closed': return 'outline';
      default: return 'outline';
    }
};

export default function CustomServicePage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();

  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [requests, setRequests] = useState<CustomServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Request a Custom Service" },
  ];

  const fetchCategories = useCallback(async () => {
    try {
      const categoriesRef = collection(db, 'adminCategories');
      const q = query(categoriesRef, orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const fetchedCategories = snapshot.docs.map(doc => {
          return { id: doc.id, ...doc.data() } as FirestoreCategory;
      });
      setCategories(fetchedCategories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast({ title: "Error", description: "Could not load categories for the form.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const requestsRef = collection(db, "customServiceRequests");
    const q = query(requestsRef, where("userId", "==", user.uid), orderBy("submittedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomServiceRequest)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching custom requests:", error);
      toast({ title: "Error", description: "Could not fetch your requests.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, isLoadingAuth, toast]);

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8 pb-24"> {/* Added pb-24 for spacing */}
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-3xl font-headline font-semibold">My Custom Requests</h1>
          <Button onClick={() => setIsFormOpen(true)} className="w-full sm:w-auto hidden sm:flex">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Request
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
        ) : requests.length === 0 ? (
          <Card className="text-center py-16">
            <CardHeader><PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" /></CardHeader>
            <CardContent>
              <h3 className="text-xl font-semibold">No Custom Requests Yet</h3>
              <p className="text-muted-foreground mt-2">Click "Create New Request" to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map(req => (
              <Card key={req.id} className="shadow-sm">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{req.serviceTitle}</CardTitle>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                        req.status === 'new' ? 'bg-destructive/20 text-destructive-foreground' : 
                        req.status === 'reviewed' ? 'bg-yellow-500/20 text-yellow-700' :
                        req.status === 'contacted' ? 'bg-blue-500/20 text-blue-700' :
                        'bg-muted'
                    }`}>
                        {req.status}
                    </span>
                  </div>
                  <CardDescription>Submitted: {formatDate(req.submittedAt)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{req.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Floating Action Button for Mobile */}
        <div className="sm:hidden fixed bottom-16 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t z-40">
           <Button onClick={() => setIsFormOpen(true)} className="w-full h-12 text-lg shadow-lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Request
           </Button>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-3 border-b">
            <DialogTitle>New Custom Service Request</DialogTitle>
            <DialogDescription>Describe your needs, and we’ll do our best to accommodate.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            {categories.length > 0 ? (
              <CustomServiceRequestForm 
                categories={categories}
                onSaveSuccess={handleSaveSuccess}
                onCancel={() => setIsFormOpen(false)}
              />
            ) : (
              <div className="p-3 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/> <p>Loading categories...</p></div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
