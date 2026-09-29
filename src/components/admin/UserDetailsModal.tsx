
"use client";

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { FirestoreUser, Address, UserCart, FirestoreService } from '@/types/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  UserCircle, 
  Mail, 
  Phone, 
  CalendarDays, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Edit3, 
  Save, 
  MapPin,
  ShoppingCart,
  Package,
  Clock,
  ExternalLink
} from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import AppImage from '@/components/ui/AppImage';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { openWhatsAppChooser } from '@/lib/whatsappUtils';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from '@/lib/mysqlDb';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface CartItemDetail {
  serviceId: string;
  quantity: number;
  name: string;
  slug?: string;
  imageUrl?: string;
  price: number;
  discountedPrice?: number;
  description?: string;
}

interface UserDetailsModalProps {
  user: FirestoreUser;
  onClose: () => void;
  onUpdateUser: (updatedData: Partial<FirestoreUser>) => Promise<boolean>;
}

const userEditSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters.").max(50, "Name too long."),
  email: z.string().email("Invalid email address."),
  mobileNumber: z.string()
    .min(10, "Mobile number must be 10-15 digits.")
    .max(15, "Mobile number cannot exceed 15 digits.")
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (e.g., +919876543210 or 9876543210).")
    .optional().or(z.literal('')),
});

type UserEditFormData = z.infer<typeof userEditSchema>;

