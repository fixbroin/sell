
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Mail, User, Phone, MapPin } from "lucide-react";
import type { ServiceZone, Address } from '@/types/firestore';
import { useEffect, useState, useCallback } from 'react';

export const addressSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Invalid email address.").optional().or(z.literal('')),
  phone: z.string().min(10, "Phone number must be at least 10 digits.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format."),
  addressLine1: z.string().min(5, "Address is too short."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City name is too short."),
  state: z.string().min(2, "State name is too short."),
  pincode: z.string().length(6, "Pincode must be 6 digits.").regex(/^\d+$/, "Invalid pincode."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export type AddressFormData = z.infer<typeof addressSchema>;

interface AddressFormProps {
  initialData?: Partial<Address> | null;
  onSubmit: (data: AddressFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitButtonText?: string;
  serviceZones?: ServiceZone[];
  onReselectOnMap?: () => void; // New callback
}

export default function AddressForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitButtonText = 'Save Address',
  serviceZones = [],
  onReselectOnMap, // New prop
}: AddressFormProps) {
  
  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: "", email: "", phone: "", addressLine1: "", addressLine2: "",
      city: "", state: "", pincode: "", latitude: null, longitude: null,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        fullName: initialData.fullName || "",
        email: initialData.email || "",
        phone: initialData.phone || "",
        addressLine1: initialData.addressLine1 || "",
        addressLine2: initialData.addressLine2 || "",
        city: initialData.city || "",
        state: initialData.state || "",
        pincode: initialData.pincode || "",
        latitude: initialData.latitude === undefined ? null : initialData.latitude,
        longitude: initialData.longitude === undefined ? null : initialData.longitude,
      });
    }
  }, [initialData, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Your full name" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="you@example.com" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
         </div>
         <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="+91..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
         <Alert>
            <MapPin className="h-4 w-4" />
            <AlertTitle className="flex justify-between items-center">
              <span>Location Coordinates</span>
              {onReselectOnMap && (
                <Button type="button" variant="link" size="sm" onClick={onReselectOnMap} className="p-0 h-auto text-xs">
                  Re-select on Map
                </Button>
              )}
            </AlertTitle>
            <AlertDescription className="text-xs">
              Lat: {form.watch('latitude')?.toFixed(6) || 'Not Set'}, Lng: {form.watch('longitude')?.toFixed(6) || 'Not Set'}
            </AlertDescription>
        </Alert>
         <FormField control={form.control} name="addressLine1" render={({ field }) => (<FormItem><FormLabel>Address Line 1</FormLabel><FormControl><Input placeholder="House No., Building, Street" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
         <FormField control={form.control} name="addressLine2" render={({ field }) => (<FormItem><FormLabel>Address Line 2 (Optional)</FormLabel><FormControl><Input placeholder="Apartment, Floor, Landmark" {...field} value={field.value ?? ""} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
         <div className="grid grid-cols-2 gap-4">
           <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
           <FormField control={form.control} name="state" render={({ field }) => (<FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
         </div>
         <FormField control={form.control} name="pincode" render={({ field }) => (<FormItem><FormLabel>Pincode</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}

