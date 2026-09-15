"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Image as ImageIcon, Search, Upload, RefreshCw, Loader2, Sparkles, FolderTree, Layers, Wrench, Tv, Settings2, Eye, CheckCircle2, ChevronRight, FileText, Megaphone, Bell } from "lucide-react";
import Image from 'next/image';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { compressImage } from '@/lib/imageCompressor';
import { deleteObject } from '@/lib/mysqlStorage';
import type { HomepageAd } from '@/types/firestore';

export interface GalleryItem {
  id: string; // Unique gallery item key
  docId: string; // MySQL document ID
  collectionName: 'adminCategories' | 'adminSubCategories' | 'adminServices' | 'adminSlideshows' | 'adminPopups' | 'blogPosts' | 'webSettings';
  title: string;
  categoryType: 'category' | 'subcategory' | 'service' | 'slideshow' | 'ad' | 'popup' | 'branding' | 'blog';
  categoryId?: string;
  subCategoryId?: string;
  categoryName?: string; // Parent Category Name
  subCategoryName?: string; // Sub-Category Name
  order?: number;
  imageField: string; // Property name e.g. 'image', 'icon', 'coverImageUrl', 'logoUrl'
  arrayIndex?: number; // Index if array property like galleryImages
  adId?: string; // If item belongs to featuresConfiguration.ads array
  imageUrl: string;
  uploadFolder: string;
}

export interface ParentCategoryGroup {
  id: string;
  name: string;
  order: number;
  subCategories: {
    id: string;
    name: string;
    order: number;
    items: GalleryItem[];
  }[];
  unassignedItems: GalleryItem[];
  totalImages: number;
}

