
"use client";

import { useMemo } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CreditCard, HandCoins } from 'lucide-react';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getActiveCheckoutEntries } from '@/lib/cartManager';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { FirestoreService } from '@/types/firestore';

interface PaymentMethodsProps {
  selectedMethod: string;
  onSelect: (method: string) => void;
}

export default function PaymentMethods({ selectedMethod, onSelect }: PaymentMethodsProps) {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [serviceDetailsMap, setServiceDetailsMap] = useState<Record<string, FirestoreService>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchServiceDetails = async () => {
      const cartEntries = getActiveCheckoutEntries();
      if (cartEntries.length === 0) {
        setIsLoading(false);
        return;
      }
      try {
        const detailsPromises = cartEntries.map(async (entry) => {
          const serviceSnap = await getDoc(doc(db, "adminServices", entry.serviceId));
          return serviceSnap.exists() ? { ...serviceSnap.data(), id: serviceSnap.id } as FirestoreService : null;
        });
        const resolved = (await Promise.all(detailsPromises)).filter(Boolean) as FirestoreService[];
        const map = resolved.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});
        setServiceDetailsMap(map);
      } catch (e) {
        console.error("Error fetching service details for payment options", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchServiceDetails();
  }, []);

  const canOfferPayLater = useMemo(() => {
    if (!appConfig.enableCOD) return false;
    const cartEntries = getActiveCheckoutEntries();
    if (cartEntries.length === 0) return false;
    return cartEntries.every(entry => {
      const serviceDetail = serviceDetailsMap[entry.serviceId];
      return serviceDetail?.allowPayLater !== false;
    });
  }, [appConfig.enableCOD, serviceDetailsMap]);

  const onlinePaymentEnabled = useMemo(() => appConfig.enableOnlinePayment !== false, [appConfig]);

  const paymentOptions = useMemo(() => [
    { value: 'online', label: 'Pay Online (UPI, Card, or More)', icon: CreditCard, available: onlinePaymentEnabled },
    { value: 'Pay After Service', label: 'Pay After Service', icon: HandCoins, available: canOfferPayLater },
  ].filter(opt => opt.available), [onlinePaymentEnabled, canOfferPayLater]);

  if (isLoading || isLoadingAppSettings) return <div className="animate-pulse space-y-3"><div className="h-12 bg-muted rounded-md"/><div className="h-12 bg-muted rounded-md"/></div>;

  if (paymentOptions.length === 0) return <p className="text-sm text-destructive">No payment methods available.</p>;

  return (
    <RadioGroup value={selectedMethod} onValueChange={onSelect} className="space-y-3">
      {paymentOptions.map((method) => {
        const Icon = method.icon;
        return (
          <Label
            key={method.value}
            htmlFor={`payment-${method.value}`}
            className={`flex items-center space-x-3 border rounded-xl p-4 cursor-pointer transition-all hover:bg-accent/50 ${
              selectedMethod === method.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input'
            }`}
          >
            <RadioGroupItem value={method.value} id={`payment-${method.value}`} />
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium">{method.label}</span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
