"use client"; 

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/shared/Logo';
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Phone, MapPin, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings'; 
import { Skeleton } from '@/components/ui/skeleton'; 
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit as firestoreLimit, addDoc, Timestamp, where, limit } from '@/lib/mysqlDb';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext'; 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { triggerPushNotification } from '@/lib/fcmUtils';
import type { FirestoreNotification } from '@/types/firestore';
import LocalSiloLinks from './LocalSiloLinks';

interface FooterServiceLink {
  name: string;
  slug: string;
}

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading(); 
  const router = useRouter();
  const currentPathname = usePathname();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const intendedHref = href;
    if (intendedHref !== currentPathname && !intendedHref.startsWith('#')) {
      showLoading();
    }
    
    const isProtectedContent = intendedHref.startsWith('/category/') || intendedHref.startsWith('/service/');
    if (isProtectedContent && !user) {
      triggerAuthRedirect(intendedHref);
    } else {
      router.push(intendedHref);
    }
  };

  return (
    <Link 
      href={href} 
      onClick={handleNav} 
      className="inline-block px-3 py-1.5 rounded-lg bg-background border border-border/50 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 whitespace-nowrap text-[13px] font-medium shadow-sm hover:shadow-md"
    >
      {children}
    </Link>
  );
};

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [isMounted, setIsMounted] = useState(false);
  const { settings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [serviceLinks, setServiceLinks] = useState<FooterServiceLink[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { toast } = useToast();

  const websiteName = settings?.websiteName || "Yourbrand";
  const contactEmail = settings?.contactEmail || "support@yourdomain.com"; 
  const socialLinks = settings?.socialMediaLinks;

  useEffect(() => {
    setIsMounted(true);

    const fetchFooterCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const categoriesCollectionRef = collection(db, "adminCategories");
        const q = query(categoriesCollectionRef, orderBy("order", "asc"), firestoreLimit(6));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({
          name: doc.data().name as string,
          slug: doc.data().slug as string,
        }));
        setServiceLinks(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories for footer: ", err);
        setServiceLinks([]); 
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchFooterCategories();
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscribeEmail || !/^\S+@\S+\.\S+$/.test(subscribeEmail)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    setIsSubscribing(true);
    try {
      const docRef = await addDoc(collection(db, "popupSubmissions"), {
        popupName: "Footer Newsletter",
        popupType: "subscribe",
        email: subscribeEmail,
        submittedAt: Timestamp.now(),
        status: "new",
        source: "subscribe_popup",
      });

      // --- ADMIN NOTIFICATION FOR NEWSLETTER ---
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminId = adminSnapshot.docs[0].id;
          const adminNotification: Omit<FirestoreNotification, 'id'> = {
            userId: adminId,
            title: "New Newsletter Subscriber",
            message: `Email: ${subscribeEmail} (from Footer)`,
            type: "info",
            href: `/admin/inquiries`,
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), adminNotification);
          triggerPushNotification({
            userId: adminId,
            title: adminNotification.title,
            body: adminNotification.message,
            href: adminNotification.href
          }).catch(err => console.error("Error sending admin newsletter push:", err));
        }
      } catch (notifyErr) {
        console.error("Error sending admin newsletter notifications:", notifyErr);
      }
      // --- END ADMIN NOTIFICATION ---

      toast({ 
        title: "Subscribed!", 
        description: "Thank you for joining our newsletter.",
        className: "bg-green-100 border-green-300 text-green-700" 
      });
      setSubscribeEmail('');
    } catch (error) {
      console.error("Error subscribing:", error);
      toast({ title: "Error", description: "Could not process your subscription.", variant: "destructive" });
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!isMounted || isLoadingGlobalSettings || isLoadingCategories) {
    return (
      <footer className="hidden md:block bg-muted/30 border-t">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="space-y-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-6 w-24" />
                <div className="space-y-2">
                  {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-4 w-full" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="hidden md:block bg-muted/30 border-t text-foreground">
      <LocalSiloLinks />
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-4 space-y-6">
            <Logo logoUrl={settings?.logoUrl} websiteName={websiteName} />
            <p className="text-muted-foreground leading-relaxed max-w-sm text-sm">
              {settings.homepageContent?.footerCompanyBio || "Your trusted partner for professional home services. We bring skilled experts directly to your doorstep, ensuring quality, reliability, and peace of mind."}
            </p>
            <div className="flex items-center gap-4">
              {socialLinks?.facebook && (
                <Link href={socialLinks.facebook} target="_blank" className="p-2 bg-background rounded-full border hover:text-primary hover:border-primary transition-all shadow-sm">
                  <Facebook size={18} />
                </Link>
              )}
              {socialLinks?.twitter && (
                <Link href={socialLinks.twitter} target="_blank" className="p-2 bg-background rounded-full border hover:text-primary hover:border-primary transition-all shadow-sm">
                  <Twitter size={18} />
                </Link>
              )}
              {socialLinks?.instagram && (
                <Link href={socialLinks.instagram} target="_blank" className="p-2 bg-background rounded-full border hover:text-primary hover:border-primary transition-all shadow-sm">
                  <Instagram size={18} />
                </Link>
              )}
              {socialLinks?.linkedin && (
                <Link href={socialLinks.linkedin} target="_blank" className="p-2 bg-background rounded-full border hover:text-primary hover:border-primary transition-all shadow-sm">
                  <Linkedin size={18} />
                </Link>
              )}
              {socialLinks?.youtube && (
                <Link href={socialLinks.youtube} target="_blank" className="p-2 bg-background rounded-full border hover:text-primary hover:border-primary transition-all shadow-sm">
                  <Youtube size={18} />
                </Link>
              )}
            </div>
          </div>

          {/* Quick Links Columns */}
          <div className="lg:col-span-2">
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-6">Services</h3>
            <div className="flex flex-wrap gap-2">
              {serviceLinks.map(link => (
                <FooterLink key={link.slug} href={`/category/${link.slug}`}>{link.name}</FooterLink>
              ))}
              <FooterLink href="/categories">Explore All</FooterLink>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-6">Company</h3>
            <div className="flex flex-wrap gap-2">
              <FooterLink href="/about-us">About Us</FooterLink>
              <FooterLink href="/contact-us">Contact Us</FooterLink>
              <FooterLink href="/careers">Careers</FooterLink>
              <FooterLink href="/blog">Our Blog</FooterLink>
              <FooterLink href="/faq">FAQ</FooterLink>
              <FooterLink href="/near-me">Near Me Services</FooterLink>
              <FooterLink href="/sitemap">Sitemap</FooterLink>
              <FooterLink href="/service-disclaimer">Service Disclaimer</FooterLink>
            </div>
          </div>

          {/* Newsletter Column */}
          <div className="lg:col-span-4">
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-6">Stay Updated</h3>
            <p className="text-sm text-muted-foreground mb-4">Subscribe to get updates on offers and new services.</p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input 
                type="email"
                placeholder="Enter email" 
                className="bg-background border-border h-10" 
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                disabled={isSubscribing}
              />
              <Button size="icon" className="shrink-0" disabled={isSubscribing} type="submit">
                {isSubscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight size={18} />}
              </Button>
            </form>
            <div className="mt-8 space-y-3 text-sm">
              <p className="flex items-center text-muted-foreground">
                <Mail size={16} className="mr-3 text-primary" />
                <a href={`mailto:${contactEmail}`} className="hover:text-primary transition-colors">{contactEmail}</a>
              </p>
              {/* Address and Mobile Section */}
            <div className="space-y-3 pt-2">
              {settings?.contactMobile && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Phone size={18} className="mr-3 text-primary shrink-0" />
                  <a href={`tel:${settings.contactMobile}`} className="hover:text-primary transition-colors font-medium">
                    {settings.contactMobile}
                  </a>
                </div>
              )}
              {settings?.address && (
                <div className="flex items-start text-sm text-muted-foreground">
                  <MapPin size={18} className="mr-3 mt-0.5 text-primary shrink-0" />
                  <p className="leading-snug">{settings.address}</p>
                </div>
              )}
              
            </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
          <p className="text-center md:text-left">&copy; {currentYear} {websiteName}. All rights reserved.</p>
          <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
            <FooterLink href="/privacy-policy">Privacy Policy</FooterLink>
            <FooterLink href="/terms-and-conditions">Terms and Conditions</FooterLink>
            <FooterLink href="/cancellation-policy">Cancellation Policy</FooterLink>
            <FooterLink href="/damage-and-claims-policy">Damage & Claims Policy</FooterLink>
            
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
