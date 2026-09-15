import Link from 'next/link';
import { Lock } from 'lucide-react';

interface CheckoutLayoutProps {
  children: React.ReactNode;
}

export default function CheckoutLayout({ children }: CheckoutLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-secondary/30">
      <header className="bg-background shadow-sm">
        <div className="container mx-auto px-4 h-12 flex items-center justify-center">
          <div className="flex items-center text-sm text-muted-foreground">
            <Lock className="h-4 w-4 mr-2 text-accent" />
            <span>Secure Checkout</span>
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto px-2 py-8">
        {children}
      </main>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Yourbrand. All rights reserved.</p>
      </footer>
    </div>
  );
}
