"use client";

import Link from 'next/link';
import AppImage from '@/components/ui/AppImage';
import { useLoading } from '@/contexts/LoadingContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: "normal" | "large";
  logoUrl?: string | null;
  websiteName?: string | null;
  href?: string;
}

const Logo = ({ className = "", size = "normal", logoUrl, websiteName, href }: LogoProps) => {
  const textSizeClass = size === "large" ? "text-4xl" : "text-2xl";
  const iconSize = size === "large" ? "h-8 w-8" : "h-6 w-6";
  const finalWebsiteName = websiteName || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Yourbrand";
  const linkTarget = href || "/";
  const { showLoading } = useLoading();
  const currentPathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkTarget !== currentPathname && !linkTarget.startsWith('#')) {
        showLoading();
    }
  };

  const displayLogoUrl = logoUrl || "/android-chrome-512x512.png";

  return (
    <Link
      href={linkTarget}
      onClick={handleClick}
      className={cn("flex items-center gap-2 text-primary hover:text-primary/90 transition-colors", className)}
    >
      <div 
        className={cn("relative mr-1", iconSize)} 
        style={{ minWidth: size === "large" ? '32px' : '24px' }}
      >
        <AppImage
          src={displayLogoUrl}
          alt={`${finalWebsiteName} Logo`}
          fill
          sizes={size === "large" ? "32px" : "24px"}
          className="object-contain"
        />
      </div>
      <span className={cn("font-headline font-bold", textSizeClass, "group-data-[collapsible=icon]:hidden")}>
        {finalWebsiteName}
      </span>
    </Link>
  );
};

export default Logo;
