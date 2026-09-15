
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Eye, Check, Trash2, Loader2, PackageSearch, Construction, Phone, CheckCircle2, MoreHorizontal, MapPin } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, addDoc, limit } from '@/lib/mysqlDb';
import { ref as storageRef, deleteObject } from '@/lib/mysqlStorage';
import type { CustomServiceRequest, CustomRequestStatus, FirestoreNotification } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { triggerPushNotification } from '@/lib/fcmUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter as AlertDialogFooterComponent, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import AppImage from '@/components/ui/AppImage';
import { Separator } from "@/components/ui/separator";
import { getTimestampMillis, formatCurrency, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';

const formatDate = (timestamp?: any, appConfig?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
};

const getStatusBadgeVariant = (status: CustomRequestStatus) => {
    switch (status) {
      case 'new': return 'destructive';
      case 'reviewed': return 'secondary';
      case 'contacted': return 'default';
      case 'closed': return 'outline';
      default: return 'outline';
    }
};

// --- Modal Component Logic ---
const DetailItem = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div>
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className="text-base text-foreground">{value || "N/A"}</p>
  </div>
);

const CustomRequestDetailsModal = ({ isOpen, onClose, request }: { isOpen: boolean; onClose: () => void; request: CustomServiceRequest | null; }) => {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';

  if (!request) return null;

  const budgetDisplay = (request.minBudget != null && request.maxBudget != null) 
    ? `${formatCurrency(request.minBudget, symbol, decimals, code)} - ${formatCurrency(request.maxBudget, symbol, decimals, code)}` 
    : 'Not specified';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-3 border-b flex-shrink-0">
          <DialogTitle className="text-xl sm:text-2xl">{request.serviceTitle}</DialogTitle>
          <DialogDescription>Submitted by {request.userName || "Guest"} on {formatDate(request.submittedAt, appConfig)}</DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto min-h-0">
          <div className="p-4 sm:p-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailItem label="Customer Name" value={request.userName} />
                <DetailItem label="Category" value={request.categoryName || request.customCategory} />
                <DetailItem label="Customer Email" value={request.userEmail} />
                <DetailItem label="Customer Mobile" value={request.userMobile} />
                <DetailItem label="Preferred Start Date" value={formatDate(request.preferredStartDate, appConfig)} />
                <DetailItem label="Budget" value={budgetDisplay} />
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-base text-foreground whitespace-pre-wrap mt-1">{request.description}</p>
            </div>

            {request.address && (
              <>
                <Separator className="my-2" />
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-primary animate-pulse" /> Service Address Details
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit text-xs flex items-center gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 cursor-pointer"
                      asChild
                    >
                      <a
                        href={
                          request.address.latitude && request.address.longitude
                            ? `https://www.google.com/maps/search/?api=1&query=${request.address.latitude},${request.address.longitude}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                `${request.address.addressLine1}${request.address.addressLine2 ? ', ' + request.address.addressLine2 : ''}, ${request.address.city}, ${request.address.state} - ${request.address.pincode}`
                              )}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-3.5 w-3.5" /> View on Google Maps
                      </a>
                    </Button>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg border text-sm space-y-1">
                    <p><strong className="text-muted-foreground">Recipient Name:</strong> {request.address.fullName}</p>
                    <p><strong className="text-muted-foreground">Phone Number:</strong> {request.address.phone}</p>
                    {request.address.email && <p><strong className="text-muted-foreground">Email:</strong> {request.address.email}</p>}
                    <p>
                      <strong className="text-muted-foreground">Address:</strong>{' '}
                      {request.address.addressLine1}
                      {request.address.addressLine2 ? `, ${request.address.addressLine2}` : ''}
                    </p>
                    <p>
                      <strong className="text-muted-foreground">City/State/Pincode:</strong>{' '}
                      {request.address.city}, {request.address.state} - {request.address.pincode}
                    </p>
                    {request.address.latitude && request.address.longitude && (
                      <p className="text-xs text-muted-foreground font-mono mt-1 pt-1 border-t border-dashed">
                        Coordinates: {request.address.latitude.toFixed(6)}, {request.address.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
            
            {request.imageUrls && request.imageUrls.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Uploaded Images</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {request.imageUrls.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-md overflow-hidden border">
                      <AppImage src={url} alt={`Request image ${index + 1}`} fill sizes="150px" className="object-cover hover:scale-105 transition-transform" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-3 border-t bg-muted/50 flex-shrink-0">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// --- Page Component Logic ---
export default function CustomServiceAdminPage() {
  const { config: appConfig } = useApplicationConfig();
  const [requests, setRequests] = useState<CustomServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CustomServiceRequest | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();
  const { adminPermissions, user } = useAuth();

  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "customServiceRequests");
    const q = query(requestsRef, orderBy("submittedAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomServiceRequest)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching custom service requests:", error);
      toast({ title: "Error", description: "Could not fetch requests.", variant: "destructive" });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [toast]);

  const handleViewDetails = (request: CustomServiceRequest) => {
    setSelectedRequest(request);
    setIsDetailsModalOpen(true);
  };
  
  const handleUpdateStatus = async (requestId: string, newStatus: CustomRequestStatus) => {
    if (!requestId) return;
    setIsUpdating(requestId);
    try {
      const requestToUpdate = requests.find(r => r.id === requestId);
      await updateDoc(doc(db, "customServiceRequests", requestId), { status: newStatus });
      toast({ title: "Status Updated", description: `Request marked as ${newStatus}.` });

      // --- USER NOTIFICATION FOR CUSTOM SERVICE STATUS CHANGE ---
      if (requestToUpdate?.userId) {
          const userNotification: Omit<FirestoreNotification, 'id'> = {
            userId: requestToUpdate.userId,
            title: `Request Update: ${requestToUpdate.serviceTitle}`,
            message: `Your custom service request "${requestToUpdate.serviceTitle}" status has been updated to ${newStatus}.`,
            type: 'info',
            href: '/custom-service',
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), userNotification);
          triggerPushNotification({
            userId: requestToUpdate.userId,
            title: userNotification.title,
            body: userNotification.message,
            href: userNotification.href
          }).catch(err => console.error("Error sending custom service status push:", err));
      }
      // --- END USER NOTIFICATION ---

    } catch (error) {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!requestId) return;
    setIsUpdating(requestId);
    try {
      const requestToDelete = requests.find((r) => r.id === requestId);
      if (requestToDelete?.imageUrls && requestToDelete.imageUrls.length > 0) {
        // Delete all uploaded images (handles Local VPS, Remote Shared Hosting, and legacy Firebase Storage)
        await Promise.all(
          requestToDelete.imageUrls.map(async (url) => {
            try {
              if (url.includes('firebasestorage.googleapis.com')) {
                const imageRef = storageRef(storage, url);
                await deleteObject(imageRef);
              } else {
                 const token = await user?.getIdToken();
                 await fetch('/api/upload', {
                   method: 'DELETE',
                   headers: { 
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${token}`
                   },
                   body: JSON.stringify({ fileUrl: url })
                 });
              }
            } catch (err) {
              console.error("Failed to delete image from storage:", url, err);
            }
          })
        );
      }

      await deleteDoc(doc(db, "customServiceRequests", requestId));
      toast({ title: "Request Deleted", description: "The custom service request has been removed." });
    } catch (error) {
      console.error("Error deleting custom request:", error);
      toast({ title: "Error", description: "Could not delete request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const renderMobileCard = (req: CustomServiceRequest) => (
    <Card key={req.id} className="mb-4 shadow-sm border overflow-hidden">
      <CardHeader className="p-4 bg-muted/20">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <CardTitle className="text-base font-bold line-clamp-2">{req.serviceTitle}</CardTitle>
            <CardDescription className="text-xs">{req.categoryName || req.customCategory || "N/A"}</CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize whitespace-nowrap">
            {req.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 text-sm space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Customer:</span>
          <span className="text-foreground">{req.userName || "Guest"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Submitted:</span>
           <span className="text-foreground">{formatDate(req.submittedAt, appConfig)}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-2 italic">"{req.description}"</p>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-wrap gap-2 justify-end border-t mt-2 pt-4">
        <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)} className="h-8 text-xs">
          <Eye className="h-3.5 w-3.5 mr-1" /> Details
        </Button>
        {req.status !== 'reviewed' && (
          <PermissionGuard moduleId="custom_service" action="write">
            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'reviewed')} disabled={isUpdating === req.id} className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
              <Check className="h-3.5 w-3.5 mr-1" /> Reviewed
            </Button>
          </PermissionGuard>
        )}
        {req.status !== 'contacted' && (
          <PermissionGuard moduleId="custom_service" action="write">
            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'contacted')} disabled={isUpdating === req.id} className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50">
              <Phone className="h-3.5 w-3.5 mr-1" /> Contacted
            </Button>
          </PermissionGuard>
        )}
        {req.status !== 'closed' && (
          <PermissionGuard moduleId="custom_service" action="write">
            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'closed')} disabled={isUpdating === req.id} className="h-8 text-xs text-gray-600 border-gray-200 hover:bg-gray-50">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
            </Button>
          </PermissionGuard>
        )}
        <PermissionGuard moduleId="custom_service" action="delete">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isUpdating === req.id}>
                {isUpdating === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitleComponent>Confirm Deletion</AlertDialogTitleComponent>
                <AlertDialogDescriptionComponent>This will permanently delete the request "{req.serviceTitle}".</AlertDialogDescriptionComponent>
              </AlertDialogHeader>
              <AlertDialogFooterComponent>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteRequest(req.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooterComponent>
            </AlertDialogContent>
          </AlertDialog>
        </PermissionGuard>
      </CardFooter>
    </Card>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Custom Service Requests</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Construction className="mr-2 h-6 w-6 text-primary" /> Custom Service Requests
          </CardTitle>
          <CardDescription>
            View and manage custom service requests submitted by users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No custom service requests found yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop View: Table with Actions Sub-row */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Service Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Submitted On</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map(req => (
                      <React.Fragment key={req.id}>
                        {/* Info Row */}
                        <TableRow className="hover:bg-transparent border-b-0">
                          <TableCell className="font-medium max-w-xs">
                            <div className="truncate" title={req.serviceTitle}>{req.serviceTitle}</div>
                          </TableCell>
                          <TableCell>{req.categoryName || req.customCategory || "N/A"}</TableCell>
                          <TableCell>
                            <div className="font-medium">{req.userName || "Guest"}</div>
                            <div className="text-xs text-muted-foreground">{req.userEmail || req.userMobile}</div>
                          </TableCell>
                          <TableCell>{formatDate(req.submittedAt, appConfig)}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize">{req.status}</Badge>
                          </TableCell>
                        </TableRow>
                        {/* Actions Row */}
                        <TableRow className="bg-muted/5 border-b-2">
                          <TableCell colSpan={5} className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)} className="h-8 text-xs">
                                <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                              </Button>
                              
                              <Separator orientation="vertical" className="h-6 mx-1" />

                              {req.status !== 'reviewed' && hasActionPermission(adminPermissions, 'custom_service', 'write') && (
                                <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'reviewed')} disabled={isUpdating === req.id} className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                                  <Check className="h-3.5 w-3.5 mr-1.5" /> Mark as Reviewed
                                </Button>
                              )}
                              {req.status !== 'contacted' && hasActionPermission(adminPermissions, 'custom_service', 'write') && (
                                <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'contacted')} disabled={isUpdating === req.id} className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50">
                                  <Phone className="h-3.5 w-3.5 mr-1.5" /> Mark as Contacted
                                </Button>
                              )}
                              {req.status !== 'closed' && hasActionPermission(adminPermissions, 'custom_service', 'write') && (
                                <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req.id!, 'closed')} disabled={isUpdating === req.id} className="h-8 text-xs text-gray-600 border-gray-200 hover:bg-gray-50">
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark as Closed
                                </Button>
                              )}

                              <Separator orientation="vertical" className="h-6 mx-1" />

                              {hasActionPermission(adminPermissions, 'custom_service', 'delete') && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" className="h-8 text-xs" disabled={isUpdating === req.id}>
                                    {isUpdating === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                                    Delete Request
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitleComponent>Confirm Deletion</AlertDialogTitleComponent>
                                    <AlertDialogDescriptionComponent>This will permanently delete the request "{req.serviceTitle}".</AlertDialogDescriptionComponent>
                                  </AlertDialogHeader>
                                  <AlertDialogFooterComponent>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteRequest(req.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooterComponent>
                                </AlertDialogContent>
                              </AlertDialog>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View: Cards */}
              <div className="lg:hidden space-y-4">
                {requests.map(renderMobileCard)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {selectedRequest && (
        <CustomRequestDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          request={selectedRequest}
        />
      )}
    </div>
  );
}
