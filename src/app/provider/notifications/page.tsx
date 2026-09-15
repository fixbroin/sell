
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing, BellOff, ArrowLeft, CheckCircle2, Info, AlertTriangle, Tag, Loader2, Trash2 as TrashIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, writeBatch, Timestamp, getDocs, limit } from '@/lib/mysqlDb';
import type { FirestoreNotification } from "@/types/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from 'date-fns';
import { useLoading } from "@/contexts/LoadingContext";
import { getTimestampMillis } from "@/lib/utils";
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

const NotificationIcon = ({ type }: { type: FirestoreNotification['type'] }) => {
  if (type === "success") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (type === "info") return <Info className="h-5 w-5 text-blue-500" />;
  if (type === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  if (type === "error") return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (type === "booking_update" || type === "admin_alert") return <Tag className="h-5 w-5 text-primary" />;
  return <BellRing className="h-5 w-5 text-gray-500" />;
};

export default function ProviderNotificationsPage() {
  const { user: providerUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<FirestoreNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const { showLoading, hideLoading } = useLoading();
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !providerUser || authLoading) {
      if (!authLoading && !providerUser && isMounted) setIsLoadingNotifications(false);
      return;
    }

    setIsLoadingNotifications(true);
    const notificationsCollectionRef = collection(db, "userNotifications");
    const q = query(
      notificationsCollectionRef,
      where("userId", "==", providerUser.uid),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreNotification));
      setNotifications(fetchedNotifications);
      setIsLoadingNotifications(false);
    }, (error) => {
      console.error("Error fetching provider notifications: ", error);
      toast({ title: "Error", description: "Could not fetch your notifications.", variant: "destructive" });
      setIsLoadingNotifications(false);
    });

    return () => unsubscribe();
  }, [providerUser, authLoading, toast, isMounted]);

  const handleMarkAsRead = async (notificationId?: string) => {
    if (!providerUser || !notificationId) return;
    
    const notificationRef = doc(db, "userNotifications", notificationId);
    try {
      await updateDoc(notificationRef, { read: true });
      // No toast here for individual read to avoid being too noisy
    } catch (error) {
      console.error("Error marking notification as read: ", error);
      toast({ title: "Error", description: "Could not update notification status.", variant: "destructive" });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!providerUser || notifications.filter(n => !n.read).length === 0) return;
    
    showLoading();
    const batch = writeBatch(db);
    notifications.forEach(notification => {
      if (!notification.read && notification.id) {
        const notificationRef = doc(db, "userNotifications", notification.id);
        batch.update(notificationRef, { read: true });
      }
    });

    try {
      await batch.commit();
      toast({ title: "Success", description: "All notifications marked as read." });
    } catch (error) {
      console.error("Error marking all notifications as read: ", error);
      toast({ title: "Error", description: "Could not mark all as read.", variant: "destructive" });
    } finally {
      hideLoading();
    }
  };

  const handleClearAllProviderNotifications = async () => {
    if (!providerUser) return;
    setIsClearing(true);
    try {
      const notificationsCollectionRef = collection(db, "userNotifications");
      const q = query(notificationsCollectionRef, where("userId", "==", providerUser.uid));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({ title: "No Notifications", description: "You have no notifications to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      const batchArray = [];
      let currentBatch = writeBatch(db);
      let currentBatchSize = 0;

      querySnapshot.docs.forEach((doc) => {
        currentBatch.delete(doc.ref);
        currentBatchSize++;
        if (currentBatchSize === 500) { // Firestore batch limit
          batchArray.push(currentBatch);
          currentBatch = writeBatch(db);
          currentBatchSize = 0;
        }
      });

      if (currentBatchSize > 0) {
        batchArray.push(currentBatch);
      }

      for (const batch of batchArray) {
        await batch.commit();
      }

      toast({ title: "Notifications Cleared", description: "All your notifications have been cleared." });
    } catch (error) {
      console.error("Error clearing provider notifications: ", error);
      toast({ title: "Error Clearing", description: (error as Error).message || "Could not clear your notifications.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };


  const unreadCount = notifications.filter(n => !n.read).length;

  if (authLoading || (isLoadingNotifications && isMounted)) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading your notifications...</p>
      </div>
    );
  }

  if (!providerUser && isMounted) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <BellOff className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Login Required</h2>
        <p className="text-muted-foreground mb-6">Please login to view your notifications.</p>
        <Link href="/auth/login?redirect=/provider/notifications" passHref>
          <Button>Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <BellRing className="mr-2 h-6 w-6 text-primary" /> My Notifications 
                {unreadCount > 0 && <span className="text-sm text-primary ml-2">({unreadCount} unread)</span>}
              </CardTitle>
              <CardDescription>
                  Updates about your jobs, application status, and other important alerts.
              </CardDescription>
            </div>
            <div className="mt-3 sm:mt-0 flex gap-2">
              {notifications.length > 0 && unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} disabled={isClearing}>Mark all as read</Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isClearing || notifications.length === 0}>
                    {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your notifications. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAllProviderNotifications} disabled={isClearing} className="bg-destructive hover:bg-destructive/90">
                      {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Yes, Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 && !isLoadingNotifications ? (
            <div className="text-center py-12">
              <BellOff className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Notifications Yet</h2>
              <p className="text-muted-foreground text-sm">You're all caught up! We'll notify you here about new jobs and updates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`shadow-sm transition-all hover:shadow-md ${!notification.read ? "border-primary/50 border-l-4" : "border"}`}
                  onClick={() => !notification.read && notification.id && handleMarkAsRead(notification.id)}
                >
                  <CardContent className="p-3 flex items-start space-x-3">
                    <div className="pt-1">
                      <NotificationIcon type={notification.type} />
                    </div>
                    <div className="flex-grow">
                      {notification.href ? (
                        <Link href={notification.href} className="hover:underline" onClick={(e) => {
                            e.stopPropagation(); 
                            showLoading();
                             if (!notification.read && notification.id) handleMarkAsRead(notification.id);
                        }}>
                            <h3 className={`text-sm font-semibold ${!notification.read ? "text-primary" : ""}`}>
                              {notification.title}
                            </h3>
                        </Link>
                      ) : (
                        <h3 className={`text-sm font-semibold ${!notification.read ? "text-primary" : ""}`}>
                          {notification.title}
                        </h3>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {(() => {
                            const millis = getTimestampMillis(notification.createdAt);
                            return millis ? formatDistanceToNow(new Date(millis), { addSuffix: true }) : 'just now';
                        })()}
                      </p>
                    </div>
                    {!notification.read && (
                        <div className="h-2.5 w-2.5 bg-primary rounded-full shrink-0 mt-1.5" aria-label="Unread"></div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
    </Card>
  );
}

