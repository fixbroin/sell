"use client";

import Link from 'next/link';
import AppImage from '@/components/ui/AppImage';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowRight, Calendar, Clock } from 'lucide-react';
import type { FirestoreBlogPost, ClientBlogPost } from '@/types/firestore';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

interface BlogPostCardProps {
  post: FirestoreBlogPost | ClientBlogPost;
  priority?: boolean;
}

export default function BlogPostCard({ post, priority = false }: BlogPostCardProps) {
  const { showLoading } = useLoading();
  const router = useRouter();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showLoading();
    router.push(`/blog/${post.slug}`);
  };

  const excerpt = post.excerpt || post.content.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...';

  const getDisplayDate = (date: any): string => {
    const millis = getTimestampMillis(date);
    if (!millis) return '';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
  };

  return (
    <Link href={`/blog/${post.slug}`} onClick={handleNav} className="group block h-full">
      <Card className="h-full flex flex-col overflow-hidden border-none shadow-md hover:shadow-2xl transition-all duration-500 bg-card rounded-2xl group">
        <div className="relative w-full aspect-square overflow-hidden">
          <AppImage
            src={post.coverImageUrl}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="group-hover:scale-110 transition-transform duration-700"
            objectPosition="top"
            priority={priority}
            data-ai-hint={post.imageHint || "blog post cover"}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {post.categoryName && (
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg">
                {post.categoryName}
              </span>
            </div>
          )}
        </div>
        
        <CardHeader className="space-y-2 pb-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-primary" />
              {getDisplayDate(post.createdAt)}
            </span>
            {post.readingTime && (
              <span className="flex items-center gap-1 border-l pl-3">
                <Clock className="h-3 w-3 text-primary" />
                {post.readingTime}
              </span>
            )}
          </div>
          <CardTitle className="text-xl font-headline font-bold leading-tight group-hover:text-primary transition-colors duration-300 line-clamp-2">
            {post.title}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-grow">
          <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">
            {excerpt}
          </p>
        </CardContent>
        
        <CardFooter className="pt-0">
          <div className="flex items-center text-primary font-bold text-sm group-hover:gap-3 transition-all duration-300 gap-2">
            Read Article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
