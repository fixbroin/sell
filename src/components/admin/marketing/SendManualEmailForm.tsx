
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Users, UserSearch, Copy, Tag, Layers, Search, Tags, CheckCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, where, limit } from '@/lib/mysqlDb';
import type { FirestoreUser, FirestoreService, FirestoreCategory } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { sendBulkMarketingEmail } from '@/ai/flows/sendBulkMarketingEmailFlow';
import { getBaseUrl } from '@/lib/config';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const sendEmailFormSchema = z.object({
  targetAudience: z.enum(['all', 'specific'], { required_error: "Please select an audience."}),
  userIds: z.array(z.string()).optional(),
  subject: z.string().min(5, "Subject must be at least 5 characters."),
  body: z.string().min(20, "Email body must be at least 20 characters."),
  categoryId: z.string().optional(),
});
type SendEmailFormData = z.infer<typeof sendEmailFormSchema>;

const mergeTags = [
    { tag: '{{name}}', label: 'Full Name', group: 'User Details' },
    { tag: '{{email}}', label: 'Email Address', group: 'User Details' },
    { tag: '{{mobile}}', label: 'Mobile Number', group: 'User Details' },
    { tag: '{{signupDate}}', label: 'Signup Date', group: 'User Details' },
    { tag: '{{websiteName}}', label: 'Website Name', group: 'App Details' },
    { tag: '{{websiteUrl}}', label: 'Website URL', group: 'App Details' },
    { tag: '{{supportEmail}}', label: 'Support Email', group: 'App Details' },
    { tag: '{{companyAddress}}', label: 'Company Address', group: 'App Details' },
    { tag: '{{popular_services}}', label: 'Popular Services (Top 5)', group: 'Dynamic Content' },
    { tag: '{{popular_categories}}', label: 'Popular Categories (Top 5)', group: 'Dynamic Content' },
    { tag: '{{all_services}}', label: 'All Services', group: 'Dynamic Content' },
    { tag: '{{all_categories}}', label: 'All Categories', group: 'Dynamic Content' },
    { tag: '{{category_services}}', label: 'Services from Selected Category', group: 'Dynamic Content' },
];

const groupedMergeTags = mergeTags.reduce((acc, tag) => {
    (acc[tag.group] = acc[tag.group] || []).push(tag);
    return acc;
}, {} as Record<string, typeof mergeTags>);


