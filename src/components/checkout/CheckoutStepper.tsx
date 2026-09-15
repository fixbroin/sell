"use client";

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ShoppingCart, CreditCard, CheckCircle2 } from 'lucide-react';

const steps = [
  { id: 'cart', label: 'Cart', href: '/cart', icon: ShoppingCart },
  { id: 'checkout', label: 'Checkout', href: '/checkout', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', href: '/checkout/thank-you', icon: CheckCircle2 },
];

interface CheckoutStepperProps {
  currentStepId: 'cart' | 'checkout' | 'confirmation';
}

const CheckoutStepper: React.FC<CheckoutStepperProps> = ({ currentStepId }) => {
  const pathname = usePathname();
  const currentStepIndex = steps.findIndex(step => step.id === currentStepId);

  return (
    <nav aria-label="Checkout steps" className="mb-8">
      <ol className="flex items-center justify-center space-x-2 sm:space-x-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <li key={step.id} className="flex-1">
              <div
                className={cn(
                  "group flex flex-col items-center border-t-4 pt-2 transition-colors",
                  isCurrent ? "border-primary" : isCompleted ? "border-accent" : "border-muted"
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 sm:h-7 sm:w-7 mb-1",
                    isCurrent ? "text-primary" : isCompleted ? "text-accent" : "text-muted-foreground"
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-xs sm:text-sm font-medium text-center",
                    isCurrent ? "text-primary" : isCompleted ? "text-accent" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default CheckoutStepper;
