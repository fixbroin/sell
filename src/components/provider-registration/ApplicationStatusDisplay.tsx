
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Home } from 'lucide-react';
import type { ProviderApplicationStatus } from '@/types/firestore';

interface ApplicationStatusDisplayProps {
  status: ProviderApplicationStatus | 'approved' | 'rejected' | 'pending_review';
  message?: string; // For 'rejected' or 'needs_update'
}

export default function ApplicationStatusDisplay({ status, message }: ApplicationStatusDisplayProps) {
  let IconComponent;
  let titleText;
  let descriptionText;
  let cardVariant: "default" | "destructive" | "warning" = "default";

  switch (status) {
    case 'approved':
      IconComponent = CheckCircle2;
      titleText = "Application Approved!";
      descriptionText = "Congratulations! Your provider application has been approved. You can now access your provider dashboard.";
      cardVariant = "default";
      break;
    case 'rejected':
      IconComponent = XCircle;
      titleText = "Application Status";
      descriptionText = "We regret to inform you that your application could not be approved at this time.";
      cardVariant = "destructive";
      break;
    case 'pending_review':
      IconComponent = Clock;
      titleText = "Application Under Review";
      descriptionText = "Your application has been submitted and is currently under review. We will notify you once it's processed.";
      cardVariant = "default";
      break;
    case 'needs_update':
      IconComponent = AlertTriangle;
      titleText = "Application Needs Update";
      descriptionText = "There are some updates required for your application. Please review the comments and resubmit.";
      cardVariant = "warning";
      break;
    default: // Should not happen if status is properly managed
      IconComponent = AlertTriangle;
      titleText = "Unknown Application Status";
      descriptionText = "There was an issue determining your application status. Please contact support.";
      cardVariant = "warning";
  }

  return (
    <Card className={`text-center border-${cardVariant === 'destructive' ? 'destructive' : cardVariant === 'warning' ? 'yellow-500' : 'primary'} shadow-md`}>
      <CardHeader className="items-center">
        <IconComponent className={`h-16 w-16 mb-4 ${
          status === 'approved' ? 'text-green-500' :
          status === 'rejected' ? 'text-destructive' :
          status === 'pending_review' ? 'text-blue-500' :
          status === 'needs_update' ? 'text-yellow-500' : 'text-muted-foreground'
        }`} />
        <CardTitle className="text-2xl font-headline">{titleText}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-md text-muted-foreground">
          {descriptionText}
        </CardDescription>
        {message && (status === 'rejected' || status === 'needs_update') && (
          <div className="mt-4 p-3 bg-muted/50 border border-dashed rounded-md text-sm text-left">
            <p className="font-semibold mb-1">Admin Feedback:</p>
            <p className="whitespace-pre-wrap">{message}</p>
          </div>
        )}
        <div className="mt-8">
          {status === 'approved' && (
            <Link href="/provider"> 
              <Button size="lg">Go to Provider Panel</Button>
            </Link>
          )}
          {status !== 'approved' && (
            <Link href="/" className="hidden md:block">
              <Button variant="outline" size="lg" className="w-full">
                <Home className="mr-2 h-5 w-5" /> Back to Home
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
