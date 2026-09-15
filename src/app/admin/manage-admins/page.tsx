"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  Timestamp,
  orderBy
} from '@/lib/mysqlDb';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Loader2, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle,
  Lock,
  Eye,
  EyeOff,
  Settings2,
  Edit,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { AdminPermissions, PERMISSION_MODULES, DEFAULT_PERMISSIONS } from '@/config/rbac';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: AdminPermissions;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
}

export default function ManageAdminsPage() {
  const { isSuperAdmin, user: currentUser } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [newAdmin, setNewAdmin] = useState({ 
    email: '', 
    name: '', 
    password: '',
    role: 'staff_admin',
    permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)) as AdminPermissions 
  });
  
  const { toast } = useToast();

  const generateStrongPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewAdmin(prev => ({ ...prev, password }));
    setShowPassword(true);
    toast({ title: "Secure Password Generated", description: "Password has been set to a strong random string." });
  };

  const validatePassword = (pass: string) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(pass);
    const hasLowerCase = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSymbol = /[!@#$%^&*()_+]/.test(pass);
    
    return pass.length >= minLength && hasUpperCase && hasLowerCase && hasNumber && hasSymbol;
  };

  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRolePickerOpen, setIsRolePickerOpen] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const q = query(collection(db, 'admins'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adminList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AdminUser));
      setAdmins(adminList);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isSuperAdmin]);

  const handlePermissionChange = (moduleId: string, type: 'read' | 'create' | 'write' | 'delete', checked: boolean) => {
    setNewAdmin(prev => {
        const updated = { ...prev };
        if (!updated.permissions[moduleId]) updated.permissions[moduleId] = { read: false, create: false, write: false, delete: false };
        updated.permissions[moduleId][type] = checked;
        // Auto-enable read if create, write or delete is checked
        if (checked && (type === 'create' || type === 'write' || type === 'delete')) {
            updated.permissions[moduleId].read = true;
        }
        return updated;
    });
  };

  const handleEditPermissionChange = (moduleId: string, type: 'read' | 'create' | 'write' | 'delete', checked: boolean) => {
    if (!editingAdmin) return;
    setEditingAdmin(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (!updated.permissions) updated.permissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
      
      const permissions = updated.permissions!;
      if (!permissions[moduleId]) permissions[moduleId] = { read: false, create: false, write: false, delete: false };
      permissions[moduleId][type] = checked;
      if (checked && (type === 'create' || type === 'write' || type === 'delete')) {
          permissions[moduleId].read = true;
      }
      return updated;
    });
  };

  const openEditDialog = (admin: AdminUser) => {
    setEditingAdmin({
      ...admin,
      permissions: admin.permissions ? JSON.parse(JSON.stringify(admin.permissions)) : JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateAdminPermissions = async () => {
    if (!editingAdmin) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'admins', editingAdmin.id), {
        permissions: editingAdmin.permissions,
        role: editingAdmin.role // allow role update too
      });
      toast({ title: "Success", description: "Permissions updated successfully" });
      setIsEditDialogOpen(false);
      setEditingAdmin(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdmin.email || !newAdmin.name || !newAdmin.password) {
      toast({ title: "Error", description: "Please fill in email, name, and password", variant: "destructive" });
      return;
    }

    if (!validatePassword(newAdmin.password)) {
        toast({ 
            title: "Weak Password", 
            description: "Password must be at least 8 characters and include uppercase, numbers, and symbols.", 
            variant: "destructive" 
        });
        return;
    }

    setIsAdding(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/admin/manage-staff', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newAdmin)
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "Success", description: "Staff account created successfully" });
        setNewAdmin({ 
            email: '', 
            name: '', 
            password: '',
            role: 'staff_admin',
            permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)) 
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleStatus = async (uid: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'admins', uid), { status: newStatus });
      toast({ title: "Success", description: `Admin ${newStatus === 'active' ? 'activated' : 'deactivated'}` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const handleDeleteAdmin = async (uid: string) => {
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/admin/manage-staff', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });

      if (response.ok) {
        toast({ title: "Success", description: "Admin removed" });
      } else {
        const result = await response.json();
        throw new Error(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-black">Restricted Access</h2>
        <p className="text-muted-foreground">Only Super Admins can manage staff permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Security Center</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">Enterprise Staff Management</h1>
          <p className="text-muted-foreground text-sm font-medium">Provision accounts and set granular module permissions.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        {/* Add New Admin Form */}
        <div className="xl:col-span-2 space-y-8">
            <Card className="border-none shadow-xl rounded-[2rem] bg-card">
                <CardHeader>
                    <CardTitle className="text-xl font-black">1. Account Details</CardTitle>
                    <CardDescription>Create a new login for your staff member.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Staff Name</label>
                        <Input 
                            placeholder="e.g. Ravi Kumar" 
                            value={newAdmin.name} 
                            onChange={(e) => setNewAdmin({...newAdmin, name: e.target.value})}
                            className="rounded-xl bg-muted/30 border-none h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Email Address</label>
                        <Input 
                            placeholder="ravi@gmail.com" 
                            type="email"
                            value={newAdmin.email} 
                            onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})}
                            className="rounded-xl bg-muted/30 border-none h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Set Password</label>
                            <button 
                                onClick={generateStrongPassword}
                                className="text-[10px] font-black text-primary uppercase hover:underline"
                            >
                                Generate Strong
                            </button>
                        </div>
                        <div className="relative">
                            <Input 
                                placeholder="Enter secure password" 
                                type={showPassword ? "text" : "password"}
                                value={newAdmin.password} 
                                onChange={(e) => setNewAdmin({...newAdmin, password: e.target.value})}
                                className={`rounded-xl bg-muted/30 border-none h-12 pr-10 ${newAdmin.password && !validatePassword(newAdmin.password) ? 'ring-1 ring-amber-500' : ''}`}
                            />
                            <button 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {newAdmin.password && (
                            <div className="flex flex-col gap-1 mt-1">
                                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${
                                            validatePassword(newAdmin.password) ? 'w-full bg-emerald-500' : 'w-1/3 bg-amber-500'
                                        }`} 
                                    />
                                </div>
                                <p className="text-[9px] font-bold text-muted-foreground">
                                    {validatePassword(newAdmin.password) 
                                        ? "Strong password" 
                                        : "Min 8 chars, including A-Z, 0-9, and @#$"}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1 block">Base Role</label>
                        <Dialog open={isRolePickerOpen} onOpenChange={setIsRolePickerOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between text-left font-normal h-12 rounded-xl bg-muted/30 border-none px-4"
                                    type="button"
                                >
                                    <span>
                                        {newAdmin.role === "staff_admin" 
                                            ? "Staff Admin (Custom Permissions)" 
                                            : newAdmin.role === "super_admin" 
                                            ? "Super Admin (All Permissions)" 
                                            : "Select Role..."}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Select Role</DialogTitle>
                                    <DialogDescription>
                                        Choose the base administrative role.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <div className="space-y-1">
                                        <Button
                                            variant={newAdmin.role === "staff_admin" ? "secondary" : "ghost"}
                                            className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                            onClick={() => {
                                                setNewAdmin({...newAdmin, role: "staff_admin"});
                                                setIsRolePickerOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className="text-sm font-medium">Staff Admin (Custom Permissions)</span>
                                            {newAdmin.role === "staff_admin" && (
                                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                            )}
                                        </Button>
                                        <Button
                                            variant={newAdmin.role === "super_admin" ? "secondary" : "ghost"}
                                            className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                            onClick={() => {
                                                setNewAdmin({...newAdmin, role: "super_admin"});
                                                setIsRolePickerOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className="text-sm font-medium">Super Admin (All Permissions)</span>
                                            {newAdmin.role === "super_admin" && (
                                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardContent>
            </Card>

            {newAdmin.role !== 'super_admin' && (
                <Card className="border-none shadow-xl rounded-[2rem] bg-card overflow-hidden">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="text-xl font-black flex items-center">
                            <Settings2 className="h-5 w-5 mr-2 text-primary" />
                            2. Permission Matrix
                        </CardTitle>
                        <CardDescription>Select which modules this staff can access.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[450px]">
                            <Table>
                                <TableHeader className="bg-muted/30 sticky top-0 z-10">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest pl-6">Module</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">View</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Create</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Edit</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-center pr-6">Delete</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {PERMISSION_MODULES.filter(m => m.id !== 'staff').map((module) => (
                                        <TableRow key={module.id} className="border-b border-muted/40 last:border-none">
                                            <TableCell className="pl-6 py-4">
                                                <span className="font-bold text-xs">{module.label}</span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Checkbox 
                                                    checked={newAdmin.permissions[module.id]?.read} 
                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'read', !!checked)} 
                                                    className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Checkbox 
                                                    checked={newAdmin.permissions[module.id]?.create} 
                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'create', !!checked)} 
                                                    className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Checkbox 
                                                    checked={newAdmin.permissions[module.id]?.write} 
                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'write', !!checked)}
                                                    className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center pr-6">
                                                <Checkbox 
                                                    checked={newAdmin.permissions[module.id]?.delete} 
                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'delete', !!checked)}
                                                    className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                    <div className="p-3 bg-muted/20 border-t">
                        <Button 
                            className="w-full h-12 rounded-xl bg-primary font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20"
                            onClick={handleAddAdmin}
                            disabled={isAdding}
                        >
                            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                            Create Staff Account
                        </Button>
                    </div>
                </Card>
            )}

            {newAdmin.role === 'super_admin' && (
                <div className="p-4 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 text-amber-600 space-y-4">
                    <div className="flex items-center space-x-2">
                        <ShieldAlert className="h-5 w-5" />
                        <span className="font-black uppercase text-xs tracking-widest">Warning</span>
                    </div>
                    <p className="text-xs font-bold leading-relaxed">
                        Super Admins receive full permissions across all modules automatically. Be careful who you assign this role to.
                    </p>
                    <Button 
                        className="w-full h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-xs tracking-widest shadow-lg shadow-amber-600/20"
                        onClick={handleAddAdmin}
                        disabled={isAdding}
                    >
                        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                        Create Super Admin
                    </Button>
                </div>
            )}
        </div>

        {/* Admin List */}
        <Card className="xl:col-span-3 border-none shadow-xl rounded-[2rem] bg-card">
          <CardHeader>
            <CardTitle className="text-xl font-black text-primary">Active Staff Directory</CardTitle>
            <CardDescription>Manage existing accounts and their access status.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center h-[300px]">
                <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-[10px] font-black uppercase tracking-widest px-6">Staff Member</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Email</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Access Status</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest px-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id} className="border-b border-muted/40 last:border-none group">
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm group-hover:text-primary transition-colors">{admin.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                                admin.role === 'super_admin' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'
                            }`}>
                                {admin.role.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium text-muted-foreground">{admin.email}</span>
                      </TableCell>
                      <TableCell>
                        <PermissionGuard moduleId="manage_admins" action="write" fallback={
                           <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            admin.status === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                              : 'bg-destructive/10 text-destructive border-destructive/20'
                          }`}>
                            {admin.status === 'active' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                            {admin.status}
                          </div>
                        }>
                          {admin.role === 'super_admin' ? (
                            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border opacity-50 cursor-not-allowed ${
                              admin.status === 'active' 
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                                : 'bg-destructive/10 text-destructive border-destructive/20'
                            }`}>
                              {admin.status === 'active' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                              {admin.status}
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleToggleStatus(admin.id, admin.status)}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                                admin.status === 'active' 
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500 hover:text-white' 
                                  : 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive hover:text-white'
                              }`}
                            >
                              {admin.status === 'active' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                              {admin.status}
                            </button>
                          )}
                        </PermissionGuard>
                      </TableCell>
                      <TableCell className="px-6 text-right space-x-2">
                        {admin.role !== 'super_admin' && (
                            <PermissionGuard moduleId="manage_admins" action="write">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 rounded-xl text-primary hover:bg-primary/10 hover:scale-110 transition-all"
                                onClick={() => openEditDialog(admin)}
                              >
                                  <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGuard>
                        )}
                        
                        {/* 
                          STRICT PROTECTION LOGIC:
                          1. Cannot delete yourself (admin.id !== currentUser?.uid).
                          2. If the target is the PRIMARY Main Admin (ADMIN_EMAIL):
                             - Only the Main Admin themselves can delete a record with this email (to clean up ghosts/duplicates).
                          3. If the target is ANOTHER Super Admin:
                             - Only the PRIMARY Main Admin can delete them.
                        */}
                        {admin.id !== currentUser?.uid && (
                          // Case A: I am the Primary Main Admin - I can delete anyone (except my active self)
                          (currentUser?.email === ADMIN_EMAIL) || 
                          // Case B: I am another admin - I can ONLY delete staff/staff_admins (not main admin, not other super admins)
                          (admin.role !== 'super_admin' && admin.email !== ADMIN_EMAIL)
                        ) && (
                            <PermissionGuard moduleId="manage_admins" action="delete">
                              <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 hover:scale-110 transition-all">
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
                                      <AlertDialogHeader>
                                          <AlertDialogTitle className="font-black uppercase tracking-tight text-destructive flex items-center">
                                              <ShieldAlert className="h-5 w-5 mr-2" />
                                              Revoke Access?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription className="font-medium text-slate-600 dark:text-slate-400">
                                              This will immediately remove <span className="font-black underline text-slate-900 dark:text-slate-100">{admin.email}</span> from the admin panel.
                                              {admin.email === ADMIN_EMAIL && " (Note: You are deleting a duplicate ghost record of yourself)"}
                                          </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter className="mt-4 gap-2">
                                          <AlertDialogCancel className="rounded-xl border-none bg-muted font-bold text-xs uppercase tracking-widest px-6">Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteAdmin(admin.id)} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black text-xs uppercase tracking-widest px-6">Yes, Revoke Access</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                              </AlertDialog>
                            </PermissionGuard>
                        )}

                        {admin.id === currentUser?.uid && (
                            <div className="inline-flex items-center px-2 py-1 rounded bg-primary/10 text-[9px] font-black text-primary uppercase">
                                <Lock className="h-3 w-3 mr-1" /> My Account
                            </div>
                        )}

                        {/* Visual indicator for protected Main Admin when viewed by others */}
                        {admin.email === ADMIN_EMAIL && admin.id !== currentUser?.uid && currentUser?.email !== ADMIN_EMAIL && (
                            <div className="inline-flex items-center px-2 py-1 rounded bg-amber-500/10 text-[9px] font-black text-amber-600 uppercase">
                                <ShieldCheck className="h-3 w-3 mr-1" /> Primary Admin
                            </div>
                        )}

                        {/* Visual indicator for protected Super Admins when viewed by regular staff admins */}
                        {admin.role === 'super_admin' && admin.email !== ADMIN_EMAIL && admin.id !== currentUser?.uid && currentUser?.email !== ADMIN_EMAIL && (
                            <div className="inline-flex items-center px-2 py-1 rounded bg-slate-500/10 text-[9px] font-black text-slate-600 uppercase">
                                <Lock className="h-3 w-3 mr-1" /> Protected
                            </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Permissions Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl rounded-[2rem] border-none shadow-2xl overflow-hidden p-0">
          <DialogHeader className="p-3 bg-primary/5 pb-4">
            <DialogTitle className="text-xl font-black flex items-center">
              <Settings2 className="h-5 w-5 mr-2 text-primary" />
              Edit Permissions for {editingAdmin?.name}
            </DialogTitle>
            <DialogDescription>
              Modify the module access levels for this staff member.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] px-6 pb-6">
            {editingAdmin && (
              <Table>
                  <TableHeader className="bg-muted/30 sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest pl-4">Module</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">View</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Create</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Edit</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-center pr-4">Delete</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {PERMISSION_MODULES.filter(m => m.id !== 'staff').map((module) => (
                          <TableRow key={module.id} className="border-b border-muted/40 last:border-none">
                              <TableCell className="pl-4 py-3">
                                  <span className="font-bold text-xs">{module.label}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                  <Checkbox 
                                      checked={editingAdmin.permissions?.[module.id]?.read} 
                                      onCheckedChange={(checked) => handleEditPermissionChange(module.id, 'read', !!checked)} 
                                      className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                  />
                              </TableCell>
                              <TableCell className="text-center">
                                  <Checkbox 
                                      checked={editingAdmin.permissions?.[module.id]?.create} 
                                      onCheckedChange={(checked) => handleEditPermissionChange(module.id, 'create', !!checked)} 
                                      className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                  />
                              </TableCell>
                              <TableCell className="text-center">
                                  <Checkbox 
                                      checked={editingAdmin.permissions?.[module.id]?.write} 
                                      onCheckedChange={(checked) => handleEditPermissionChange(module.id, 'write', !!checked)}
                                      className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                  />
                              </TableCell>
                              <TableCell className="text-center pr-4">
                                  <Checkbox 
                                      checked={editingAdmin.permissions?.[module.id]?.delete} 
                                      onCheckedChange={(checked) => handleEditPermissionChange(module.id, 'delete', !!checked)}
                                      className="rounded-md border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                  />
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
            )}
          </ScrollArea>

          <DialogFooter className="p-3 bg-muted/10 border-t">
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl font-bold uppercase tracking-widest text-xs">
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAdminPermissions} 
              disabled={isUpdating}
              className="rounded-xl bg-primary font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 px-8"
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