export default function UserDetailsModal({ user, onClose, onUpdateUser }: UserDetailsModalProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cartItems, setCartItems] = useState<CartItemDetail[]>([]);
  const [cartUpdatedAt, setCartUpdatedAt] = useState<any>(null);
  const [isLoadingCart, setIsLoadingCart] = useState(true);

  const targetUid = user.uid || user.id;

  useEffect(() => {
    if (!targetUid) {
      setIsLoadingCart(false);
      return;
    }

    setIsLoadingCart(true);
    const cartDocRef = doc(db, 'userCarts', targetUid);

    const unsubscribe = onSnapshot(cartDocRef, async (docSnap) => {
      if (!docSnap.exists()) {
        setCartItems([]);
        setCartUpdatedAt(null);
        setIsLoadingCart(false);
        return;
      }

      const cartData = docSnap.data() as UserCart;
      setCartUpdatedAt(cartData.updatedAt || null);
      const items = cartData.items || [];

      if (items.length === 0) {
        setCartItems([]);
        setIsLoadingCart(false);
        return;
      }

      try {
        const itemDetails = await Promise.all(
          items.map(async (item) => {
            try {
              const serviceSnap = await getDoc(doc(db, 'adminServices', item.serviceId));
              if (serviceSnap.exists()) {
                const sData = serviceSnap.data() as FirestoreService;
                return {
                  serviceId: item.serviceId,
                  quantity: item.quantity,
                  name: sData.name || 'Unnamed Service',
                  slug: sData.slug || '',
                  imageUrl: sData.imageUrl || '',
                  price: typeof sData.price === 'number' ? sData.price : 0,
                  discountedPrice: typeof sData.discountedPrice === 'number' ? sData.discountedPrice : undefined,
                  description: sData.description || sData.shortDescription || '',
                };
              }
            } catch (err) {
              console.error('Error fetching service detail for cart item:', item.serviceId, err);
            }
            return {
              serviceId: item.serviceId,
              quantity: item.quantity,
              name: `Service (${item.serviceId})`,
              price: 0,
            };
          })
        );
        setCartItems(itemDetails);
      } catch (err) {
        console.error('Error processing cart items:', err);
      } finally {
        setIsLoadingCart(false);
      }
    }, (error) => {
      console.error('Error listening to user cart:', error);
      setIsLoadingCart(false);
    });

    return () => unsubscribe();
  }, [targetUid]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      const effectivePrice = item.discountedPrice !== undefined ? item.discountedPrice : item.price;
      return acc + effectivePrice * item.quantity;
    }, 0);
  }, [cartItems]);

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      displayName: user.displayName || "",
      email: user.email || "",
      mobileNumber: user.mobileNumber || "",
    },
  });

  useEffect(() => {
    form.reset({
      displayName: user.displayName || "",
      email: user.email || "",
      mobileNumber: user.mobileNumber || "",
    });
  }, [user, form]);

  const onSubmit = async (data: UserEditFormData) => {
    setIsSubmitting(true);
    const success = await onUpdateUser({
      displayName: data.displayName,
      email: data.email,
      mobileNumber: data.mobileNumber || null,
    });
    setIsSubmitting(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const formatTimestampForIndia = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    const d = new Date(millis);
    return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
  };
  
  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber?: string | null) => {
    e.stopPropagation();
    if (!mobileNumber) return;
    const message = "Hi, I'm contacting you from Yourbrand.";
    openWhatsAppChooser(mobileNumber, message);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col max-h-[90vh] relative">
        <DialogHeader className="p-3 pb-4 border-b flex-shrink-0">
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
              <AvatarFallback className="text-2xl">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : <UserCircle />}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-2xl">{isEditing ? "Edit User Details" : "User Details"}</DialogTitle>
              <DialogDescription>
                {isEditing ? `Modify information for ${user.displayName || user.email}.` : `Viewing details for ${user.displayName || user.email}.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto pb-20">
          <div className="p-3 space-y-6">
            {isEditing ? (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><UserCircle className="mr-2 h-4 w-4 text-muted-foreground"/>Display Name</FormLabel>
                      <FormControl><Input {...field} disabled={isSubmitting} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground"/>Email Address</FormLabel>
                      <FormControl><Input type="email" {...field} disabled={isSubmitting} /></FormControl>
                      <FormMessage />
                      <FormDescription className="text-xs">Changing this only updates Firestore record, not Firebase Auth login email without Admin SDK.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mobileNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Mobile Number</FormLabel>
                      <FormControl><Input type="tel" {...field} disabled={isSubmitting} placeholder="e.g., +919876543210" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><strong>Member ID:</strong> <span className="font-bold text-primary">#{user.userNumber || "N/A"}</span></div>
                  <div><strong>Display Name:</strong> {user.displayName || "N/A"}</div>
                  <div><strong>Email:</strong> {user.email || "N/A"}</div>
                  <div className="flex items-center gap-2">
                    <strong>Mobile:</strong> 
                    <a href={`tel:${user.mobileNumber}`} className="text-primary hover:underline font-medium">{user.mobileNumber || "N/A"}</a>
                    {user.mobileNumber && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleWhatsAppClick(e, user.mobileNumber)} title="Chat on WhatsApp">
                           <AppImage src="/whatsapp.png" alt="WhatsApp Icon" width={24} height={24} />
                           <span className="sr-only">Chat on WhatsApp</span>
                        </Button>
                    )}
                  </div>
                  <div><strong>User ID (UID):</strong> <span className="text-xs">{user.uid}</span></div>
                  <div><strong>Created At:</strong> {formatTimestampForIndia(user.createdAt)}</div>
                  <div><strong>Last Login:</strong> {formatTimestampForIndia(user.lastLoginAt)}</div>
                  <div>
                    <strong>Status:</strong>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {user.isActive ? <CheckCircle className="mr-1 h-3 w-3"/> : <XCircle className="mr-1 h-3 w-3"/>}
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                  {user.roles && user.roles.length > 0 && <div><strong>Roles:</strong> {user.roles.join(', ')}</div>}
                </div>
              </div>
            )}
            <Separator className="my-4"/>
            <div>
              <h3 className="text-lg font-semibold mb-3">Saved Addresses ({user.addresses?.length || 0})</h3>
              {user.addresses && user.addresses.length > 0 ? (
                <div className="space-y-3">
                  {user.addresses.map((address) => (
                    <div key={address.id} className="p-3 border rounded-md text-xs bg-muted/30 overflow-x-hidden">
                      <p className="font-semibold">{address.fullName}</p>
                      <p>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}</p>
                      <p>{address.city}, {address.state} - {address.pincode}</p>
                      <p>Ph: <a href={`tel:${address.phone}`} className="hover:underline">{address.phone}</a></p>
                      {address.latitude && address.longitude && (
                        <a href={`https://www.google.com/maps?q=${address.latitude},${address.longitude}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 mt-1">
                          <MapPin size={12}/> View on Map
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No saved addresses for this user.</p>
              )}
            </div>

            <Separator className="my-4"/>
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">User Cart</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                    {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                {cartUpdatedAt && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated: {formatTimestampForIndia(cartUpdatedAt)}
                  </span>
                )}
              </div>

              {isLoadingCart ? (
                <div className="flex items-center justify-center p-6 border rounded-xl bg-muted/20">
                  <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                  <span className="text-xs text-muted-foreground">Loading cart items...</span>
                </div>
              ) : cartItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2.5">
                    {cartItems.map((item) => {
                      const effectivePrice = item.discountedPrice !== undefined ? item.discountedPrice : item.price;
                      const itemTotal = effectivePrice * item.quantity;
                      return (
                        <div
                          key={item.serviceId}
                          className="p-3 sm:p-3.5 border rounded-2xl bg-muted/20 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-3 w-full min-w-0 overflow-hidden"
                        >
                          {/* Top / Left Section: Image + Details */}
                          <div className="flex items-start sm:items-center gap-3 w-full min-w-0 flex-grow">
                            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0 border shadow-xs">
                              {item.imageUrl ? (
                                <AppImage
                                  src={item.imageUrl}
                                  alt={item.name}
                                  fill
                                  sizes="64px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <Package className="h-6 w-6 opacity-40" />
                                </div>
                              )}
                            </div>

                            <div className="flex-grow min-w-0 w-full">
                              <div className="flex items-start justify-between gap-1.5 w-full min-w-0">
                                <h4 className="font-bold text-sm text-foreground line-clamp-2 leading-snug break-words flex-grow min-w-0">
                                  {item.name}
                                </h4>
                                {item.slug && (
                                  <Link
                                    href={`/service/${item.slug}`}
                                    target="_blank"
                                    className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 mt-0.5 p-0.5"
                                    title="View Service Page"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Link>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 break-words">{item.description}</p>
                              )}
                              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-xs w-full min-w-0">
                                <span className="font-semibold text-muted-foreground bg-background/80 px-2 py-0.5 rounded border text-[11px] flex-shrink-0">
                                  Qty: <strong className="text-foreground">{item.quantity}</strong>
                                </span>
                                <span className="text-muted-foreground hidden sm:inline">•</span>
                                <span className="font-semibold text-primary flex-shrink-0">
                                  {symbol}{effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                                </span>
                                {item.discountedPrice !== undefined && item.discountedPrice < item.price && (
                                  <span className="text-[10px] text-muted-foreground line-through flex-shrink-0">
                                    {symbol}{item.price.toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bottom on mobile / Right on desktop: Item Total */}
                          <div className="flex sm:flex-col justify-between sm:justify-center items-center sm:items-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 flex-shrink-0 w-full sm:w-auto">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Item Total</span>
                            <span className="font-black text-sm sm:text-base text-foreground">
                              {symbol}{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cart Total Summary */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/5 border border-primary/20">
                    <span className="font-bold text-xs sm:text-sm text-foreground">Estimated Cart Total:</span>
                    <span className="font-black text-base sm:text-lg text-primary">
                      {symbol}{cartTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 px-4 border rounded-xl bg-muted/10 text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">User cart is currently empty</p>
                  <p className="text-[11px] text-muted-foreground/70">No services currently added in this user's cart.</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-3 border-t bg-muted/50 flex-shrink-0 fixed bottom-0 left-0 right-0 z-10 !flex-row !justify-end !space-x-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => { onClose(); setIsEditing(false); }} disabled={isSubmitting}>Close</Button>
          </DialogClose>
          {isEditing ? (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                setTimeout(() => {
                  setIsEditing(true);
                }, 0);
              }}
            >
              <Edit3 className="mr-2 h-4 w-4" /> Edit User
            </Button>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}
