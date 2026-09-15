
"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ReceiptText, ListChecks } from "lucide-react";
import CreateQuotationForm from "@/components/admin/quotation-invoice/CreateQuotationForm";
import CreateInvoiceForm from "@/components/admin/quotation-invoice/CreateInvoiceForm";
import ManageQuotationsTab from '@/components/admin/quotation-invoice/ManageQuotationsTab';
import ManageInvoicesTab from '@/components/admin/quotation-invoice/ManageInvoicesTab';
import type { FirestoreQuotation, FirestoreInvoice } from '@/types/firestore';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { Switch } from '@/components/ui/switch';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, getDocs, setDoc } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";

export default function QuotationInvoicePage() {
  const [activeTab, setActiveTab] = useState("create_quotation");
  const [editingQuotation, setEditingQuotation] = useState<FirestoreQuotation | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<FirestoreInvoice | null>(null);
  const [allowProviderDelete, setAllowProviderDelete] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const settingsRef = doc(db, "webSettings", "quotationInvoiceSettings");
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAllowProviderDelete(data.allowProviderDelete !== false);
      } else {
        setAllowProviderDelete(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleToggleProviderDelete = async (checked: boolean) => {
    setIsSavingSettings(checked);
    try {
      await setDoc(doc(db, "webSettings", "quotationInvoiceSettings"), {
        allowProviderDelete: checked,
        updatedAt: Timestamp.now()
      }, { merge: true });
      toast({
        title: "Settings Updated",
        description: `Providers are now ${checked ? "allowed" : "restricted"} from deleting quotations/invoices.`
      });
      setAllowProviderDelete(checked);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Could not update settings.",
        variant: "destructive"
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleEditQuotation = (quotation: FirestoreQuotation) => {
    setEditingQuotation(quotation);
    setActiveTab("create_quotation"); 
  };

  const handleEditInvoice = (invoice: FirestoreInvoice) => {
    setEditingInvoice(invoice);
    setActiveTab("create_invoice"); 
  };
  
  const handleSaveOrUpdateQuotation = (savedQuotation: FirestoreQuotation) => {
    setEditingQuotation(savedQuotation); // Keep the form populated with the saved data
    // No automatic tab switch here, user can decide to send/download or create new.
  };

  const handleSaveOrUpdateInvoice = (savedInvoice: FirestoreInvoice) => {
    setEditingInvoice(savedInvoice); // Keep the form populated
  };
  
  useEffect(() => {
    if (activeTab !== "create_quotation" && editingQuotation) {
      // If user navigates away from create_quotation tab while editing a quotation,
      // clear it so next time they come back to "Create Quotation" it's a fresh form.
      // But if they just saved and are still on the tab, editingQuotation holds the current item.
      // This behavior might need refinement based on desired UX.
      // For now, let's keep it simple: if tab changes, clear edit state for that tab.
      setEditingQuotation(null);
    }
    if (activeTab !== "create_invoice" && editingInvoice) {
      setEditingInvoice(null);
    }
  }, [activeTab]); // Removed editingQuotation and editingInvoice from deps to avoid loop

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <ReceiptText className="mr-2 h-6 w-6 text-primary" /> Quotations & Invoices
          </CardTitle>
          <CardDescription>
            Create, manage, and track quotations and invoices for your customers.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Configuration Controls */}
      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-sm text-slate-800">Quotation & Invoice Controls</h4>
            <p className="text-xs text-muted-foreground">Toggle whether providers are allowed to delete their generated quotations and invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Allow Providers to Delete:</span>
            <Switch 
              checked={allowProviderDelete} 
              onCheckedChange={handleToggleProviderDelete} 
              disabled={isSavingSettings}
            />
            <span className="text-xs font-semibold text-slate-800">{allowProviderDelete ? "Enabled" : "Disabled"}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="create_quotation"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <FileText className="mr-2 h-4 w-4" /> {editingQuotation ? "Edit Quotation" : "Create Quotation"}
            </TabsTrigger>
            <TabsTrigger 
              value="manage_quotations"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ListChecks className="mr-2 h-4 w-4" /> Manage Quotations
            </TabsTrigger>
            <TabsTrigger 
              value="create_invoice"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ReceiptText className="mr-2 h-4 w-4" /> {editingInvoice ? "Edit Invoice" : "Create Invoice"}
            </TabsTrigger>
            <TabsTrigger 
              value="manage_invoices"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ListChecks className="mr-2 h-4 w-4" /> Manage Invoices
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="create_quotation" className="mt-0 focus-visible:outline-none">
          <CreateQuotationForm
            key={editingQuotation ? `edit-q-${editingQuotation.id}` : 'create-q'}
            initialData={editingQuotation}
            onSaveSuccess={handleSaveOrUpdateQuotation}
          />
        </TabsContent>
        <TabsContent value="manage_quotations">
          <ManageQuotationsTab onEditQuotation={handleEditQuotation} />
        </TabsContent>
        <TabsContent value="create_invoice">
          <PermissionGuard moduleId="quotation_invoice" action={editingInvoice ? "write" : "create"} fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to {editingInvoice ? "edit" : "create"} invoices.</div>}>
            <CreateInvoiceForm
              key={editingInvoice ? `edit-i-${editingInvoice.id}` : 'create-i'}
              initialData={editingInvoice}
              onSaveSuccess={handleSaveOrUpdateInvoice}
            />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value="manage_invoices">
          <ManageInvoicesTab onEditInvoice={handleEditInvoice} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
