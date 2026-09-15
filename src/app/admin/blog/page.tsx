
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, FileText, CheckCircle, XCircle, PackageSearch } from "lucide-react";
import type { FirestoreBlogPost, FirestoreCategory } from '@/types/firestore';
import BlogForm from '@/components/admin/BlogForm';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, getDocs } from '@/lib/mysqlDb';
import { ref as storageRef, deleteObject } from '@/lib/mysqlStorage';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { getTimestampMillis } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import PermissionGuard from '@/components/admin/PermissionGuard';

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<FirestoreBlogPost[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FirestoreBlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user, adminPermissions } = useAuth();

  const postsCollectionRef = collection(db, "blogPosts");
  const categoriesCollectionRef = collection(db, "adminCategories");

  useEffect(() => {
    setIsLoading(true);
    
    const fetchCategories = async () => {
        try {
            const catQuery = query(categoriesCollectionRef, orderBy("name"));
            const snapshot = await getDocs(catQuery);
            setCategories(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
        } catch (error) {
            console.error("Error fetching categories:", error);
            toast({ title: "Error", description: "Could not fetch categories.", variant: "destructive" });
        }
    };
    
    const qPosts = query(postsCollectionRef, orderBy("createdAt", "desc"));
    const unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBlogPost));
      // Explicitly sort by createdAt descending using JSON timestamp helper
      fetchedPosts.sort((a, b) => {
        const aTime = getTimestampMillis(a.createdAt);
        const bTime = getTimestampMillis(b.createdAt);
        return bTime - aTime;
      });
      setPosts(fetchedPosts);
      if (isLoading) setIsLoading(false);
    }, (error) => {
      console.error("Error fetching blog posts: ", error);
      toast({ title: "Error", description: "Could not fetch blog posts.", variant: "destructive" });
      setIsLoading(false);
    });

    fetchCategories();

    return () => unsubscribePosts();
  }, [toast]);

  const handleAddPost = () => {
    setEditingPost(null);
    setIsFormOpen(true);
  };

  const handleEditPost = (post: FirestoreBlogPost) => {
    setEditingPost(post);
    setIsFormOpen(true);
  };

  const handleDeletePost = async (post: FirestoreBlogPost) => {
    setIsSubmitting(true);
    try {
      if (post.coverImageUrl && post.coverImageUrl.includes("firebasestorage.googleapis.com")) {
        const imageRef = storageRef(storage, post.coverImageUrl);
        await deleteObject(imageRef);
      }
      await deleteDoc(doc(db, "blogPosts", post.id));
      toast({ title: "Success", description: "Blog post deleted successfully." });
      await triggerRefresh('blog');
      await triggerRefresh('sitemap');
      if (post.slug) {
        await submitToGoogleIndexing('blog', post.slug, false);
      }
    } catch (error) {
      console.error("Error deleting post: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not delete post.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleTogglePublished = async (post: FirestoreBlogPost) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "blogPosts", post.id), { isPublished: !post.isPublished, updatedAt: Timestamp.now() });
      toast({ title: "Status Updated", description: `Post "${post.title}" ${!post.isPublished ? "published" : "unpublished"}.`});
      await triggerRefresh('blog');
      await triggerRefresh('sitemap');
      if (post.slug) {
        await submitToGoogleIndexing('blog', post.slug, !post.isPublished);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not update post status.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreBlogPost, 'id' | 'createdAt' | 'updatedAt' | 'authorId' | 'authorName'> & { id?: string }) => {
    setIsSubmitting(true);
    const { id, ...payload } = data;

    try {
      if (id) {
        await updateDoc(doc(db, "blogPosts", id), { 
            ...payload, 
            authorId: user?.uid, 
            authorName: user?.displayName, 
            updatedAt: Timestamp.now() 
        });
        toast({ title: "Success", description: "Blog post updated." });
      } else {
        await addDoc(postsCollectionRef, { 
            ...payload, 
            authorId: user?.uid, 
            authorName: user?.displayName, 
            createdAt: Timestamp.now() 
        });
        toast({ title: "Success", description: "New blog post created." });
      }
      await triggerRefresh('blog');
      if (payload.slug) {
        await triggerRefresh(`blog-${payload.slug}`);
      }
      await triggerRefresh('sitemap');
      if (payload.slug) {
        await submitToGoogleIndexing('blog', payload.slug, payload.isPublished);
      }
      setIsFormOpen(false);
      setEditingPost(null);
    } catch (error) {
      console.error("Error saving post:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save post.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><FileText className="mr-2 h-6 w-6 text-primary" />Manage Blog Posts</CardTitle>
            <CardDescription>Create, edit, and publish articles for your website's blog.</CardDescription>
          </div>
          <PermissionGuard moduleId="blog" action="create">
            <Button onClick={handleAddPost} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Post
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : posts.length === 0 ? (
            <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No blog posts found. Add one to get started.</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Slug</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">{post.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{post.categoryName || 'N/A'}</TableCell>
                    <TableCell><Link href={`/blog/${post.slug}`} target="_blank" className="text-xs text-muted-foreground hover:underline">{post.slug}</Link></TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <PermissionGuard moduleId="blog" action="write" fallback={<Badge variant={post.isPublished ? 'default' : 'secondary'} className={post.isPublished ? 'bg-green-500' : ''}>{post.isPublished ? 'Published' : 'Draft'}</Badge>}>
                          <Switch id={`publish-switch-${post.id}`} checked={post.isPublished} onCheckedChange={() => handleTogglePublished(post)} disabled={isSubmitting}/>
                          <Badge variant={post.isPublished ? 'default' : 'secondary'} className={post.isPublished ? 'bg-green-500' : ''}>{post.isPublished ? 'Published' : 'Draft'}</Badge>
                        </PermissionGuard>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <PermissionGuard moduleId="blog" action="write">
                        <Button variant="outline" size="icon" onClick={() => handleEditPost(post)} disabled={isSubmitting}><Edit className="h-4 w-4" /></Button>
                      </PermissionGuard>
                      <PermissionGuard moduleId="blog" action="delete">
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting} className="ml-2"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the post "{post.title}".</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePost(post)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </PermissionGuard>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingPost(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:w-[90vw] max-w-4xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-3 pb-4 border-b"><DialogTitle>{editingPost ? 'Edit Blog Post' : 'Create New Blog Post'}</DialogTitle></DialogHeader>
          <BlogForm 
            onSubmit={handleFormSubmit} 
            initialData={editingPost} 
            onCancel={() => setIsFormOpen(false)} 
            isSubmitting={isSubmitting}
            categories={categories}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