export default function SendManualEmailForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [isSending, setIsSending] = useState(false);
  const [allUsers, setAllUsers] = useState<FirestoreUser[]>([]);
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);

  const form = useForm<SendEmailFormData>({
    resolver: zodResolver(sendEmailFormSchema),
    defaultValues: { targetAudience: 'all', userIds: [], subject: "", body: "", categoryId: "none" },
  });

  const watchedTargetAudience = form.watch('targetAudience');

  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const watchedCategoryId = form.watch('categoryId');

  const selectedCategory = useMemo(() => {
    if (watchedCategoryId === 'none') return { name: "-- None --" };
    return allCategories.find(c => c.id === watchedCategoryId);
  }, [allCategories, watchedCategoryId]);

  const searchableCategories = useMemo(() => {
    return allCategories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [allCategories, categorySearch]);

  useEffect(() => {
    const fetchSelectData = async () => {
      setIsLoadingCategories(true);
      try {
        const catQuery = query(collection(db, "adminCategories"), orderBy("name", "asc"));
        const catSnapshot = await getDocs(catQuery);
        setAllCategories(catSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
      } catch (error) {
        toast({ title: "Error", description: "Could not load categories for dropdown.", variant: "destructive" });
      } finally {
        setIsLoadingCategories(false);
      }
    };
    fetchSelectData();
  }, [toast]);

  useEffect(() => {
    if (watchedTargetAudience === 'specific' && allUsers.length === 0) {
      const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
          const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
          const snapshot = await getDocs(usersQuery);
          setAllUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
        } catch (error) { toast({ title: "Error", description: "Could not load users.", variant: "destructive" }); }
        finally { setIsLoadingUsers(false); }
      };
      fetchUsers();
    }
    if (watchedTargetAudience === 'all') {
        setSelectedUser(null);
        form.setValue('userIds', []);
    }
  }, [watchedTargetAudience, allUsers.length, toast, form]);
  
  const filteredUsers = userSearchTerm
    ? allUsers.filter(user =>
        (user.displayName && user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.mobileNumber && user.mobileNumber.includes(userSearchTerm))
      ).slice(0, 5) 
    : [];

  const handleUserSelect = (user: FirestoreUser) => {
    setSelectedUser(user);
    setUserSearchTerm('');
    form.setValue('userIds', [user.id]);
  };
  
  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    toast({ description: `Copied "${tag}" to clipboard.` });
  };
  
  const onSubmit = async (data: SendEmailFormData) => {
    setIsSending(true);
    toast({ title: "Sending Email(s)...", description: "This may take a moment for bulk sends."});
    try {
        const targetUserIds = data.targetAudience === 'all' ? 'all' : (selectedUser ? [selectedUser.id] : []);
        if (targetUserIds.length === 0 && data.targetAudience === 'specific') {
            toast({ title: "Error", description: "Please select a user to send the email to.", variant: "destructive"});
            setIsSending(false);
            return;
        }

        const categoryIdToSend = (data.categoryId && data.categoryId !== 'none') ? data.categoryId : undefined;

        const result = await sendBulkMarketingEmail({
            targetUserIds,
            subject: data.subject,
            body: data.body,
            categoryIdForServices: categoryIdToSend,
        });
        
        if (result.success) {
            toast({ title: "Success!", description: result.message, className: "bg-green-100 border-green-300 text-green-700" });
            form.reset({ targetAudience: 'all', userIds: [], subject: "", body: "", categoryId: "none" });
            setSelectedUser(null);
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
      console.error("Error sending manual email:", error);
      toast({ title: "Error", description: (error as Error).message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Send Manual Email Campaign</CardTitle>
            <CardDescription>Compose and send an email to all or specific users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="targetAudience"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Select Audience</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col sm:flex-row gap-4" disabled={isSending}>
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="all" /></FormControl><FormLabel className="font-normal flex items-center"><Users className="mr-2 h-4 w-4"/>All Users</FormLabel></FormItem>
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="specific" /></FormControl><FormLabel className="font-normal flex items-center"><UserSearch className="mr-2 h-4 w-4"/>Specific User</FormLabel></FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchedTargetAudience === 'specific' && (
              <div className="relative">
                <FormLabel>Search for User</FormLabel>
                <Input placeholder="Search by name, email, or mobile..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} disabled={isSending || isLoadingUsers} />
                {selectedUser && (
                    <div className="mt-2 p-2 border rounded-md bg-muted text-sm">Selected: <span className="font-semibold">{selectedUser.displayName}</span> ({selectedUser.email}) <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setSelectedUser(null)}>Clear</Button></div>
                )}
                {userSearchTerm && filteredUsers.length > 0 && (
                  <ScrollArea className="absolute z-10 w-full bg-card border rounded-md shadow-lg mt-1 max-h-48">
                    {filteredUsers.map(user => (
                      <div key={user.id} onClick={() => handleUserSelect(user)} className="p-2 hover:bg-accent cursor-pointer text-sm">
                        {user.displayName} - {user.mobileNumber || user.email}
                      </div>
                    ))}
                  </ScrollArea>
                )}
                {isLoadingUsers && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
              </div>
            )}
            <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Category for Services (Optional)</FormLabel>
                    <Dialog open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSending || isLoadingCategories}
                          type="button"
                        >
                          {selectedCategory ? (
                            <div className="flex items-center gap-2">
                              <Tags className="h-4 w-4 text-primary" />
                              <span>{selectedCategory.name}</span>
                            </div>
                          ) : (
                            "Select a category..."
                          )}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Select Category</DialogTitle>
                          <DialogDescription>
                            Search and select a category to list its services.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Type category name..."
                              className="pl-8"
                              value={categorySearch}
                              onChange={(e) => setCategorySearch(e.target.value)}
                            />
                          </div>
                          <ScrollArea className="h-[300px] rounded-md border p-2">
                            <div className="space-y-1">
                              <Button
                                key="none"
                                variant={field.value === "none" ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                onClick={() => {
                                  field.onChange("none");
                                  setIsCategoryPickerOpen(false);
                                  setCategorySearch("");
                                }}
                                type="button"
                              >
                                <div className="flex items-center gap-2 pr-8">
                                  <Tags className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold text-sm">-- None --</span>
                                </div>
                                {field.value === "none" && (
                                  <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                )}
                              </Button>

                              {searchableCategories.map((cat) => (
                                <Button
                                  key={cat.id}
                                  variant={field.value === cat.id ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                  onClick={() => {
                                    field.onChange(cat.id);
                                    setIsCategoryPickerOpen(false);
                                    setCategorySearch("");
                                  }}
                                  type="button"
                                >
                                  <div className="flex items-center gap-2 pr-8">
                                    <Tags className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-semibold text-sm">{cat.name}</span>
                                  </div>
                                  {field.value === cat.id && (
                                    <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                              ))}

                              {searchableCategories.length === 0 && (
                                <p className="text-center py-4 text-sm text-muted-foreground">No categories found.</p>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <FormDescription>If selected, you can use the {"{{category_services}}"} merge tag in your email body.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <FormField control={form.control} name="subject" render={({ field }) => (<FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="Your Email Subject" {...field} disabled={isSending} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Email Body</FormLabel>
                    <FormControl><Textarea placeholder="Hi {{name}}, ... (HTML is supported)" {...field} rows={12} disabled={isSending} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Card className="p-3 bg-muted/50">
                <CardHeader className="p-1 pb-2"><CardTitle className="text-sm font-medium flex items-center"><Tag className="mr-2 h-4 w-4"/>Merge Tags</CardTitle></CardHeader>
                <CardContent className="p-1">
                  <p className="text-xs text-muted-foreground mb-2">Click to copy a tag.</p>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                        {Object.entries(groupedMergeTags).map(([groupName, tags]) => (
                            <div key={groupName}>
                                <h4 className="font-semibold text-xs text-foreground/80 mb-1">{groupName}</h4>
                                {tags.map(tag => (
                                    <Button key={tag.tag} type="button" variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleCopyTag(tag.tag)}>
                                        <Copy className="mr-2 h-3 w-3" />
                                        <span className="font-mono">{tag.tag}</span>
                                        <span className="text-muted-foreground ml-2 truncate">({tag.label})</span>
                                    </Button>
                                ))}
                            </div>
                        ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSending || isLoadingGlobalSettings}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Email
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
