'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { 
  PushTemplate, 
  togglePushTemplateAction,
  updatePushTemplateAction,
  resetPushTemplateAction,
  getMarketingUsersAction,
  sendBulkPushNotificationAction,
  MarketingUser,
  sendTestPushAction
} from '@/app/actions/pushSettingsActions';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Bell, Search, Loader2, Edit, RotateCcw, Send, Users, Image, Sparkles } from 'lucide-react';

interface PushSettingsClientProps {
  initialTemplates: PushTemplate[];
}

export default function PushSettingsClient({ initialTemplates }: PushSettingsClientProps) {
  const [templates, setTemplates] = useState<PushTemplate[]>(initialTemplates);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('settings');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [testingTemplateId, setTestingTemplateId] = useState<string | null>(null);
  const [testPushDialogOpen, setTestPushDialogOpen] = useState(false);
  const [testPushUid, setTestPushUid] = useState('');
  const [testPushTemplateId, setTestPushTemplateId] = useState<string | null>(null);

  const handleTestPushClick = (templateId: string) => {
    setTestPushTemplateId(templateId);
    setTestPushUid(auth.currentUser?.uid || '');
    setTestPushDialogOpen(true);
  };

  const handleSendTestPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPushTemplateId || !testPushUid.trim()) return;

    const templateId = testPushTemplateId;
    const adminUid = testPushUid.trim();
    setTestingTemplateId(templateId);
    setTestPushDialogOpen(false);

    try {
      const result = await sendTestPushAction(templateId, adminUid);
      if (result.success) {
        toast({
          title: "Test Push Sent",
          description: result.message,
          className: "bg-green-100 border-green-300 text-green-700 font-medium"
        });
      } else {
        toast({
          variant: "destructive",
          title: "Test Push Failed",
          description: result.message
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Test Push Failed",
        description: err.message || "An unexpected error occurred."
      });
    } finally {
      setTestingTemplateId(null);
      setTestPushTemplateId(null);
    }
  };

  // Template Editing State
  const [editingTemplate, setEditingTemplate] = useState<PushTemplate | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  // Marketing Push Notification State
  const [marketingUsers, setMarketingUsers] = useState<MarketingUser[]>([]);
  const [targetAudience, setTargetAudience] = useState<'all_users' | 'all_providers' | 'specific'>('all_users');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [marketingTitle, setMarketingTitle] = useState('');
  const [marketingBody, setMarketingBody] = useState('');
  const [marketingHref, setMarketingHref] = useState('');
  const [marketingImageUrl, setMarketingImageUrl] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Fetch marketing users when entering marketing tab
  useEffect(() => {
    if (activeTab === 'marketing') {
      const fetchUsers = async () => {
        const users = await getMarketingUsersAction();
        setMarketingUsers(users);
      };
      fetchUsers();
    }
  }, [activeTab]);

  const handleToggle = async (template: PushTemplate, checked: boolean) => {
    setTemplates(prev => 
      prev.map(t => t.id === template.id ? { ...t, isEnabled: checked } : t)
    );

    startTransition(async () => {
      const result = await togglePushTemplateAction(template.id, checked);
      if (result.success) {
        toast({
          title: "Setting Updated",
          description: `"${template.title}" notification status changed.`,
        });
      } else {
        setTemplates(prev => 
          prev.map(t => t.id === template.id ? { ...t, isEnabled: !checked } : t)
        );
        toast({
          variant: "destructive",
          title: "Failed to update setting",
          description: result.message
        });
      }
    });
  };

  const handleEditClick = (template: PushTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditBody(template.body);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    startTransition(async () => {
      const result = await updatePushTemplateAction(
        editingTemplate.id,
        editingTemplate.isEnabled,
        editSubject,
        editBody
      );

      if (result.success) {
        setTemplates(prev => 
          prev.map(t => t.id === editingTemplate.id ? { ...t, subject: editSubject, body: editBody } : t)
        );
        setEditingTemplate(null);
        toast({
          title: "Template Saved",
          description: `"${editingTemplate.title}" was updated successfully.`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to save template",
          description: result.message
        });
      }
    });
  };

  const handleResetTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to reset this template to default title and body?")) return;

    startTransition(async () => {
      const result = await resetPushTemplateAction(templateId);
      if (result.success) {
        // Refresh local state
        window.location.reload();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to reset template",
          description: result.message
        });
      }
    });
  };

  const handleSendMarketingPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketingTitle || !marketingBody) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Title and Body are required to send a marketing push notification."
      });
      return;
    }

    if (targetAudience === 'specific' && selectedUids.length === 0) {
      toast({
        variant: "destructive",
        title: "No Users Selected",
        description: "Please select at least one user to send this push notification to."
      });
      return;
    }

    startTransition(async () => {
      const result = await sendBulkPushNotificationAction({
        target: targetAudience,
        selectedUids: targetAudience === 'specific' ? selectedUids : undefined,
        title: marketingTitle,
        body: marketingBody,
        href: marketingHref || undefined,
        imageUrl: marketingImageUrl || undefined
      });

      if (result.success) {
        toast({
          title: "Notification Sent",
          description: result.message
        });
        // Clear inputs on success
        setMarketingTitle('');
        setMarketingBody('');
        setMarketingHref('');
        setMarketingImageUrl('');
        setSelectedUids([]);
      } else {
        toast({
          variant: "destructive",
          title: "Failed to send notifications",
          description: result.message
        });
      }
    });
  };

  const handleSelectUser = (uid: string, checked: boolean) => {
    if (checked) {
      setSelectedUids(prev => [...prev, uid]);
    } else {
      setSelectedUids(prev => prev.filter(id => id !== uid));
    }
  };

  const handleSelectAllFiltered = (filteredList: MarketingUser[]) => {
    const filteredUids = filteredList.map(u => u.uid);
    // If all are already selected, deselect them
    const allSelected = filteredUids.every(uid => selectedUids.includes(uid));
    if (allSelected) {
      setSelectedUids(prev => prev.filter(uid => !filteredUids.includes(uid)));
    } else {
      // Add missing ones
      setSelectedUids(prev => {
        const unique = new Set([...prev, ...filteredUids]);
        return Array.from(unique);
      });
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = marketingUsers.filter(u => 
    u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="flex w-full justify-start overflow-x-auto h-10 p-1 bg-muted text-muted-foreground rounded-md max-w-full whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <TabsTrigger value="settings" className="flex items-center gap-2 shrink-0">
          <Bell className="h-4 w-4" />
          Settings & Templates
        </TabsTrigger>
        <TabsTrigger value="marketing" className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4" />
          Marketing Push
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="space-y-6">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search push settings..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className={`${!template.isEnabled ? 'opacity-70 bg-slate-50/50 dark:bg-slate-900/10' : ''}`}>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary shrink-0" />
                    {template.title}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {template.description}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={template.isEnabled}
                      onCheckedChange={(checked) => handleToggle(template, checked)}
                      disabled={isPending}
                    />
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground select-none">
                      {template.isEnabled ? 'Enabled' : 'Disabled'}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestPushClick(template.id)}
                      disabled={isPending || testingTemplateId === template.id}
                      className="h-8 text-xs sm:text-sm border-primary/30 text-primary hover:bg-primary/5"
                    >
                      {testingTemplateId === template.id ? 'Sending...' : 'Test Push'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEditClick(template)}
                      disabled={isPending}
                      className="h-8 text-xs sm:text-sm"
                    >
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      Edit Template
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleResetTemplate(template.id)}
                      disabled={isPending}
                      className="h-8 w-8 hover:bg-destructive/10 group/btn"
                      title="Reset to Default"
                    >
                      <RotateCcw className="h-4 w-4 text-muted-foreground group-hover/btn:text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 border-t pt-4">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Push Title: <span className="font-mono text-xs font-normal text-muted-foreground">{template.subject}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Push Body: <span className="font-mono text-xs font-normal text-muted-foreground">{template.body}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Placeholders: </span>
                    {template.placeholders.map(p => (
                      <code key={p} className="bg-muted px-1.5 py-0.5 rounded text-[11px] mr-1.5 font-mono">
                        {`{${p}}`}
                      </code>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredTemplates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-slate-50/50 dark:bg-slate-900/10">
              No push settings found matching "{searchTerm}"
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="marketing" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Broadcast Marketing Push Notification
            </CardTitle>
            <CardDescription>
              Draft and send real-time marketing push notifications directly to user and provider device web apps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendMarketingPush} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="target-audience">Target Audience</Label>
                  <select 
                    id="target-audience"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="all_users">All Registered Customers</option>
                    <option value="all_providers">All Registered Providers/Technicians</option>
                    <option value="specific">Specific Individual Users</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marketing-title">Push Notification Title</Label>
                  <Input 
                    id="marketing-title"
                    placeholder="e.g., Limited Time Weekend Offer!"
                    value={marketingTitle}
                    onChange={(e) => setMarketingTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              {targetAudience === 'specific' && (
                <div className="space-y-3 border p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/10">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Label className="font-semibold text-sm">Select Target Users ({selectedUids.length} selected)</Label>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search user list..."
                        className="pl-7 h-9 text-xs"
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="max-h-60 overflow-y-auto border rounded divide-y bg-background">
                    {filteredUsers.length > 0 && (
                      <div className="p-2 bg-muted/30 flex items-center justify-between sticky top-0 border-b">
                        <span className="text-xs font-semibold text-muted-foreground">User details</span>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs"
                          onClick={() => handleSelectAllFiltered(filteredUsers)}
                        >
                          Toggle Selection
                        </Button>
                      </div>
                    )}
                    {filteredUsers.map(user => {
                      const isChecked = selectedUids.includes(user.uid);
                      return (
                        <div key={user.uid} className="flex items-center space-x-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900">
                          <input
                            type="checkbox"
                            id={`user-${user.uid}`}
                            checked={isChecked}
                            onChange={(e) => handleSelectUser(user.uid, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <label 
                              htmlFor={`user-${user.uid}`}
                              className="text-sm font-medium text-slate-700 dark:text-slate-300 block truncate cursor-pointer select-none"
                            >
                              {user.name} <span className="text-xs font-normal text-muted-foreground">({user.email})</span>
                            </label>
                            <span className="inline-block bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] uppercase font-bold mt-0.5">
                              {user.role}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <div className="text-center p-6 text-xs text-muted-foreground">
                        No active users found with registered push devices.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="marketing-body">Message Body</Label>
                <Textarea 
                  id="marketing-body"
                  placeholder="Type the message body details here..."
                  value={marketingBody}
                  onChange={(e) => setMarketingBody(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="marketing-href">Redirection Path (Optional)</Label>
                  <Input 
                    id="marketing-href"
                    placeholder="e.g., /services/plumbing or /promo-codes"
                    value={marketingHref}
                    onChange={(e) => setMarketingHref(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marketing-image">Promo Image URL (Optional)</Label>
                  <Input 
                    id="marketing-image"
                    placeholder="e.g., /uploads/banners/special-promo.png"
                    value={marketingImageUrl}
                    onChange={(e) => setMarketingImageUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isPending} className="flex items-center gap-2">
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Push Broadcast
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Edit Template Dialog */}
      <Dialog open={editingTemplate !== null} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Push Template</DialogTitle>
            <DialogDescription>
              Customize the notification title and body patterns. Click placeholders below to insert them.
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold">{editingTemplate.title}</Label>
                <p className="text-xs text-muted-foreground">{editingTemplate.description}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-subject">Notification Title Pattern</Label>
                <Input
                  id="edit-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Enter push title pattern"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-body">Notification Body Pattern</Label>
                <Textarea
                  id="edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Enter push body pattern"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Available Placeholders (Click to Insert):</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {editingTemplate.placeholders.map(placeholder => (
                    <Button
                      key={placeholder}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs font-mono px-2"
                      onClick={() => setEditBody(prev => prev + `{${placeholder}}`)}
                    >
                      {`{${placeholder}}`}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Test Push Dialog Modal */}
      <Dialog open={testPushDialogOpen} onOpenChange={setTestPushDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Send Test Push Notification
            </DialogTitle>
            <DialogDescription>
              Enter the target Admin User ID (UID) to dispatch a test FCM push notification preview.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendTestPush} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="test-push-input">User ID (UID)</Label>
              <Input
                id="test-push-input"
                type="text"
                required
                placeholder="Enter target Admin UID"
                value={testPushUid}
                onChange={(e) => setTestPushUid(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTestPushDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Send Test
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
