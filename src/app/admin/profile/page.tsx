
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; 
import { useAuth } from "@/hooks/useAuth";
import { Mail, User, Shield, Edit3, KeyRound, Trash2, Loader2, Phone, Camera, Save } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { updateProfile as updateAuthProfile } from "firebase/auth"; 
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from '@/lib/mysqlDb';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

const profileSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50, "Name too long."),
  mobileNumber: z.string()
    .min(10, { message: "Mobile number must be 10-15 digits." })
    .max(15, { message: "Mobile number cannot exceed 15 digits." })
    .regex(/^\+?[1-9]\d{1,14}$/, { message: "Invalid phone format (e.g., +919876543210)." })
    .optional().or(z.literal('')),
});
type ProfileFormData = z.infer<typeof profileSchema>;

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");

export default function AdminProfilePage() {
  const { user, adminPermissions, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  
  const [currentPhotoURL, setCurrentPhotoURL] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      mobileNumber: "",
    },
  });

  const fetchAdminData = useCallback(async (adminUser: any) => {
    if (!adminUser) return;
    form.setValue('displayName', adminUser.displayName || "");
    setCurrentPhotoURL(adminUser.photoURL || null);
    setImagePreview(adminUser.photoURL || null);

    try {
      const userDocRef = doc(db, "users", adminUser.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists() && docSnap.data().mobileNumber) {
        form.setValue('mobileNumber', docSnap.data().mobileNumber);
      }
    } catch (error) {
      console.error("Error fetching admin mobile number:", error);
    }
  }, [form]);

  useEffect(() => {
    if (user && adminPermissions) {
      fetchAdminData(user);
    }
  }, [user, adminPermissions, fetchAdminData]);


  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({ title: "File Too Large", description: "Image must be less than 2MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = ""; 
        setProfileImageFile(null); 
        setImagePreview(currentPhotoURL); 
        return;
      }
      setProfileImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleProfileUpdate = async (data: ProfileFormData) => {
    if (!user || !adminPermissions || !auth.currentUser) {
      toast({ title: "Error", description: "Admin user not found or not authenticated.", variant: "destructive" });
      return;
    }
    setIsSavingProfile(true);

    let newPhotoURL = currentPhotoURL; 

    if (profileImageFile) {
      setIsUploading(true);
      setUploadProgress(0);
      const oldPhotoURLFromAuth = auth.currentUser.photoURL; 

      try {
        const extension = profileImageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const randomString = generateRandomHexString(8);
        const fileName = `profile_${user.uid}_${randomString}.${extension}`;
        const imagePath = `admin_profiles/${user.uid}/${fileName}`;
        const imageRef = storageRefStandard(storage, imagePath);
        const uploadTask = uploadBytesResumable(imageRef, profileImageFile);

        newPhotoURL = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => {
              console.error("Image upload task error:", error);
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                if (oldPhotoURLFromAuth && isFirebaseStorageUrl(oldPhotoURLFromAuth) && oldPhotoURLFromAuth !== downloadURL) {
                  try { await deleteObject(storageRefStandard(storage, oldPhotoURLFromAuth)); } 
                  catch (e) { console.warn("Failed to delete old admin profile image:", e); }
                }
                resolve(downloadURL);
              } catch (getUrlError) { 
                console.error("Error getting download URL:", getUrlError);
                reject(getUrlError); 
              }
            }
          );
        });
        
        setCurrentPhotoURL(newPhotoURL); 
        setImagePreview(newPhotoURL); 
        setProfileImageFile(null); 
        if(fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "Image Uploaded", description: "Profile picture updated successfully." });
      } catch (uploadError) {
        console.error("Full image upload/update process error:", uploadError);
        toast({ title: "Image Upload Failed", description: (uploadError as Error).message || "Could not upload new profile image.", variant: "destructive" });
        
        setIsUploading(false);
        setUploadProgress(null);
        setIsSavingProfile(false); 
        setProfileImageFile(null); 
        if(fileInputRef.current) fileInputRef.current.value = ""; 
        setImagePreview(currentPhotoURL); 
        return; 
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    }

    try {
      await updateAuthProfile(auth.currentUser, {
        displayName: data.displayName,
        ...(newPhotoURL !== auth.currentUser.photoURL && { photoURL: newPhotoURL }),
      });
    } catch (authError) {
      console.error("Error updating Firebase Auth profile:", authError);
      toast({ title: "Auth Profile Update Failed", description: (authError as Error).message || "Could not update Auth profile.", variant: "destructive" });
      setIsSavingProfile(false); 
      return;
    }
    
    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        displayName: data.displayName,
        mobileNumber: data.mobileNumber || null,
        photoURL: newPhotoURL || null, 
        email: user.email, 
        uid: user.uid,
      }, { merge: true });

      toast({ title: "Profile Updated", description: "Your admin profile has been successfully updated." });
    } catch (firestoreError) {
      console.error("Error updating Firestore document:", firestoreError);
      toast({ title: "Firestore Update Failed", description: (firestoreError as Error).message || "Could not save all profile details to database.", variant: "destructive" });
    } finally {
      setIsSavingProfile(false); 
    }
  };

  if (authIsLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-200px)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user || !adminPermissions) {
    return <div className="text-center p-8">Access Denied. This page is for administrators only.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-3">
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <Avatar className="w-28 h-28 mx-auto mb-4 border-2 border-primary shadow-md">
            <AvatarImage src={imagePreview || undefined} alt={form.getValues('displayName') || "Admin"} />
            <AvatarFallback className="text-4xl">
              {form.getValues('displayName') ? form.getValues('displayName')[0].toUpperCase() : user.email ? user.email[0].toUpperCase() : "A"}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-2xl sm:text-3xl font-headline">{form.getValues('displayName') || "Admin Profile"}</CardTitle>
          <CardDescription className="text-sm sm:text-base">{user.email}</CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleProfileUpdate)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="displayName" className="flex items-center"><User className="mr-2 h-4 w-4 text-muted-foreground"/>Display Name</FormLabel>
                    <FormControl><Input id="displayName" {...field} disabled={isSavingProfile} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mobileNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="mobileNumber" className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Mobile Number</FormLabel>
                    <FormControl><Input id="mobileNumber" type="tel" {...field} placeholder="e.g., +919876543210" disabled={isSavingProfile} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <Label htmlFor="profileImage" className="flex items-center mb-1"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Profile Image</Label>
                <Input
                  id="profileImage"
                  type="file"
                  accept="image/png, image/jpeg, image/gif, image/webp"
                  onChange={handleImageFileChange}
                  ref={fileInputRef}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"
                  disabled={isSavingProfile || isUploading}
                />
                {uploadProgress !== null && isUploading && (
                    <Progress value={uploadProgress} className="w-full h-2 mt-2" />
                )}
                <FormDescription className="text-xs mt-1">Max 2MB. PNG, JPG, GIF, WEBP accepted.</FormDescription>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full sm:w-auto" disabled={isSavingProfile || isUploading}>
                {(isSavingProfile && !isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isUploading ? "Uploading Image..." : isSavingProfile ? "Saving..." : <> <Save className="mr-2 h-4 w-4" /> Save Profile Changes</>}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
    
