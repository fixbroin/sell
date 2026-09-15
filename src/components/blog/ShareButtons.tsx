"use client";

import { Button } from '@/components/ui/button';
import { Share2, Facebook, Twitter, Linkedin, Link as LinkIcon, Check } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ShareButtonsProps {
  title: string;
  url: string;
}

export default function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnLinkedin = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "The article link has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <h3 className="text-lg font-headline font-bold flex items-center">
        <Share2 className="mr-2 h-5 w-5 text-primary" /> Share this article
      </h3>
      <div className="flex flex-wrap gap-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          onClick={shareOnFacebook}
        >
          <Facebook className="h-4 w-4" /> Facebook
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full flex items-center gap-2 hover:bg-sky-50 hover:text-sky-500 transition-colors"
          onClick={shareOnTwitter}
        >
          <Twitter className="h-4 w-4" /> Twitter
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full flex items-center gap-2 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          onClick={shareOnLinkedin}
        >
          <Linkedin className="h-4 w-4" /> LinkedIn
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full flex items-center gap-2 transition-colors"
          onClick={copyToClipboard}
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <LinkIcon className="h-4 w-4" />}
          {copied ? "Copied" : "Copy Link"}
        </Button>
      </div>
    </div>
  );
}