export default function AdminImageGalleryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [parentCatsList, setParentCatsList] = useState<{ id: string; name: string; order: number }[]>([]);
  const [subCatsList, setSubCatsList] = useState<{ id: string; name: string; parentId: string; order: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tab Persistence with sessionStorage
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('gallery-active-tab') || 'all';
    }
    return 'all';
  });

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('gallery-active-tab', newTab);
    }
  };

  // Scroll Position Persistence
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('gallery-scroll-pos', window.scrollY.toString());
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const restoreScrollPosition = () => {
    if (typeof window !== 'undefined') {
      const savedScrollY = sessionStorage.getItem('gallery-scroll-pos');
      if (savedScrollY) {
        setTimeout(() => {
          window.scrollTo({ top: parseInt(savedScrollY, 10), behavior: 'instant' });
        }, 100);
      }
    }
  };

  // Modal State for Image Replacement
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Modal State for Full Screen Image Preview
  const [viewingImage, setViewingImage] = useState<GalleryItem | null>(null);

  const fetchAllWebsiteImages = async () => {
    setIsLoading(true);
    const galleryList: GalleryItem[] = [];
    const categoryMap = new Map<string, { name: string; order: number }>();
    const subCatMap = new Map<string, { name: string; parentId: string; order: number }>();

    try {
      // 1. Fetch Categories
      const categoriesSnap = await getDocs(collection(db, "adminCategories"));
      const pCats: { id: string; name: string; order: number }[] = [];

      categoriesSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const catName = data.name || 'Uncategorized';
        const catOrder = Number(data.order || 0);

        categoryMap.set(docSnap.id, { name: catName, order: catOrder });
        pCats.push({ id: docSnap.id, name: catName, order: catOrder });

        const img = data.imageUrl || data.image || data.bannerUrl;
        const icon = data.iconUrl || data.icon;

        if (img) {
          galleryList.push({
            id: `cat-img-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminCategories',
            title: catName,
            categoryType: 'category',
            categoryId: docSnap.id,
            categoryName: catName,
            order: catOrder,
            imageField: data.imageUrl ? 'imageUrl' : (data.image ? 'image' : 'bannerUrl'),
            imageUrl: img,
            uploadFolder: 'categories',
          });
        }
        if (icon && icon !== img) {
          galleryList.push({
            id: `cat-icon-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminCategories',
            title: `${catName} (Icon)`,
            categoryType: 'category',
            categoryId: docSnap.id,
            categoryName: catName,
            order: catOrder,
            imageField: data.iconUrl ? 'iconUrl' : 'icon',
            imageUrl: icon,
            uploadFolder: 'categories/icons',
          });
        }
      });
      setParentCatsList(pCats.sort((a, b) => a.order - b.order));

      // 2. Fetch Sub-Categories
      const subCatSnap = await getDocs(collection(db, "adminSubCategories"));
      const sCats: { id: string; name: string; parentId: string; order: number }[] = [];

      subCatSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const subCatName = data.name || 'Sub-Category';
        const parentId = data.parentId || '';
        const subCatOrder = Number(data.order || 0);
        const parentCatName = categoryMap.get(parentId)?.name || 'General Category';

        subCatMap.set(docSnap.id, { name: subCatName, parentId, order: subCatOrder });
        sCats.push({ id: docSnap.id, name: subCatName, parentId, order: subCatOrder });

        const img = data.imageUrl || data.image || data.bannerUrl;
        const icon = data.iconUrl || data.icon;

        if (img) {
          galleryList.push({
            id: `subcat-img-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminSubCategories',
            title: subCatName,
            categoryType: 'subcategory',
            categoryId: parentId,
            subCategoryId: docSnap.id,
            categoryName: parentCatName,
            subCategoryName: subCatName,
            order: subCatOrder,
            imageField: data.imageUrl ? 'imageUrl' : (data.image ? 'image' : 'bannerUrl'),
            imageUrl: img,
            uploadFolder: 'subcategories',
          });
        }
        if (icon && icon !== img) {
          galleryList.push({
            id: `subcat-icon-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminSubCategories',
            title: `${subCatName} (Icon)`,
            categoryType: 'subcategory',
            categoryId: parentId,
            subCategoryId: docSnap.id,
            categoryName: parentCatName,
            subCategoryName: subCatName,
            order: subCatOrder,
            imageField: data.iconUrl ? 'iconUrl' : 'icon',
            imageUrl: icon,
            uploadFolder: 'subcategories/icons',
          });
        }
      });
      setSubCatsList(sCats.sort((a, b) => a.order - b.order));

      // 3. Fetch Services
      const servicesSnap = await getDocs(collection(db, "adminServices"));
      servicesSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const srvName = data.name || 'Service Main Image';
        
        const subCatObj = subCatMap.get(data.subCategoryId);
        const subCatName = subCatObj?.name || '';
        const parentId = data.categoryId || subCatObj?.parentId || '';
        const parentCatName = categoryMap.get(parentId)?.name || 'General Services';

        const img = data.imageUrl || data.image || data.coverImage;
        const icon = data.iconUrl || data.icon;

        if (img) {
          galleryList.push({
            id: `srv-main-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminServices',
            title: srvName,
            categoryType: 'service',
            categoryId: parentId,
            subCategoryId: data.subCategoryId,
            categoryName: parentCatName,
            subCategoryName: subCatName,
            imageField: data.imageUrl ? 'imageUrl' : (data.image ? 'image' : 'coverImage'),
            imageUrl: img,
            uploadFolder: 'services',
          });
        }
        if (icon && icon !== img) {
          galleryList.push({
            id: `srv-icon-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminServices',
            title: `${srvName} (Icon)`,
            categoryType: 'service',
            categoryId: parentId,
            subCategoryId: data.subCategoryId,
            categoryName: parentCatName,
            subCategoryName: subCatName,
            imageField: data.iconUrl ? 'iconUrl' : 'icon',
            imageUrl: icon,
            uploadFolder: 'services/icons',
          });
        }
        const gal = data.galleryImages || data.images;
        if (Array.isArray(gal)) {
          gal.forEach((imgUrl: string, idx: number) => {
            if (imgUrl && typeof imgUrl === 'string') {
              galleryList.push({
                id: `srv-gal-${docSnap.id}-${idx}`,
                docId: docSnap.id,
                collectionName: 'adminServices',
                title: `${srvName} (Gallery #${idx + 1})`,
                categoryType: 'service',
                categoryId: parentId,
                subCategoryId: data.subCategoryId,
                categoryName: parentCatName,
                subCategoryName: subCatName,
                imageField: data.galleryImages ? 'galleryImages' : 'images',
                arrayIndex: idx,
                imageUrl: imgUrl,
                uploadFolder: 'services/gallery',
              });
            }
          });
        }
      });

      // 4. Fetch Slideshow Banners (Separate Tab)
      const slidesSnap = await getDocs(collection(db, "adminSlideshows"));
      slidesSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const img = data.imageUrl || data.image;
        if (img) {
          galleryList.push({
            id: `slide-${docSnap.id}`,
            docId: docSnap.id,
            collectionName: 'adminSlideshows',
            title: data.title || 'Slideshow Banner',
            categoryType: 'slideshow',
            imageField: data.imageUrl ? 'imageUrl' : 'image',
            imageUrl: img,
            uploadFolder: 'slideshows',
          });
        }
      });

      // 5. Fetch Newsletter Popups (Separate Tab)
      try {
        const popupsSnap = await getDocs(collection(db, "adminPopups"));
        popupsSnap.docs.forEach(docSnap => {
          const data = docSnap.data() as any;
          const img = data.imageUrl || data.image || data.bannerUrl;
          if (img) {
            galleryList.push({
              id: `popup-${docSnap.id}`,
              docId: docSnap.id,
              collectionName: 'adminPopups',
              title: data.title || data.name || 'Newsletter Popup Image',
              categoryType: 'popup',
              imageField: data.imageUrl ? 'imageUrl' : (data.image ? 'image' : 'bannerUrl'),
              imageUrl: img,
              uploadFolder: 'popups',
            });
          }
        });
      } catch (e) {
        console.warn("Popups fetch error:", e);
      }

      // 6. Fetch Blog Posts (Cover Image & CoverImageUrl)
      try {
        const blogsSnap = await getDocs(collection(db, "blogPosts"));
        blogsSnap.docs.forEach(docSnap => {
          const data = docSnap.data() as any;
          const img = data.coverImageUrl || data.imageUrl || data.image || data.coverImage || data.bannerUrl || data.thumbnailUrl;
          if (img && typeof img === 'string' && img.trim() !== '') {
            const fieldName = data.coverImageUrl ? 'coverImageUrl' : (data.imageUrl ? 'imageUrl' : (data.image ? 'image' : (data.coverImage ? 'coverImage' : 'bannerUrl')));
            galleryList.push({
              id: `blog-${docSnap.id}`,
              docId: docSnap.id,
              collectionName: 'blogPosts',
              title: data.title || data.h1_title || 'Blog Post Cover',
              categoryType: 'blog',
              imageField: fieldName,
              imageUrl: img,
              uploadFolder: 'blog',
            });
          }
        });
      } catch (e) {
        console.warn("Blog posts fetch error:", e);
      }

      // 7. Fetch Promotional Ad Banners explicitly from webSettings/featuresConfiguration
      try {
        const featDocSnap = await getDoc(doc(db, "webSettings", "featuresConfiguration"));
        if (featDocSnap.exists()) {
          const featData = featDocSnap.data() as any;
          if (Array.isArray(featData?.ads)) {
            featData.ads.forEach((ad: HomepageAd, idx: number) => {
              const adImg = ad.imageUrl || (ad as any).image;
              if (adImg && typeof adImg === 'string' && adImg.trim() !== '') {
                galleryList.push({
                  id: `ad-banner-${ad.id || idx}`,
                  docId: 'featuresConfiguration',
                  collectionName: 'webSettings',
                  title: ad.name || `Ad Banner #${idx + 1}`,
                  categoryType: 'ad',
                  adId: ad.id,
                  imageField: 'ads',
                  arrayIndex: idx,
                  imageUrl: adImg,
                  uploadFolder: 'ads',
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("Features config ads fetch error:", e);
      }

      // 8. Fetch Global Web Settings (Branding & Logos)
      try {
        const globalDocSnap = await getDoc(doc(db, "webSettings", "global"));
        if (globalDocSnap.exists()) {
          const data = globalDocSnap.data() as any;
          if (data.logoUrl) {
            galleryList.push({
              id: 'brand-logo',
              docId: 'global',
              collectionName: 'webSettings',
              title: 'Website Main Logo',
              categoryType: 'branding',
              imageField: 'logoUrl',
              imageUrl: data.logoUrl,
              uploadFolder: 'branding',
            });
          }
          if (data.faviconUrl) {
            galleryList.push({
              id: 'brand-favicon',
              docId: 'global',
              collectionName: 'webSettings',
              title: 'Website Favicon Icon',
              categoryType: 'branding',
              imageField: 'faviconUrl',
              imageUrl: data.faviconUrl,
              uploadFolder: 'branding',
            });
          }
          if (data.metaOgImageUrl) {
            galleryList.push({
              id: 'brand-og',
              docId: 'global',
              collectionName: 'webSettings',
              title: 'SEO Social Preview Image',
              categoryType: 'branding',
              imageField: 'metaOgImageUrl',
              imageUrl: data.metaOgImageUrl,
              uploadFolder: 'branding',
            });
          }
          if (data.headerBannerUrl) {
            galleryList.push({
              id: 'brand-header-banner',
              docId: 'global',
              collectionName: 'webSettings',
              title: 'Header Top Announcement Banner',
              categoryType: 'branding',
              imageField: 'headerBannerUrl',
              imageUrl: data.headerBannerUrl,
              uploadFolder: 'branding',
            });
          }
        }
      } catch (e) {
        console.warn("Global webSettings fetch error:", e);
      }

      setItems(galleryList);
      restoreScrollPosition();
    } catch (err) {
      console.error("Error building Image Gallery:", err);
      toast({ title: "Fetch Error", description: "Failed to load all images.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllWebsiteImages();
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeTab !== 'all') {
      result = result.filter(item => item.categoryType === activeTab);
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase().trim();
      result = result.filter(item => 
        item.title.toLowerCase().includes(lower) || 
        item.uploadFolder.toLowerCase().includes(lower) ||
        (item.categoryName || '').toLowerCase().includes(lower) ||
        (item.subCategoryName || '').toLowerCase().includes(lower)
      );
    }
    return result;
  }, [items, activeTab, searchTerm]);

  // Order-wise Categories for Categories Tab (matching /admin/categories)
  const orderedCategories = useMemo(() => {
    const catItems = filteredItems.filter(item => item.categoryType === 'category');
    return [...catItems].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [filteredItems]);

  // Sub-Categories Grouped Category-Wise (matching /admin/sub-categories)
  const groupedSubCategoryHierarchy = useMemo(() => {
    const subCatItems = filteredItems.filter(item => item.categoryType === 'subcategory');
    const result: ParentCategoryGroup[] = [];

    parentCatsList.forEach(pCat => {
      const itemsForParent = subCatItems.filter(item => item.categoryId === pCat.id);
      if (itemsForParent.length > 0) {
        result.push({
          id: pCat.id,
          name: pCat.name,
          order: pCat.order,
          subCategories: [{
            id: pCat.id,
            name: pCat.name,
            order: pCat.order,
            items: itemsForParent.sort((a, b) => (a.order || 0) - (b.order || 0))
          }],
          unassignedItems: [],
          totalImages: itemsForParent.length
        });
      }
    });

    const handledIds = new Set<string>();
    result.forEach(p => p.subCategories.forEach(s => s.items.forEach(i => handledIds.add(i.id))));
    const orphanItems = subCatItems.filter(i => !handledIds.has(i.id));

    if (orphanItems.length > 0) {
      result.push({
        id: 'other-subcategories',
        name: 'General & Other Sub-Categories',
        order: 9999,
        subCategories: [{
          id: 'general-subcat-group',
          name: 'General Sub-Categories',
          order: 1,
          items: orphanItems
        }],
        unassignedItems: [],
        totalImages: orphanItems.length
      });
    }

    return result;
  }, [filteredItems, parentCatsList]);

  // Build Nested Grouped Service Hierarchy matching /admin/services
  const groupedServicesHierarchy = useMemo(() => {
    const serviceItems = filteredItems.filter(item => item.categoryType === 'service');
    const result: ParentCategoryGroup[] = [];

    parentCatsList.forEach(pCat => {
      const relevantSubCats = subCatsList.filter(s => s.parentId === pCat.id);
      
      const subCatGroups = relevantSubCats.map(subCat => {
        const subCatItems = serviceItems.filter(item => item.subCategoryId === subCat.id);
        return {
          id: subCat.id,
          name: subCat.name,
          order: subCat.order,
          items: subCatItems
        };
      }).filter(subCat => subCat.items.length > 0);

      const unassigned = serviceItems.filter(item => 
        item.categoryId === pCat.id && 
        !relevantSubCats.some(s => s.id === item.subCategoryId)
      );

      const totalImagesInParent = subCatGroups.reduce((sum, s) => sum + s.items.length, 0) + unassigned.length;

      if (totalImagesInParent > 0) {
        result.push({
          id: pCat.id,
          name: pCat.name,
          order: pCat.order,
          subCategories: subCatGroups,
          unassignedItems: unassigned,
          totalImages: totalImagesInParent
        });
      }
    });

    const handledIds = new Set<string>();
    result.forEach(p => {
      p.subCategories.forEach(s => s.items.forEach(i => handledIds.add(i.id)));
      p.unassignedItems.forEach(i => handledIds.add(i.id));
    });

    const orphanItems = serviceItems.filter(i => !handledIds.has(i.id));
    if (orphanItems.length > 0) {
      result.push({
        id: 'other-services',
        name: 'General & Other Services',
        order: 9999,
        subCategories: [{
          id: 'general-subcat',
          name: 'General Services',
          order: 1,
          items: orphanItems
        }],
        unassignedItems: [],
        totalImages: orphanItems.length
      });
    }

    return result;
  }, [filteredItems, parentCatsList, subCatsList]);

  const handleOpenUploadModal = (item: GalleryItem) => {
    setSelectedItem(item);
    setPreviewFile(null);
    setPreviewUrl(null);
    setUploadProgress(0);
    setIsUploadModalOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let fileToSet = file;
    try {
      fileToSet = await compressImage(file);
    } catch (err) {
      console.error("Image compression failed, using original file:", err);
    }
    setPreviewFile(fileToSet);
    setPreviewUrl(URL.createObjectURL(fileToSet));
  };

  const handleExecuteImageChange = async () => {
    if (!selectedItem || !previewFile) return;

    setIsUploading(true);
    setUploadProgress(20);

    try {
      const formData = new FormData();
      formData.append('file', previewFile);
      formData.append('uploadPath', selectedItem.uploadFolder);

      setUploadProgress(50);
      const token = await auth.currentUser?.getIdToken();
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error || 'Failed to upload image.');
      }

      setUploadProgress(80);
      const newImageUrl = uploadData.url;

      // Delete old image file from storage
      if (selectedItem.imageUrl && selectedItem.imageUrl !== newImageUrl) {
        try {
          await deleteObject(selectedItem.imageUrl);
        } catch (dErr) {
          console.warn("Could not delete old image from storage:", dErr);
        }
      }

      // Update MySQL Document
      if (selectedItem.collectionName === 'webSettings' && selectedItem.docId === 'featuresConfiguration' && selectedItem.adId) {
        // Handle Homepage Ad Banner update in featuresConfiguration.ads array
        const configDocRef = doc(db, 'webSettings', 'featuresConfiguration');
        const configSnap = await getDoc(configDocRef);
        if (configSnap.exists()) {
          const configData = configSnap.data() as any;
          const currentAds = Array.isArray(configData.ads) ? [...configData.ads] : [];
          const targetAdIndex = currentAds.findIndex((a: HomepageAd) => a.id === selectedItem.adId);
          if (targetAdIndex !== -1) {
            currentAds[targetAdIndex] = { ...currentAds[targetAdIndex], imageUrl: newImageUrl };
            await setDoc(configDocRef, { ads: currentAds }, { merge: true });
          }
        }
      } else if (selectedItem.collectionName === 'adminServices' && selectedItem.imageField === 'galleryImages' && selectedItem.arrayIndex !== undefined) {
        const serviceDocSnap = await getDocs(collection(db, "adminServices"));
        const targetDoc = serviceDocSnap.docs.find(d => d.id === selectedItem.docId);
        if (targetDoc) {
          const serviceData = targetDoc.data() as any;
          const currentGallery = [...(serviceData.galleryImages || [])];
          currentGallery[selectedItem.arrayIndex] = newImageUrl;
          await updateDoc(doc(db, "adminServices", selectedItem.docId), { galleryImages: currentGallery });
        }
      } else {
        await setDoc(doc(db, selectedItem.collectionName, selectedItem.docId), {
          [selectedItem.imageField]: newImageUrl
        }, { merge: true });
      }

      setUploadProgress(100);

      // Revalidate cache in background (non-blocking for instant speed)
      triggerRefresh('global-cache').catch(() => {});

      // Update local state list instantly
      setItems(prev => prev.map(item => item.id === selectedItem.id ? { ...item, imageUrl: newImageUrl } : item));

      toast({
        title: "Image Updated Successfully!",
        description: `Updated image for "${selectedItem.title}".`
      });

      setIsUploadModalOpen(false);
      restoreScrollPosition();
    } catch (err: any) {
      console.error("Error replacing image:", err);
      toast({ title: "Upload Error", description: err.message || "Could not replace image.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const renderImageCard = (item: GalleryItem) => (
    <Card key={item.id} className="overflow-hidden group hover:shadow-xl transition-all duration-300 border border-border/60 flex flex-col justify-between">
      <div>
        {/* Image Container */}
        <div className="relative aspect-video w-full bg-slate-900/5 dark:bg-slate-800/50 overflow-hidden flex items-center justify-center border-b">
          <img 
            src={item.imageUrl} 
            alt={item.title} 
            className="object-contain max-h-full max-w-full p-2 group-hover:scale-105 transition-transform duration-300"
          />
          
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <Badge className="capitalize text-[10px] shadow-sm bg-background/90 text-foreground backdrop-blur-md border border-border/50">
              {item.categoryType}
            </Badge>
            {item.subCategoryName && (
              <Badge variant="outline" className="text-[10px] shadow-sm bg-primary/10 text-primary border-primary/20 backdrop-blur-md">
                {item.subCategoryName}
              </Badge>
            )}
          </div>

          {/* Hover Quick Actions */}
          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 p-4 backdrop-blur-[2px]">
            <Button size="sm" variant="secondary" onClick={() => setViewingImage(item)} className="bg-white/90 text-slate-900 hover:bg-white text-xs">
              <Eye className="h-3.5 w-3.5 mr-1" /> View Full
            </Button>
            <Button size="sm" onClick={() => handleOpenUploadModal(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-md">
              <Upload className="h-3.5 w-3.5 mr-1" /> Change Image
            </Button>
          </div>
        </div>

        {/* Details Container */}
        <div className="p-4">
          <h4 className="font-bold text-sm text-foreground line-clamp-1" title={item.title}>
            {item.title}
          </h4>
          <p className="text-[11px] text-muted-foreground font-mono truncate mt-1" title={item.imageUrl}>
            {item.imageUrl}
          </p>
        </div>
      </div>

      <div className="p-4 pt-0">
        <Button 
          onClick={() => handleOpenUploadModal(item)} 
          variant="outline" 
          size="sm" 
          className="w-full text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/50 transition-colors"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
          Change Image Directly
        </Button>
      </div>
    </Card>
  );

  return (
    <PermissionGuard moduleId="image_gallery" action="read">
      <div className="space-y-6">
        {/* Header Card */}
        <Card className="border-none shadow-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <ImageIcon size={300} />
          </div>
          <CardHeader className="relative z-10 p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-md mb-2 border-none">
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Media Asset Manager
                </Badge>
                <CardTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">Website Image Gallery</CardTitle>
                <CardDescription className="text-emerald-100 text-sm md:text-base mt-1 max-w-2xl">
                  Manage, preview, and directly change any image across Categories, Sub-Categories, Services, Slideshows, Ad Banners, Popups, Blogs, and Site Logos.
                </CardDescription>
              </div>
              <Button 
                onClick={fetchAllWebsiteImages} 
                disabled={isLoading}
                className="bg-white text-emerald-800 hover:bg-emerald-50 font-bold shadow-lg shrink-0 rounded-xl"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh Gallery
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 shadow-sm border border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
                <ImageIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Website Images</p>
                <p className="text-2xl font-black">{items.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 shadow-sm border border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                <FolderTree className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Categories & Sub-Cats</p>
                <p className="text-2xl font-black">{items.filter(i => i.categoryType === 'category' || i.categoryType === 'subcategory').length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 shadow-sm border border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-xl">
                <Wrench className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Service Images</p>
                <p className="text-2xl font-black">{items.filter(i => i.categoryType === 'service').length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 shadow-sm border border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
                <Tv className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Banners, Popups & Blogs</p>
                <p className="text-2xl font-black">{items.filter(i => i.categoryType === 'slideshow' || i.categoryType === 'ad' || i.categoryType === 'popup' || i.categoryType === 'blog' || i.categoryType === 'branding').length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filter Controls */}
        <Card className="p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search images by title or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full md:w-auto">
              <TabsList className="flex flex-wrap gap-1 w-full md:w-auto h-auto p-1.5 bg-muted/70 rounded-xl">
                <TabsTrigger value="all" className="text-xs py-1.5 px-3">All ({items.length})</TabsTrigger>
                <TabsTrigger value="category" className="text-xs py-1.5 px-3">Categories ({items.filter(i => i.categoryType === 'category').length})</TabsTrigger>
                <TabsTrigger value="subcategory" className="text-xs py-1.5 px-3">Sub-Categories ({items.filter(i => i.categoryType === 'subcategory').length})</TabsTrigger>
                <TabsTrigger value="service" className="text-xs py-1.5 px-3">Services ({items.filter(i => i.categoryType === 'service').length})</TabsTrigger>
                <TabsTrigger value="slideshow" className="text-xs py-1.5 px-3">Slideshows ({items.filter(i => i.categoryType === 'slideshow').length})</TabsTrigger>
                <TabsTrigger value="ad" className="text-xs py-1.5 px-3">Ad Banners ({items.filter(i => i.categoryType === 'ad').length})</TabsTrigger>
                <TabsTrigger value="popup" className="text-xs py-1.5 px-3">Newsletter Popups ({items.filter(i => i.categoryType === 'popup').length})</TabsTrigger>
                <TabsTrigger value="blog" className="text-xs py-1.5 px-3">Blogs ({items.filter(i => i.categoryType === 'blog').length})</TabsTrigger>
                <TabsTrigger value="branding" className="text-xs py-1.5 px-3">Branding</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Card>

        {/* Image Display Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gathering all website images...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="p-12 text-center shadow-sm">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-bold">No images found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
              No website images match your search or selected category filter.
            </p>
          </Card>
        ) : activeTab === 'subcategory' ? (
          /* SUB-CATEGORIES GROUPED CATEGORY-WISE MATCHING /admin/sub-categories */
          <div className="space-y-8">
            {groupedSubCategoryHierarchy.length === 0 ? (
              <Card className="p-12 text-center shadow-sm">
                <Layers className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <h3 className="text-lg font-bold">No Sub-Category Images Found</h3>
              </Card>
            ) : (
              groupedSubCategoryHierarchy.map(pCat => (
                <Card key={pCat.id} className="overflow-hidden border border-border/80 shadow-md">
                  {/* Parent Category Header */}
                  <div className="p-4 bg-slate-900/5 dark:bg-slate-800/40 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                        <FolderTree className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-lg text-foreground flex items-center gap-2">
                          {pCat.name}
                          <Badge variant="secondary" className="text-xs bg-blue-500/15 text-blue-700 dark:text-blue-300 border-none font-bold">
                            {pCat.totalImages} {pCat.totalImages === 1 ? 'Sub-Category' : 'Sub-Categories'}
                          </Badge>
                        </h3>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                      {pCat.subCategories[0]?.items.map(item => renderImageCard(item))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : activeTab === 'category' ? (
          /* ORDER-WISE CATEGORIES DISPLAY MATCHING /admin/categories */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {orderedCategories.map(item => renderImageCard(item))}
          </div>
        ) : activeTab === 'service' ? (
          /* NESTED CATEGORY & SUB-CATEGORY HIERARCHY MATCHING /admin/services */
          <div className="space-y-8">
            {groupedServicesHierarchy.length === 0 ? (
              <Card className="p-12 text-center shadow-sm">
                <Wrench className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <h3 className="text-lg font-bold">No Service Images Found</h3>
              </Card>
            ) : (
              groupedServicesHierarchy.map(pCat => (
                <Card key={pCat.id} className="overflow-hidden border border-border/80 shadow-md">
                  {/* Parent Category Header */}
                  <div className="p-4 bg-slate-900/5 dark:bg-slate-800/40 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
                        <FolderTree className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-lg text-foreground flex items-center gap-2">
                          {pCat.name}
                          <Badge variant="secondary" className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-none font-bold">
                            {pCat.totalImages} {pCat.totalImages === 1 ? 'Image' : 'Images'}
                          </Badge>
                        </h3>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-6 space-y-8">
                    {/* Sub-Category Sections */}
                    {pCat.subCategories.map(subCat => (
                      <div key={subCat.id} className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                          <Layers className="h-4 w-4 text-emerald-500" />
                          <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                            {subCat.name}
                            <span className="text-xs text-muted-foreground font-normal">({subCat.items.length} images)</span>
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                          {subCat.items.map(item => renderImageCard(item))}
                        </div>
                      </div>
                    ))}

                    {/* Unassigned Parent Category Items */}
                    {pCat.unassignedItems.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                          <ChevronRight className="h-4 w-4 text-emerald-500" />
                          <h4 className="font-bold text-base text-foreground">Direct Service Images</h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                          {pCat.unassignedItems.map(item => renderImageCard(item))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* STANDARD GRID DISPLAY FOR ALL OTHER TABS */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredItems.map(item => renderImageCard(item))}
          </div>
        )}

        {/* Change Image Modal */}
        <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-600" />
                Change Image Directly
              </DialogTitle>
              <DialogDescription>
                Select a new image file from your computer to replace the image for <span className="font-bold text-foreground">"{selectedItem?.title}"</span> across the website.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Current vs New Preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 text-center">
                  <Label className="text-xs text-muted-foreground">Current Image</Label>
                  <div className="h-28 rounded-lg border bg-muted/40 p-2 flex items-center justify-center overflow-hidden">
                    {selectedItem?.imageUrl && (
                      <img src={selectedItem.imageUrl} alt="Current" className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-center">
                  <Label className="text-xs text-muted-foreground">New Replacement</Label>
                  <div className="h-28 rounded-lg border-2 border-dashed border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20 p-2 flex items-center justify-center overflow-hidden">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No file chosen</span>
                    )}
                  </div>
                </div>
              </div>

              {/* File Input */}
              <div className="space-y-1.5">
                <Label htmlFor="image-file-input" className="text-xs font-semibold">Choose New Image File</Label>
                <Input
                  id="image-file-input"
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
                />
              </div>

              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-center text-muted-foreground">Uploading and updating database... {uploadProgress}%</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button 
                onClick={handleExecuteImageChange} 
                disabled={!previewFile || isUploading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Replace Image Now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Full Image View Dialog */}
        <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-slate-950 text-white border border-slate-800 shadow-2xl rounded-2xl flex flex-col justify-between">
            <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold text-white">{viewingImage?.title}</DialogTitle>
                <DialogDescription className="font-mono text-xs text-slate-400 truncate max-w-md">
                  {viewingImage?.imageUrl}
                </DialogDescription>
              </div>
              <Badge className="capitalize text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {viewingImage?.categoryType}
              </Badge>
            </div>
            
            <div className="w-full min-h-[40vh] max-h-[65vh] p-6 flex items-center justify-center bg-black/60 overflow-hidden">
              {viewingImage?.imageUrl && (
                <img 
                  src={viewingImage.imageUrl} 
                  alt={viewingImage.title} 
                  className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-300" 
                />
              )}
            </div>
            
            <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">Folder: public/uploads/{viewingImage?.uploadFolder}</span>
              <Button size="sm" onClick={() => { const item = viewingImage; setViewingImage(null); if (item) handleOpenUploadModal(item); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                <Upload className="h-4 w-4 mr-1.5" /> Change This Image
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
