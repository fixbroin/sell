"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Users, Eye, Trash2, Loader2, UserCircle, PackageSearch, ShieldCheck, ShieldAlert, XCircle, Search, Download, FileDown, UserCheck, UserX, UserPlus, Phone, Mail, Calendar, MessageCircle, ChevronDown, FileSpreadsheet, FileText as FilePdfIcon, CheckCircle2, Wallet } from "lucide-react";
import type { FirestoreUser, Address } from '@/types/firestore';
import { db } from '@/lib/firebase'; 
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, limit, startAfter, getDocs, where, type QueryDocumentSnapshot } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import UserDetailsModal from '@/components/admin/UserDetailsModal'; 
import ProviderWalletAdjustmentModal from '@/components/admin/provider/ProviderWalletAdjustmentModal';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import AppImage from '@/components/ui/AppImage';
import { openWhatsAppChooser } from '@/lib/whatsappUtils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getArchivedUsers } from '@/lib/adminDashboardUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { toggleUserStatusAction } from '@/app/actions/userStatusActions';

import { initializeUserNumbers } from '@/lib/systemStatsUtils';

import { resequenceUserNumbers } from '@/lib/systemStatsUtils';

import { useAdminStats } from '@/hooks/useAdminStats';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';

const formatUserTimestamp = (timestamp?: unknown, appConfig?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
};

const StatusBadge = ({ isActive, isLoading }: { isActive: boolean, isLoading: boolean }) => (
  <div className={cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold text-[10px] uppercase tracking-wider transition-all duration-300 shadow-sm",
    isActive 
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
      : "bg-destructive/10 text-destructive border-destructive/20"
  )}>
    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : (isActive ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />)}
    <span>{isActive ? 'Active' : 'Disabled'}</span>
  </div>
);

type SelectableUserField = Extract<keyof Omit<FirestoreUser, 'addresses' | 'fcmTokens' | 'marketingStatus' | 'roles' | 'photoURL'>, string> | 'fullAddress';

