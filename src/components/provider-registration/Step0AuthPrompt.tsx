
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';
import { useLoading } from '@/contexts/LoadingContext';

interface Step0AuthPromptProps {
  redirectUrl: string;
}

export default function Step0AuthPrompt({ redirectUrl }: Step0AuthPromptProps) {
  const { showLoading } = useLoading();

  return (
    <div className="text-center py-8">
      <h2 className="text-xl font-semibold mb-4">Join Our Network of Professionals</h2>
      <p className="text-muted-foreground mb-6">
        Please sign in or create an account to start your provider registration.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-4">
        <Link href={`/auth/login?redirect=${encodeURIComponent(redirectUrl)}`} passHref>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => showLoading()}>
            <LogIn className="mr-2 h-5 w-5" /> Sign In
          </Button>
        </Link>
        <Link href={`/auth/signup?redirect=${encodeURIComponent(redirectUrl)}`} passHref>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => showLoading()}>
            <UserPlus className="mr-2 h-5 w-5" /> Create Account
          </Button>
        </Link>
      </div>
    </div>
  );
}
