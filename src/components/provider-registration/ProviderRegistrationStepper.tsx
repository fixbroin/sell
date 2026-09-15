
"use client";

import { cn } from '@/lib/utils';
import { UserPlus, CheckCircle2, ListChecks, UserCircle, FileText, MapPin, Banknote } from 'lucide-react';

interface Step {
  id: number;
  name: string;
  icon: React.ElementType;
}

const steps: Step[] = [
  { id: 1, name: 'Category & Skills', icon: ListChecks },
  { id: 2, name: 'Personal Info', icon: UserCircle },
  { id: 3, name: 'KYC Documents', icon: FileText },
  { id: 4, name: 'Location & Bank', icon: MapPin },
];

interface ProviderRegistrationStepperProps {
  currentStep: number; // 1-based index
}

export default function ProviderRegistrationStepper({ currentStep }: ProviderRegistrationStepperProps) {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
        {steps.map((step, index) => (
          <li key={step.name} className="md:flex-1">
            {currentStep > step.id ? (
              <div className="group flex w-full flex-col border-l-4 border-primary py-2 pl-4 transition-colors md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4">
                <span className="text-sm font-medium text-primary transition-colors flex items-center">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  {step.name}
                </span>
                <span className="text-xs font-medium text-muted-foreground">Step {step.id} - Completed</span>
              </div>
            ) : currentStep === step.id ? (
              <div
                className="flex w-full flex-col border-l-4 border-primary py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4"
                aria-current="step"
              >
                <span className="text-sm font-medium text-primary flex items-center">
                  <step.icon className="mr-2 h-5 w-5 animate-pulse" />
                  {step.name}
                </span>
                <span className="text-xs font-medium text-muted-foreground">Step {step.id} - Current</span>
              </div>
            ) : (
              <div className="group flex h-full w-full flex-col border-l-4 border-border py-2 pl-4 transition-colors md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4">
                <span className="text-sm font-medium text-muted-foreground transition-colors flex items-center">
                  <step.icon className="mr-2 h-5 w-5" />
                  {step.name}
                </span>
                <span className="text-xs font-medium text-muted-foreground">Step {step.id} - Upcoming</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
