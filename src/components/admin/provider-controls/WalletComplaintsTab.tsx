"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquareWarning, Check, X, ShieldAlert, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { formatDateInTimezone, cn } from "@/lib/utils";
import { 
  getPendingWalletComplaintsAction, 
  resolveWalletComplaintAction, 
  deleteWalletComplaintAction,
  WalletComplaint 
} from "@/app/actions/providerWalletActions";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function WalletComplaintsTab() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  const [complaints, setComplaints] = useState<WalletComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Resolution Dialog State
  const [selectedComplaint, setSelectedComplaint] = useState<WalletComplaint | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'accepted' | 'rejected'>('accepted');
  const [notes, setNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [complaintToDelete, setComplaintToDelete] = useState<string | null>(null);

  const handleDeleteComplaint = async (complaintId: string) => {
    setIsDeleting(complaintId);
    try {
      const result = await deleteWalletComplaintAction(complaintId);
      if (result.success) {
        toast({ title: "Deleted", description: result.message });
        loadComplaints();
      } else {
        toast({ title: "Delete Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete dispute.", variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  const loadComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPendingWalletComplaintsAction();
      setComplaints(data);
    } catch (error) {
      console.error("Error loading complaints:", error);
      toast({ title: "Error", description: "Failed to load wallet disputes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const openResolution = (complaint: WalletComplaint, type: 'approve' | 'reject') => {
    setSelectedComplaint(complaint);
    const defaultStatus = type === 'approve' ? 'accepted' : 'rejected';
    setSelectedStatus(defaultStatus);
    setNotes(defaultStatus === 'accepted' 
      ? `Refund of ${symbol}${Number(complaint.amount).toFixed(2)} approved for transaction ${complaint.transactionId || complaint.id}.${complaint.bookingHumanId ? ` (Booking #${complaint.bookingHumanId})` : ''}` 
      : `Dispute closed (${defaultStatus}). Transaction charge stands for transaction ${complaint.transactionId || complaint.id}.${complaint.bookingHumanId ? ` (Booking #${complaint.bookingHumanId})` : ''}`
    );
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;

    if (!notes.trim()) {
      toast({ title: "Notes Required", description: "Please explain the resolution details.", variant: "destructive" });
      return;
    }

    setIsResolving(true);
    try {
      const result = await resolveWalletComplaintAction(
        selectedComplaint.id,
        selectedStatus,
        selectedComplaint.amount,
        notes.trim()
      );

      if (result.success) {
        toast({ title: "Dispute Resolved", description: result.message });
        setSelectedComplaint(null);
        loadComplaints();
      } else {
        toast({ title: "Resolution Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit resolution.", variant: "destructive" });
    } finally {
      setIsResolving(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    return formatDateInTimezone(new Date(timestamp), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Provider Disputes & Wallet Complaints</CardTitle>
          <CardDescription>Loading dispute messages...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-amber-500" />
            Provider Wallet Disputes
          </CardTitle>
          <CardDescription>
            Review and manually resolve commission fee refund disputes filed by service providers for cancelled or rejected bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {complaints.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquareWarning className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
              <p>No wallet disputes filed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Complaint ID</TableHead>
                    <TableHead>Filed Date</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Transaction & Booking</TableHead>
                    <TableHead>Dispute Message</TableHead>
                    <TableHead>Fee Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.map(comp => (
                    <TableRow key={comp.id}>
                      <TableCell className="pl-6 font-bold text-xs select-all text-muted-foreground font-mono">
                        {comp.complaintId || comp.id.substring(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatDate(comp.createdAt)}
                      </TableCell>
                      <TableCell className="font-bold text-sm">
                        {comp.providerName}
                        <span className="block text-[10px] text-muted-foreground font-mono">ID: {comp.providerId.substring(0, 8)}...</span>
                      </TableCell>
                      <TableCell>
                        {comp.transactionId && (
                          <div className="font-mono text-[10px] text-muted-foreground mb-1 select-all" title={comp.transactionId}>
                            Tx: {comp.transactionId}
                          </div>
                        )}
                        {comp.bookingHumanId ? (
                          <span className="font-mono text-xs text-primary font-bold">
                            Ref: #{comp.bookingHumanId}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">No Booking</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs font-medium text-slate-700 whitespace-pre-wrap">
                        {comp.message}
                      </TableCell>
                      <TableCell className="font-bold font-mono text-rose-600">
                        {symbol}{isNaN(Number(comp.amount)) ? "0.00" : Number(comp.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={cn(
                            "capitalize font-bold text-xs",
                            comp.status === 'pending' && "bg-amber-500 hover:bg-amber-600 text-white",
                            comp.status === 'accepted' && "bg-emerald-600 hover:bg-emerald-700 text-white",
                            comp.status === 'solved' && "bg-green-500 hover:bg-green-600 text-white",
                            comp.status === 'rejected' && "bg-rose-600 hover:bg-rose-700 text-white",
                            comp.status === 'processed' && "bg-blue-600 hover:bg-blue-700 text-white"
                          )}
                          variant="default"
                        >
                          {comp.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {comp.status === 'pending' ? (
                          <div className="flex justify-end items-center gap-1.5">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 border-green-200 text-green-700 bg-green-50 hover:bg-green-100 flex items-center gap-1 font-bold text-xs"
                              onClick={() => openResolution(comp, 'approve')}
                            >
                              <Check className="h-3.5 w-3.5" /> Approve Refund
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 flex items-center gap-1 font-bold text-xs"
                              onClick={() => openResolution(comp, 'reject')}
                            >
                              <X className="h-3.5 w-3.5" /> Close Dispute
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                              onClick={() => setComplaintToDelete(comp.id)}
                              disabled={isDeleting === comp.id}
                              title="Delete Dispute Record"
                            >
                              {isDeleting === comp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center gap-2">
                            <div className="text-left text-[11px] text-muted-foreground border-l-2 pl-2">
                              <span className="font-bold block text-slate-600">Resolved:</span>
                              {comp.resolutionNotes}
                            </div>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                              onClick={() => setComplaintToDelete(comp.id)}
                              disabled={isDeleting === comp.id}
                              title="Delete Dispute Record"
                            >
                              {isDeleting === comp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolution Confirmation Modal */}
      {selectedComplaint && (
        <Dialog open={!!selectedComplaint} onOpenChange={(open) => !open && setSelectedComplaint(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className={(selectedStatus === 'accepted') ? "text-emerald-500 h-5 w-5" : "text-rose-500 h-5 w-5"} />
                Resolve Provider Dispute
              </DialogTitle>
              <DialogDescription>
                Confirm resolution for provider <strong>{selectedComplaint.providerName}</strong> dispute on transaction <strong>{selectedComplaint.transactionId || selectedComplaint.id}</strong>{selectedComplaint.bookingHumanId ? <> (booking <strong>#{selectedComplaint.bookingHumanId}</strong>)</> : ''}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResolveSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="resolution-status">Resolution Status</Label>
                <select
                  id="resolution-status"
                  value={selectedStatus}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setSelectedStatus(val);
                    setNotes(val === 'accepted'
                      ? `Refund of ${symbol}${Number(selectedComplaint.amount).toFixed(2)} approved for transaction ${selectedComplaint.transactionId || selectedComplaint.id}.${selectedComplaint.bookingHumanId ? ` (Booking #${selectedComplaint.bookingHumanId})` : ''}`
                      : `Dispute closed (${val}). Transaction charge stands for transaction ${selectedComplaint.transactionId || selectedComplaint.id}.${selectedComplaint.bookingHumanId ? ` (Booking #${selectedComplaint.bookingHumanId})` : ''}`
                    );
                  }}
                  className="w-full h-10 px-3 border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isResolving}
                >
                  <option value="accepted">Accepted (Approve Refund)</option>
                  <option value="rejected">Rejected (No Refund)</option>
                </select>
              </div>

              {(selectedStatus === 'accepted') && (
                <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-xl border border-emerald-200 font-medium">
                  Saving this resolution will credit <strong>{symbol}{Number(selectedComplaint.amount).toFixed(2)}</strong> back to the provider's wallet balance.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="resolution-notes">Resolution Notes / Explanation</Label>
                <Textarea
                  id="resolution-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isResolving}
                  rows={3}
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setSelectedComplaint(null)} disabled={isResolving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isResolving} variant={(selectedStatus === 'accepted') ? 'default' : 'destructive'}>
                  {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Resolution
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Custom Delete Confirmation Dialog */}
      {complaintToDelete && (
        <Dialog open={!!complaintToDelete} onOpenChange={(open) => !open && setComplaintToDelete(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="h-5 w-5 text-rose-600 animate-pulse" />
                Confirm Deletion
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this complaint record? This action cannot be undone and will permanently remove it from the database.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setComplaintToDelete(null)} disabled={isDeleting !== null}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={async () => {
                  const id = complaintToDelete;
                  setComplaintToDelete(null);
                  await handleDeleteComplaint(id);
                }} 
                disabled={isDeleting !== null}
              >
                {isDeleting !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