const availableFields: { key: SelectableUserField; label: string }[] = [
  { key: 'userNumber', label: 'Member #' },
  { key: 'displayName', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'mobileNumber', label: 'Mobile Number' },
  { key: 'fullAddress', label: 'Primary Address' },
  { key: 'walletBalance', label: 'Wallet Balance' },
  { key: 'isActive', label: 'Status' },
  { key: 'createdAt', label: 'Creation Date' },
  { key: 'lastLoginAt', label: 'Last Login' },
];

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { config: appConfig } = useApplicationConfig();
  const { stats } = useAdminStats();
  const { adminPermissions } = useAuth();
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedUserForModal, setSelectedUserForModal] = useState<FirestoreUser | null>(null);
  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);
  const [selectedUserForWallet, setSelectedUserForWallet] = useState<FirestoreUser | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedFields, setSelectedFields] = useState<Partial<Record<SelectableUserField, boolean>>>({
    displayName: true, email: true, mobileNumber: true, fullAddress: false, 
    walletBalance: false, isActive: true, createdAt: false, lastLoginAt: false,
    id: false, uid: false,
  });

  const handleSyncIDs = async () => {
    setIsSyncing(true);
    try {
      const result = await resequenceUserNumbers();
      if (result.success) {
        toast({ title: "Sync Complete", description: `Successfully re-sequenced ${result.count} users.` });
        const usersCollectionRef = collection(db, "users");
        const q = query(usersCollectionRef, orderBy("userNumber", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedUsers = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id, 
        } as FirestoreUser));
        setUsers(fetchedUsers);
      } else {
        toast({ title: "Sync Failed", description: result.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    setDisplayLimit(50);
    if (searchTerm.trim().length > 0) {
      const delayDebounceFn = setTimeout(async () => {
        setIsLoading(true);
        try {
          const usersRef = collection(db, "users");
          const term = searchTerm.trim();
          const lowerTerm = term.toLowerCase();
          const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
          
          const queries = [
            query(usersRef, where("email", ">=", term), where("email", "<=", term + '\uf8ff')),
            query(usersRef, where("email", ">=", lowerTerm), where("email", "<=", lowerTerm + '\uf8ff')),
            query(usersRef, where("mobileNumber", ">=", term), where("mobileNumber", "<=", term + '\uf8ff')),
            query(usersRef, where("displayName", ">=", term), where("displayName", "<=", term + '\uf8ff')),
            query(usersRef, where("displayName", ">=", capitalizedTerm), where("displayName", "<=", capitalizedTerm + '\uf8ff')),
          ];

          // Add phone variations and userNumber matching
          if (/^\d+$/.test(term)) {
            const numTerm = parseInt(term, 10);
            queries.push(query(usersRef, where("userNumber", "==", numTerm)));
            queries.push(query(usersRef, where("mobileNumber", ">=", `91${term}`), where("mobileNumber", "<=", `91${term}` + '\uf8ff')));
            queries.push(query(usersRef, where("mobileNumber", ">=", `+91${term}`), where("mobileNumber", "<=", `+91${term}` + '\uf8ff')));
            
            if (term.startsWith('91') && term.length > 2) {
              const without91 = term.substring(2);
              queries.push(query(usersRef, where("mobileNumber", ">=", without91), where("mobileNumber", "<=", without91 + '\uf8ff')));
            }
          }
          
          const snapShots = await Promise.all(queries.map(q => getDocs(q)));
          const results: FirestoreUser[] = [];
          snapShots.forEach(snap => {
            snap.docs.forEach(docSnap => {
              results.push({ ...docSnap.data(), id: docSnap.id } as FirestoreUser);
            });
          });

          const uniqueResults = Array.from(new Map(results.map(u => [u.id, u])).values());
          setUsers(uniqueResults);
          setHasMore(false);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setIsLoading(false);
        }
      }, 400);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setIsLoading(true);
      const fetchInitialUsers = async () => {
        try {
          const usersCollectionRef = collection(db, "users");
          const q = query(usersCollectionRef, orderBy("userNumber", "desc"));
          const querySnapshot = await getDocs(q);
          const fetchedUsers = querySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id, 
          } as FirestoreUser));
          setUsers(fetchedUsers);
          setHasMore(false);
        } catch (error) {
          console.error("Error fetching users:", error);
          toast({ title: "Fetch Error", description: "Could not load users.", variant: "destructive" });
        } finally {
          setIsLoading(false);
        }
      };

      fetchInitialUsers();
    }
  }, [searchTerm, sortOrder]);

  const loadMoreUsers = async () => {
    if (isLoadingMore || !hasMore || searchTerm.trim().length > 0 || !lastDoc) return;
    setIsLoadingMore(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(
        usersCollectionRef, 
        orderBy("createdAt", sortOrder), 
        startAfter(lastDoc), 
        limit(PAGE_SIZE)
      );
      
      const querySnapshot = await getDocs(q);
      const newUsers = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id, 
      } as FirestoreUser));
      
      if (newUsers.length > 0) {
        setUsers(prev => [...prev, ...newUsers]);
        setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more users:", error);
      toast({ title: "Error", description: "Failed to load more users.", variant: "destructive" });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let result = users.filter(user => user.displayName || user.email || user.mobileNumber || (user as any).phoneNumber);
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase().trim();
      const normalizedSearchPhone = lowerSearch.replace(/\D/g, '').replace(/^91/, '');

      result = result.filter(user => {
        const nameMatch = (user.displayName || '').toLowerCase().includes(lowerSearch);
        const emailMatch = (user.email || '').toLowerCase().includes(lowerSearch);
        const userPhone = (user.mobileNumber || '').replace(/\D/g, '').replace(/^91/, '');
        const phoneMatch = normalizedSearchPhone ? userPhone.includes(normalizedSearchPhone) : false;
        const numberMatch = user.userNumber?.toString() === lowerSearch;
        
        return nameMatch || emailMatch || phoneMatch || numberMatch;
      });
    }

    return [...result].sort((a, b) => (Number(b.userNumber) || 0) - (Number(a.userNumber) || 0));
  }, [users, searchTerm]);

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!userId) return;
    setIsUpdatingStatus(userId);
    try {
      const res = await toggleUserStatusAction(userId, currentStatus);
      if (res.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !currentStatus } : u));
        toast({ title: "Status Updated", description: `User is now ${!currentStatus ? 'Active' : 'Disabled'}.` });
      } else {
        toast({ title: "Error Updating Status", description: res.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error Updating Status", variant: "destructive" });
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId) return;
    setIsDeleting(userId);
    try {
      await Promise.all([
        deleteDoc(doc(db, "users", userId)),
        deleteDoc(doc(db, "providerApplications", userId)),
      ]);
      setUsers(prev => prev.filter(u => u.id !== userId && u.uid !== userId));
      await triggerRefresh('users'); // SmartSync
      toast({ title: "User Deleted", description: "All user records have been permanently removed." });
    } catch (error) {
      toast({ title: "Delete Failed", variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };
  
  const handleViewDetails = (user: FirestoreUser) => {
    setSelectedUserForModal(user);
    setIsUserDetailsModalOpen(true);
  };

  const handleUpdateUserFromModal = async (updatedUserData: Partial<FirestoreUser>) => {
    if (!selectedUserForModal?.id) return false;
    try {
        if (updatedUserData.email) {
          const emailQuery = query(collection(db, "users"), where("email", "==", updatedUserData.email.toLowerCase()), limit(1));
          const emailSnap = await getDocs(emailQuery);
          if (!emailSnap.empty && emailSnap.docs[0].id !== selectedUserForModal.id) {
            toast({ title: "Update Failed", description: "This email address is already linked to another account.", variant: "destructive" });
            return false;
          }
        }
        if (updatedUserData.mobileNumber) {
          const phoneQuery = query(collection(db, "users"), where("mobileNumber", "==", updatedUserData.mobileNumber), limit(1));
          const phoneSnap = await getDocs(phoneQuery);
          if (!phoneSnap.empty && phoneSnap.docs[0].id !== selectedUserForModal.id) {
            toast({ title: "Update Failed", description: "This mobile number is already linked to another account.", variant: "destructive" });
            return false;
          }
        }
        await updateDoc(doc(db, "users", selectedUserForModal.id), updatedUserData);
        await triggerRefresh('users'); // SmartSync
        toast({ title: "Updated", description: "User details synchronized." });
        setIsUserDetailsModalOpen(false);
        return true;
    } catch (error) {
        toast({ title: "Update Failed", variant: "destructive" });
        return false;
    }
  };

  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber: string) => {
    e.stopPropagation();
    const message = "Hi, I'm contacting you from Yourbrand.";
    openWhatsAppChooser(mobileNumber, message);
  };

  const formatAddress = (address?: Address): string => {
    if (!address) return 'N/A';
    return `${address.addressLine1}, ${address.city}, ${address.state} - ${address.pincode}`;
  };

  const processDataForDownload = () => {
    const headers = availableFields.filter(f => selectedFields[f.key]).map(f => f.label);
    const keys = availableFields.filter(f => selectedFields[f.key]).map(f => f.key);
    return {
      headers,
      data: filteredUsers.map(user => keys.map(key => {
        if (key === 'fullAddress') {
          const primaryAddress = user.addresses?.find(a => a.isDefault) || user.addresses?.[0];
          return primaryAddress ? formatAddress(primaryAddress) : "N/A";
        }
        if (key === 'createdAt' || key === 'lastLoginAt') {
          const timestamp = user[key];
          return timestamp ? formatUserTimestamp(timestamp, appConfig) : "N/A";
        }
        if (key === 'isActive') return user.isActive ? "Active" : "Disabled";
        return user[key as keyof FirestoreUser] ?? 'N/A';
      }))
    };
  };

  const handleDownload = (format: 'csv' | 'excel' | 'pdf') => {
    const { headers, data } = processDataForDownload();
    if (data.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `users_export_${timestamp}`;
    
    if (format === 'csv' || format === 'excel') {
      const escapeCSVField = (val: any): string => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSVField).join(','),
        ...data.map(row => row.map(escapeCSVField).join(','))
      ].join('\n');
      
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text("User Directory Export", 14, 16);
      (doc as unknown as { autoTable: (options: Record<string, unknown>) => void }).autoTable({ head: [headers], body: data, startY: 20 });
      doc.save(`${filename}.pdf`);
    }
  };

  const renderUserCard = (user: FirestoreUser, idx: number) => (
    <motion.div 
      key={user.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
      className="p-5 border-b last:border-none bg-card hover:bg-muted/30 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3 text-left">
          <div className="relative">
            <Avatar 
              className="h-12 w-12 border-2 border-primary/10 shadow-sm cursor-zoom-in"
              onClick={() => user.photoURL && setSelectedImage(user.photoURL)}
            >
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || undefined} />
              <AvatarFallback className="bg-primary/5 text-primary font-black uppercase">
                {user.displayName ? user.displayName.charAt(0) : <UserCircle size={24}/>}
              </AvatarFallback>
            </Avatar>
            <div className={cn("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2 border-background rounded-full", user.isActive ? "bg-emerald-500" : "bg-destructive")} />
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm text-foreground truncate tracking-tight">{user.displayName || 'Anonymous User'}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">ID: {user.uid || user.id || 'N/A'}</p>
          </div>
        </div>
        <StatusBadge isActive={user.isActive} isLoading={isUpdatingStatus === user.id} />
      </div>

      <div className="grid grid-cols-1 gap-2 mb-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary/60" />
          <span className="font-bold text-primary">Member #{user.userNumber || '...'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Mail className="h-3.5 w-3.5 text-primary/60" />
          <span className="truncate">{user.email || 'N/A'}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Phone className="h-3.5 w-3.5 text-primary/60" />
            <a href={`tel:${user.mobileNumber}`} className="text-primary hover:underline font-medium">{user.mobileNumber || 'No Phone'}</a>
          </div>
          {user.mobileNumber && (
            <button onClick={(e) => handleWhatsAppClick(e, user.mobileNumber!)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-md transition-colors" title="WhatsApp">
              <img src="/whatsapp.png" alt="WA" className="h-7 w-7" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-primary/60" />
          <span>Joined {formatUserTimestamp(user.createdAt, appConfig)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-dashed">
        <Button 
          variant="outline" 
          className="flex-grow h-10 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300" 
          onClick={() => handleViewDetails(user)}
        >
          <Eye className="h-4 w-4 mr-2" /> View Details
        </Button>
        <PermissionGuard moduleId="users" action="write">
          <Button 
            variant="ghost"
            className={cn(
              "h-10 px-3 rounded-xl shadow-sm transition-all duration-300",
              user.isActive 
                ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white" 
                : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white"
            )}
            onClick={() => handleToggleUserStatus(user.id, user.isActive)}
            disabled={isUpdatingStatus === user.id}
          >
            {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </Button>
        </PermissionGuard>
        <PermissionGuard moduleId="users" action="delete">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="h-10 px-3 rounded-xl bg-destructive/5 text-destructive border border-destructive/10 hover:bg-destructive hover:text-white transition-all duration-300 shadow-sm" disabled={isDeleting === user.id || !user.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[2.5rem]">
              <AlertDialogHeader>
                <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><ShieldAlert className="h-6 w-6 text-destructive" /></div>
                <AlertDialogTitle className="text-xl font-black tracking-tight uppercase">Confirm Deletion</AlertDialogTitle>
                <AlertDialogDescription className="font-medium text-sm">Remove <span className="text-destructive font-black underline">{user.displayName || user.email}</span> from system?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel className="rounded-xl border-none bg-muted">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteUser(user.id!)} className="bg-destructive hover:bg-destructive/90 rounded-xl px-6">Confirm Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PermissionGuard>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <Users className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Community Database</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">User Directory <span className="text-primary/40 ml-2">({filteredUsers.length || stats.activeUsers})</span></h1>
          <p className="text-muted-foreground text-sm font-medium">Manage and audit your registered user ecosystem.</p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                className="h-10 rounded-xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all duration-300"
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            >
                {sortOrder === 'desc' ? <ChevronDown className="mr-2 h-3 w-3" /> : <UserPlus className="mr-2 h-3 w-3 rotate-180" />}
                {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
            </Button>
            <Button 
                variant="outline" 
                className="h-10 rounded-xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all duration-300"
                onClick={handleSyncIDs}
                disabled={isSyncing}
            >
                {isSyncing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                Sync Member IDs
            </Button>
        </div>
      </header>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
        <CardHeader className="p-8 pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="relative flex-grow w-full max-w-2xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors"/>
              <Input placeholder="Search name, email, or mobile..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 h-14 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-[1.25rem] font-medium transition-all shadow-inner" />
              {searchTerm && (
                  <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary" onClick={() => setSearchTerm('')}>
                      <XCircle className="h-5 w-5 text-muted-foreground"/>
                  </Button>
              )}
            </div>
            <Button 
              className="h-14 px-6 rounded-[1.25rem] bg-primary text-primary-foreground font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all duration-300"
              onClick={() => setIsExportDialogOpen(true)}
            >
                <Download className="mr-2.5 h-4 w-4" /> Export Data
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col justify-center items-center h-[400px] space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] animate-pulse">Scanning Registry...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-32 bg-muted/5">
              <PackageSearch className="h-16 w-16 mx-auto text-muted-foreground/20 mb-6" />
              <p className="text-xl font-bold tracking-tight text-foreground">Zero Matches Found</p>
              <p className="text-muted-foreground text-sm mt-1">{searchTerm ? "Adjust your search filters." : "No users currently registered."}</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="w-[80px] pl-8 py-5 text-[10px] font-black uppercase tracking-widest text-foreground"># ID</TableHead>
                      <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest text-foreground text-center">Profile</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Legal Name & UID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Communications</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground">Registered</TableHead>
                      <TableHead className="text-center text-[10px] font-black uppercase tracking-widest text-foreground">Live Status</TableHead>
                      <TableHead className="text-right pr-8 text-[10px] font-black uppercase tracking-widest text-foreground">Management</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {filteredUsers.slice(0, displayLimit).map((user, idx) => (
                        <motion.tr key={user.id} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: idx < 15 ? idx * 0.03 : 0 }} className="group border-b border-muted/40 transition-all hover:bg-primary/[0.02]">
                          <TableCell className="pl-8">
                            <div className="bg-primary/5 text-primary font-black text-xs h-9 w-9 rounded-xl flex items-center justify-center border border-primary/10 shadow-sm">
                                {user.userNumber || '...'}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Avatar 
                              className="h-10 w-10 border shadow-sm group-hover:scale-110 transition-transform cursor-zoom-in mx-auto"
                              onClick={() => user.photoURL && setSelectedImage(user.photoURL)}
                            >
                              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || undefined} />
                              <AvatarFallback className="text-xs font-black bg-primary/10 text-primary">{user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">{user.displayName || "Unset Name"}</span>
                              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter" title={user.uid || user.id || ''}>{(user.uid || user.id || 'N/A').substring(0,14)}...</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground truncate max-w-[200px]"><Mail className="h-3 w-3 text-primary/60 shrink-0" /> {user.email}</div>
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Phone className="h-3 w-3 text-primary/60 shrink-0" /> 
                                <a href={`tel:${user.mobileNumber}`} className="hover:underline">{user.mobileNumber || "No Contact"}</a>
                                {user.mobileNumber && <button onClick={(e) => handleWhatsAppClick(e, user.mobileNumber!)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-md transition-colors"><img src="/whatsapp.png" alt="WA" className="h-5 w-5" /></button>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-black text-muted-foreground uppercase tracking-tighter">{formatUserTimestamp(user.createdAt, appConfig)}</TableCell>
                          <TableCell className="text-center">
                            <PermissionGuard moduleId="users" action="write" fallback={<StatusBadge isActive={user.isActive} isLoading={false} />}>
                              <button onClick={() => handleToggleUserStatus(user.id, user.isActive)} className="focus:outline-none" disabled={isUpdatingStatus === user.id}>
                                <StatusBadge isActive={user.isActive} isLoading={isUpdatingStatus === user.id} />
                              </button>
                            </PermissionGuard>
                          </TableCell>
                          <TableCell className="pr-8 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {user.roles?.includes('provider') && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-9 w-9 rounded-xl hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-sm border border-emerald-500/10" 
                                  onClick={() => { setSelectedUserForWallet(user); setIsWalletModalOpen(true); }}
                                  title="Adjust Wallet"
                                >
                                  <Wallet className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-sm border border-primary/10" onClick={() => handleViewDetails(user)}><Eye className="h-4 w-4" /></Button>
                              <PermissionGuard moduleId="users" action="delete">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-destructive hover:text-destructive-foreground transition-all duration-300 shadow-sm border border-destructive/10" disabled={isDeleting === user.id || !user.id}><Trash2 className="h-4 w-4" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl bg-card">
                                    <AlertDialogHeader>
                                      <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><ShieldAlert className="h-6 w-6 text-destructive" /></div>
                                      <AlertDialogTitle className="text-2xl font-black tracking-tight uppercase text-foreground">User Expulsion</AlertDialogTitle>
                                      <AlertDialogDescription className="text-base font-medium text-muted-foreground">This will permanently erase <span className="text-destructive font-black underline">{user.displayName || user.email}</span> from the Firestore database.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="mt-8 gap-3">
                                      <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 text-foreground">Retain</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteUser(user.id!)} className="rounded-xl bg-destructive hover:bg-destructive/90 px-8 text-white">Confirm Erase</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </PermissionGuard>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden">
                <AnimatePresence initial={false}>
                  {filteredUsers.slice(0, displayLimit).map((user, idx) => renderUserCard(user, idx))}
                </AnimatePresence>
              </div>

              {filteredUsers.length > displayLimit && (
                <div className="p-8 text-center border-t border-muted/40 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                  <div>
                    Showing first {Math.min(displayLimit, filteredUsers.length)} of {filteredUsers.length} users.
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDisplayLimit(prev => prev + 50)}>
                      Load More (+50)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDisplayLimit(filteredUsers.length)}>
                      Load All ({filteredUsers.length})
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedUserForModal && (
        <Dialog open={isUserDetailsModalOpen} onOpenChange={setIsUserDetailsModalOpen}>
          <DialogContent aria-describedby={undefined} className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
            <UserDetailsModal user={selectedUserForModal} onClose={() => setIsUserDetailsModalOpen(false)} onUpdateUser={handleUpdateUserFromModal} />
          </DialogContent>
        </Dialog>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-md p-0 border-none bg-transparent shadow-none flex items-center justify-center">
          <DialogHeader className="sr-only">
            <DialogTitle>Profile Photo Preview</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="relative w-[90vw] h-[90vw] max-w-[400px] max-h-[400px] rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl bg-card">
              <AppImage src={selectedImage} alt="Profile Preview" fill className="object-cover" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md"
                onClick={() => setSelectedImage(null)}
              >
                <XCircle className="h-6 w-6" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] border-none shadow-2xl rounded-[2.5rem] p-8 bg-card">
          <DialogHeader>
            <div className="bg-primary/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase text-foreground">Export Directory</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">Select the data columns you wish to include in your document.</DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <div className="grid grid-cols-2 gap-4">
              {availableFields.map(field => (
                <div key={field.key} className="flex items-center space-x-3 p-3 rounded-xl border bg-muted/20 hover:bg-primary/5 transition-colors">
                  <Checkbox 
                    id={`field-${field.key}`} 
                    checked={selectedFields[field.key]} 
                    onCheckedChange={(checked) => setSelectedFields(prev => ({...prev, [field.key]: !!checked}))}
                    className="h-5 w-5 rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label htmlFor={`field-${field.key}`} className="text-xs font-bold cursor-pointer flex-grow py-1 text-foreground">{field.label}</Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 w-full">
              <Button onClick={() => { handleDownload('pdf'); setIsExportDialogOpen(false); }} className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all duration-300">
                <FilePdfIcon className="mr-2 h-4 w-4" /> Download PDF Document
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => { handleDownload('excel'); setIsExportDialogOpen(false); }} variant="outline" className="h-12 rounded-xl border-2 border-accent/20 text-accent font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-accent-foreground transition-all duration-300">
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                </Button>
                <Button onClick={() => { handleDownload('csv'); setIsExportDialogOpen(false); }} variant="outline" className="h-12 rounded-xl border-2 border-primary/20 text-primary font-bold text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all duration-300">
                  <FileDown className="mr-2 h-4 w-4" /> CSV Raw
                </Button>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)} className="w-full h-11 rounded-xl bg-destructive/5 text-destructive font-black text-[10px] uppercase tracking-[0.2em] mt-2 border border-destructive/10 hover:bg-destructive hover:text-white transition-all duration-300">
              Cancel Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedUserForWallet && (
        <ProviderWalletAdjustmentModal 
          isOpen={isWalletModalOpen}
          onClose={() => { setIsWalletModalOpen(false); setSelectedUserForWallet(null); }}
          providerId={selectedUserForWallet.id || selectedUserForWallet.uid!}
          providerName={selectedUserForWallet.displayName || 'Provider'}
        />
      )}
    </div>
  );
}
