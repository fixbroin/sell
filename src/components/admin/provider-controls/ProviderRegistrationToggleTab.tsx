
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Power } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { AppSettings, CustomBankField } from '@/types/firestore';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";

export default function ProviderRegistrationToggleTab() {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState(true);
  const [isChequeCompulsory, setIsChequeCompulsory] = useState(false);
  const [enableDefaultIndianKyc, setEnableDefaultIndianKyc] = useState(true);
  
  const [enableCancelledChequeUpload, setEnableCancelledChequeUpload] = useState(true);
  const [enableSignatureUpload, setEnableSignatureUpload] = useState(true);
  const [customBankFields, setCustomBankFields] = useState<CustomBankField[]>([]);

  // New field form state
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'alphanumeric'>('alphanumeric');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(true);

  useEffect(() => {
    if (!isLoadingAppConfig && appConfig) {
      setIsRegistrationEnabled(appConfig.isProviderRegistrationEnabled === undefined ? true : appConfig.isProviderRegistrationEnabled);
      setIsChequeCompulsory(appConfig.isCancelledChequeCompulsory === undefined ? false : appConfig.isCancelledChequeCompulsory);
      setEnableDefaultIndianKyc(appConfig.enableDefaultIndianKyc === undefined ? true : appConfig.enableDefaultIndianKyc);
      setEnableCancelledChequeUpload(appConfig.enableCancelledChequeUpload === undefined ? true : appConfig.enableCancelledChequeUpload);
      setEnableSignatureUpload(appConfig.enableSignatureUpload === undefined ? true : appConfig.enableSignatureUpload);
      setCustomBankFields(appConfig.customBankFields || [
        { id: 'ifsc', name: 'IFSC Code', type: 'alphanumeric', required: true, placeholder: 'Enter IFSC code' }
      ]);
    }
  }, [appConfig, isLoadingAppConfig]);

  const handleToggleChange = (checked: boolean) => {
    setIsRegistrationEnabled(checked);
  };

  const handleAddCustomField = () => {
    if (!newFieldName.trim()) {
      toast({ title: "Validation Error", description: "Field name is required.", variant: "destructive" });
      return;
    }
    const newField: CustomBankField = {
      id: `field_${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      required: newFieldRequired,
      placeholder: newFieldPlaceholder.trim(),
    };
    setCustomBankFields([...customBankFields, newField]);
    setNewFieldName('');
    setNewFieldPlaceholder('');
    setNewFieldType('alphanumeric');
    setNewFieldRequired(true);
  };

  const handleDeleteCustomField = (id: string) => {
    setCustomBankFields(customBankFields.filter(f => f.id !== id));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      const dataToSave: Partial<AppSettings> = {
        isProviderRegistrationEnabled: isRegistrationEnabled,
        isCancelledChequeCompulsory: isChequeCompulsory,
        enableDefaultIndianKyc: enableDefaultIndianKyc,
        enableCancelledChequeUpload: enableCancelledChequeUpload,
        enableSignatureUpload: enableSignatureUpload,
        customBankFields: customBankFields,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Provider registration settings updated." });
    } catch (error) {
      console.error("Error saving registration access setting:", error);
      toast({ title: "Error", description: "Could not update setting.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAppConfig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Power className="mr-2 h-5 w-5"/>Provider Registration Settings</CardTitle>
          <CardDescription>Control options and requirements for provider registration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center"><Power className="mr-2 h-5 w-5"/>Provider Registration Settings</CardTitle>
        <CardDescription>Configure provider registration form requirements and access.</CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-6">
          <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <label htmlFor="registration-toggle" className="text-base font-medium">
                Provider Registration
              </label>
              <p className="text-sm text-muted-foreground">
                {isRegistrationEnabled ? "Enabled: New providers can register." : "Disabled: Registration page will show 'currently closed'."}
              </p>
            </div>
            <Switch
              id="registration-toggle"
              checked={isRegistrationEnabled}
              onCheckedChange={handleToggleChange}
              disabled={isSaving}
              aria-label="Toggle provider registration"
            />
          </div>

          <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <label htmlFor="cheque-upload-toggle" className="text-base font-medium">
                Enable Cancelled Cheque Section
              </label>
              <p className="text-sm text-muted-foreground">
                {enableCancelledChequeUpload ? "Enabled: Cancelled cheque upload section is visible to providers." : "Disabled: Completely hides the cancelled cheque section."}
              </p>
            </div>
            <Switch
              id="cheque-upload-toggle"
              checked={enableCancelledChequeUpload}
              onCheckedChange={(checked) => setEnableCancelledChequeUpload(checked)}
              disabled={isSaving}
              aria-label="Toggle cancelled cheque section"
            />
          </div>

          {enableCancelledChequeUpload && (
            <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm ml-6 bg-muted/10">
              <div className="space-y-0.5">
                <label htmlFor="cheque-compulsory-toggle" className="text-base font-medium">
                  Cancelled Cheque Requirement
                </label>
                <p className="text-sm text-muted-foreground">
                  {isChequeCompulsory ? "Compulsory: Cancelled cheque upload is required to submit the application." : "Optional: Cancelled cheque upload can be skipped."}
                </p>
              </div>
              <Switch
                id="cheque-compulsory-toggle"
                checked={isChequeCompulsory}
                onCheckedChange={(checked) => setIsChequeCompulsory(checked)}
                disabled={isSaving}
                aria-label="Toggle cancelled cheque requirement"
              />
            </div>
          )}

          <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <label htmlFor="signature-upload-toggle" className="text-base font-medium">
                Enable Signature Section
              </label>
              <p className="text-sm text-muted-foreground">
                {enableSignatureUpload ? "Enabled: Signature upload/canvas is visible during registration." : "Disabled: Completely hides the signature section."}
              </p>
            </div>
            <Switch
              id="signature-upload-toggle"
              checked={enableSignatureUpload}
              onCheckedChange={(checked) => setEnableSignatureUpload(checked)}
              disabled={isSaving}
              aria-label="Toggle signature section"
            />
          </div>

          <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <label htmlFor="indian-kyc-toggle" className="text-base font-medium">
                Default Indian KYC (Aadhaar & PAN)
              </label>
              <p className="text-sm text-muted-foreground">
                {enableDefaultIndianKyc ? "Enabled: Aadhaar and PAN documents are required during provider registration." : "Disabled: Aadhaar and PAN are hidden. Registration will only require documents configured in the Document Types tab."}
              </p>
            </div>
            <Switch
              id="indian-kyc-toggle"
              checked={enableDefaultIndianKyc}
              onCheckedChange={(checked) => setEnableDefaultIndianKyc(checked)}
              disabled={isSaving}
              aria-label="Toggle default Indian KYC"
            />
          </div>

          <div className="rounded-lg border p-4 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-medium">Custom Bank Fields</h3>
              <p className="text-sm text-muted-foreground">
                Add or remove bank details fields (e.g. SWIFT Code, IFSC Code, Bank Code) to show in Step 4.
              </p>
            </div>
            
            <div className="space-y-3">
              {customBankFields.map((field) => (
                <div key={field.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 border">
                  <div>
                    <span className="font-semibold text-sm text-foreground">{field.name}</span>
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary uppercase">
                      {field.type}
                    </span>
                    {field.required && (
                      <span className="ml-2 text-xs text-destructive font-medium">* Required</span>
                    )}
                    {field.placeholder && (
                      <p className="text-xs text-muted-foreground mt-1">Placeholder: {field.placeholder}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteCustomField(field.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              {customBankFields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6 bg-muted/10 border border-dashed rounded-md">
                  No custom bank fields configured. Registration will only ask for Holder Name, Bank Name, and Account Number.
                </p>
              )}
            </div>

            <div className="p-4 rounded-md border bg-muted/10 space-y-4">
              <h4 className="font-semibold text-sm text-foreground">Add New Bank Field</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Field Name / Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. SWIFT Code"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Placeholder</label>
                  <input
                    type="text"
                    placeholder="e.g. Enter SWIFT code"
                    value={newFieldPlaceholder}
                    onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Validation Type</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as any)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="alphanumeric">Numbers & Letters Both</option>
                    <option value="text">Letters Only</option>
                    <option value="number">Numbers Only</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="new-field-required"
                    checked={newFieldRequired}
                    onCheckedChange={(checked) => setNewFieldRequired(checked)}
                  />
                  <label htmlFor="new-field-required" className="text-sm font-medium text-muted-foreground">
                    Mark as Required
                  </label>
                </div>
              </div>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleAddCustomField}
                className="w-full mt-2"
              >
                Add Field
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
}

