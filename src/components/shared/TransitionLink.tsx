"use client";

import React from 'react';
import Link, { LinkProps } from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { usePathname } from 'next/navigation';

interface TransitionLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export default function TransitionLink({ children, href, onClick, ...props }: TransitionLinkProps) {
  const { showLoading } = useLoading();
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const intendedHref = href.toString();
    if (intendedHref !== pathname && !intendedHref.startsWith('#') && !intendedHref.startsWith('mailto:') && !intendedHref.startsWith('tel:')) {
      showLoading();
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
