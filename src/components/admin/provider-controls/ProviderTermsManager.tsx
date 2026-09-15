"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, FileText } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';

const COLLECTION_NAME = "providerControlOptions";
const DOCUMENT_ID = "termsAndConditions";

export default function ProviderTermsManager() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchTerms = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setContent(docSnap.data().content || "");
        }
      } catch (error) {
        console.error("Error fetching terms:", error);
        toast({ title: "Error", description: "Could not load terms.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTerms();
  }, [toast]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
      await setDoc(docRef, {
        content,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Provider terms updated successfully." });
    } catch (error) {
      console.error("Error saving terms:", error);
      toast({ title: "Error", description: "Could not save terms.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5 text-primary" /> Provider Terms & Conditions
        </CardTitle>
        <CardDescription>
          Edit the content that providers must agree to during Step 4 of the registration process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Enter the full terms and conditions text here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="font-sans text-sm leading-relaxed"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground italic">
          Tip: You can use plain text or standard HTML tags for formatting if needed.
        </p>
      </CardContent>
      <CardFooter className="border-t pt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Terms Content
        </Button>
      </CardFooter>
    </Card>
  );
}
