
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PlusCircle, Edit, Trash2, Loader2, Star, MessageSquare, Filter, Wand2, Check, ChevronsUpDown } from "lucide-react"; 
import type { FirestoreReview, ReviewStatus, FirestoreService, FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import ReviewForm, { type ReviewFormData } from '@/components/admin/ReviewForm';
import BulkReviewGeneratorDialog from '@/components/admin/BulkReviewGeneratorDialog';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, onSnapshot, limit, startAfter, type DocumentSnapshot } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getTimestampMillis } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';

const reviewStatusOptions: ReviewStatus[] = ["Pending", "Approved", "Rejected", "Flagged"];

const formatReviewTimestamp = (timestamp?: unknown): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDistanceToNow(new Date(millis), { addSuffix: true });
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<FirestoreReview[]>([]);
  const [displayLimit, setDisplayLimit] = useState(50);
  
  const [services, setServices] = useState<Pick<FirestoreService, 'id' | 'name' | 'subCategoryId'>[]>([]);
  const [subCategories, setSubCategories] = useState<Pick<FirestoreSubCategory, 'id' | 'name' | 'parentId'>[]>([]);
  const [parentCategories, setParentCategories] = useState<Pick<FirestoreCategory, 'id' | 'name'>[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkGenerateOpen, setIsBulkGenerateOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<FirestoreReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "All">("All");
  const [isFilterStatusPickerOpen, setIsFilterStatusPickerOpen] = useState(false);
  const [reviewToChangeStatus, setReviewToChangeStatus] = useState<FirestoreReview | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const [isPrerequisitesLoading, setIsPrerequisitesLoading] = useState(false);

  const fetchPrerequisites = async () => {
    if (services.length > 0) return; // Already loaded
    setIsPrerequisitesLoading(true);
    try {
        const servicesQuery = query(collection(db, "adminServices"), orderBy("name"));
        const subCatsQuery = query(collection(db, "adminSubCategories"), orderBy("name"));
        const catsQuery = query(collection(db, "adminCategories"), orderBy("name"));
        
        const [servicesSnap, subCatsSnap, catsSnap] = await Promise.all([
            getDocs(servicesQuery), getDocs(subCatsQuery), getDocs(catsQuery)
        ]);

        setServices(servicesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string, subCategoryId: doc.data().subCategoryId as string })));
        setSubCategories(subCatsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string, parentId: doc.data().parentId as string })));
        setParentCategories(catsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name as string })));
    } catch (error) {
        console.error("Error fetching prerequisites:", error);
        toast({ title: "Error", description: "Could not load service data.", variant: "destructive" });
    } finally {
        setIsPrerequisitesLoading(false);
    }
  };

  useEffect(() => {
    setDisplayLimit(50);
    const reviewsCollectionRef = collection(db, "adminReviews");
    const qReviews = query(reviewsCollectionRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(qReviews, (querySnapshot) => {
        const fetchedReviews = querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreReview));
        setReviews(fetchedReviews);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching reviews: ", error);
        toast({ title: "Error", description: "Could not fetch reviews.", variant: "destructive" });
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleAddReview = async () => {
    await fetchPrerequisites();
    setEditingReview(null);
    setIsFormOpen(true);
  };

  const handleEditReview = async (review: FirestoreReview) => {
    await fetchPrerequisites();
    setEditingReview(review);
    setIsFormOpen(true);
  };

  const handleOpenBulkGenerate = async () => {
    await fetchPrerequisites();
    setIsBulkGenerateOpen(true);
  };

  const filteredReviews = useMemo(() => {
    const base = filterStatus === "All" ? reviews : reviews.filter(review => review.status === filterStatus);
    
    // Explicitly sort by createdAt descending to ensure most recent is always first
    return [...base].sort((a, b) => {
      const aTime = getTimestampMillis(a.createdAt);
      const bTime = getTimestampMillis(b.createdAt);
      return bTime - aTime;
    });
  }, [reviews, filterStatus]);

  const handleDeleteReview = async (reviewId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminReviews", reviewId));
      toast({ title: "Success", description: "Review deleted successfully." });
    } catch (error) {
      console.error("Error deleting review: ", error);
      toast({ title: "Error", description: "Could not delete review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: ReviewFormData & { serviceName: string, adminCreated: boolean, id?: string }) => {
    setIsSubmitting(true);
    
    const payload: Omit<FirestoreReview, 'id' | 'createdAt' | 'updatedAt'> & { updatedAt?: Timestamp, createdAt?: Timestamp } = {
      serviceId: data.serviceId,
      serviceName: data.serviceName,
      userName: data.userName,
      rating: data.rating,
      comment: data.comment,
      status: data.status as ReviewStatus,
      adminCreated: data.adminCreated,
    };

    try {
      if (data.id) { 
        const reviewDoc = doc(db, "adminReviews", data.id);
        await updateDoc(reviewDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Review updated successfully." });
      } else { 
        await addDoc(collection(db, "adminReviews"), { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Review added successfully." });
      }
      setIsFormOpen(false);
      setEditingReview(null);
    } catch (error) {
      console.error("Error saving review: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleChangeStatus = async (reviewId: string, newStatus: ReviewStatus) => {
     try {
        await updateDoc(doc(db, "adminReviews", reviewId), { status: newStatus, updatedAt: Timestamp.now()});
        toast({title: "Status Updated", description: `Review status changed to ${newStatus}.`})
     } catch (error) {
        console.error("Error updating review status:", error);
        toast({title: "Error", description: "Could not update review status.", variant: "destructive"});
     }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center"><MessageSquare className="mr-2 h-6 w-6 text-primary" />Manage Reviews</CardTitle>
            <CardDescription>Create, edit, delete, and manage the status of service reviews.</CardDescription>
          </div>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
            <div className="w-full sm:min-w-[180px]">
                <Dialog open={isFilterStatusPickerOpen} onOpenChange={setIsFilterStatusPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between sm:min-w-[180px] h-9 text-xs font-normal"
                      type="button"
                    >
                      <span className="flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground"/>
                        {filterStatus === "All" ? "All Statuses" : filterStatus}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Filter by Status</DialogTitle>
                      <DialogDescription>
                        Select a review status to filter by.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ScrollArea className="h-[250px] rounded-md border p-2">
                        <div className="space-y-1">
                          <Button
                            variant={filterStatus === "All" ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                            onClick={() => {
                              setFilterStatus("All");
                              setIsFilterStatusPickerOpen(false);
                            }}
                            type="button"
                          >
                            <span className="text-sm font-medium">All Statuses</span>
                            {filterStatus === "All" && (
                              <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          {reviewStatusOptions.map((status) => (
                            <Button
                              key={status}
                              variant={filterStatus === status ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                              onClick={() => {
                                setFilterStatus(status);
                                setIsFilterStatusPickerOpen(false);
                              }}
                              type="button"
                            >
                              <span className="text-sm font-medium">{status}</span>
                              {filterStatus === status && (
                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>
            </div>
            <PermissionGuard moduleId="reviews" action="write">
              <Button onClick={handleOpenBulkGenerate} variant="outline" className="w-full sm:w-auto h-9" disabled={isPrerequisitesLoading}>
                  {isPrerequisitesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} AI Bulk Generate
              </Button>
            </PermissionGuard>
            <PermissionGuard moduleId="reviews" action="create">
              <Button onClick={handleAddReview} disabled={isSubmitting || isLoading || isPrerequisitesLoading} className="w-full sm:w-auto h-9">
                  {isPrerequisitesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Add New Review
              </Button>
            </PermissionGuard>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading reviews...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      {filterStatus === "All" ? "No reviews found." : `No reviews found with status: ${filterStatus}.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReviews.slice(0, displayLimit).map((review) => (
                    <TableRow key={review.id}>
                      <TableCell className="font-medium text-xs max-w-[150px] truncate" title={review.serviceName}>{review.serviceName}</TableCell>
                      <TableCell className="text-xs">{review.userName}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          {review.rating} <Star className="ml-1 h-3.5 w-3.5 text-yellow-400 fill-yellow-400"/>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={review.comment}>
                        {review.comment}
                      </TableCell>
                      <TableCell className="text-[10px] whitespace-nowrap text-muted-foreground">
                        {formatReviewTimestamp(review.createdAt)}
                      </TableCell>
                      <TableCell>
                           {hasActionPermission(adminPermissions, 'reviews', 'write') ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 text-xs min-w-[100px] sm:min-w-[120px] justify-between font-normal"
                                onClick={() => {
                                  setReviewToChangeStatus(review);
                                  setIsStatusDialogOpen(true);
                                }}
                              >
                                <span>{review.status || "Set Status"}</span>
                                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                              </Button>
                           ) : (
                             <Badge variant="outline" className="text-[10px]">{review.status}</Badge>
                           )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          {hasActionPermission(adminPermissions, 'reviews', 'write') && (
                            <Button variant="outline" size="icon" onClick={() => handleEditReview(review)} disabled={isSubmitting}>
                              <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                            </Button>
                          )}
                          {hasActionPermission(adminPermissions, 'reviews', 'delete') && (
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
                                  This will permanently delete the review by &quot;{review.userName}&quot; for &quot;{review.serviceName}&quot;.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteReview(review.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {filteredReviews.length > displayLimit && (
            <div className="p-6 text-center border-t border-muted/40 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
              <div>
                Showing first {Math.min(displayLimit, filteredReviews.length)} of {filteredReviews.length} reviews.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit((prev: number) => prev + 50)}>
                  Load More (+50)
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(filteredReviews.length)}>
                  Load All ({filteredReviews.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingReview(null); } }}>
        <DialogContent className="w-[90vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 flex flex-col">
           <DialogHeader className="p-3 pb-4 border-b bg-background z-10"> {/* Removed sticky, header will scroll */}
            <DialogTitle>{editingReview ? 'Edit Review' : 'Add New Review'}</DialogTitle>
            <DialogDescription>
              {editingReview ? `Update details for review by ${editingReview.userName}.` : 'Fill in the details for a new review.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow overflow-y-auto"> {/* This div handles scrolling of the ReviewForm */}
            {isLoading ? (
              <div className="p-3 py-8 text-center flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary"/>
                  <span className="ml-2">Loading services...</span>
              </div>
            ) : services.length === 0 && !editingReview ? (
              <div className="p-3 py-8 text-center">
                  <p className="text-destructive">Cannot add new reviews because no services exist.</p>
                  <p className="text-muted-foreground text-sm mt-2">Please add at least one service first.</p>
              </div>
            ) : (
              <ReviewForm
                  onSubmit={handleFormSubmit}
                  initialData={editingReview}
                  services={services}
                  onCancel={() => { setIsFormOpen(false); setEditingReview(null); }}
                  isSubmitting={isSubmitting}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <BulkReviewGeneratorDialog
        isOpen={isBulkGenerateOpen}
        onClose={() => setIsBulkGenerateOpen(false)}
        onGenerationComplete={() => { /* onSnapshot handles refresh */ }}
        services={services}
        subCategories={subCategories}
        parentCategories={parentCategories}
      />
      {reviewToChangeStatus && (
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Change Review Status</DialogTitle>
              <DialogDescription>
                Select status for review by {reviewToChangeStatus.userName}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <ScrollArea className="h-[250px] rounded-md border p-2">
                <div className="space-y-1">
                  {reviewStatusOptions.map((s) => (
                    <Button
                      key={s}
                      variant={reviewToChangeStatus.status === s ? "secondary" : "ghost"}
                      className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                      onClick={() => {
                        handleChangeStatus(reviewToChangeStatus.id, s);
                        setIsStatusDialogOpen(false);
                        setReviewToChangeStatus(null);
                      }}
                      type="button"
                    >
                      <span className="text-sm font-medium">{s}</span>
                      {reviewToChangeStatus.status === s && (
                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                      )}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
