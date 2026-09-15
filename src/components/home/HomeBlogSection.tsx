
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { FileText, Loader2, ArrowRight } from "lucide-react";
import type { FirestoreBlogPost } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from '@/lib/mysqlDb';
import BlogPostCard from '@/components/blog/BlogPostCard';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import * as React from "react";
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { getCache, setCache } from '@/lib/client-cache';

export default function HomeBlogSection() {
  const [posts, setPosts] = useState<FirestoreBlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { showLoading } = useLoading();
  const plugin = React.useRef(Autoplay({ 
    delay: 4000, 
    stopOnInteraction: false, // Changed to false to allow auto-resume
    stopOnMouseEnter: false, 
    stopOnLastSnap: false,
  }));

  useEffect(() => {
    const cachedPosts = getCache<FirestoreBlogPost[]>('home_blog_posts', true);
    if (cachedPosts && cachedPosts.length > 0) {
      setPosts(cachedPosts);
      setIsLoading(false);
    }

    const fetchAllPosts = async () => {
      if (!cachedPosts || cachedPosts.length === 0) {
        setIsLoading(true);
      }
      try {
        const postsRef = collection(db, "blogPosts");
        const q = query(postsRef, where("isPublished", "==", true), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreBlogPost));
        setPosts(fetched);
        setCache('home_blog_posts', fetched, true);
      } catch (error) {
        console.error("Error fetching blog posts:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllPosts();
  }, []);

  const handleNav = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/blog');
  };

  if (isLoading) {
    return (
      <section className="py-8 md:py-10 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
            <FileText className="mr-2 h-6 w-6 text-primary" /> Our Blog
          </h2>
           <div className="flex w-full space-x-4 p-1 pb-3 overflow-hidden">
                {[...Array(4)].map((_, i) => (
                <Card key={i} className="w-[250px] sm:w-[280px] flex-shrink-0 snap-start basis-1/2 md:basis-1/3 lg:basis-1/4">
                    <Skeleton className="h-32 sm:h-36 w-full" />
                    <CardContent className="p-2 sm:p-3">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2 mt-1" />
                    </CardContent>
                </Card>
                ))}
            </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="py-8 md:py-10 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-foreground flex items-center">
            <FileText className="mr-2 h-6 w-6 text-primary" /> Our Blog
          </h2>
          <Link href="/blog" passHref>
            <Button variant="outline" onClick={handleNav}>
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        
        <Carousel
          opts={{
              align: "start",
              loop: true,
          }}
          plugins={[plugin.current]}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {posts.map((post, index) => (
              <CarouselItem key={post.id} className="pl-2 md:pl-4 basis-4/5 sm:basis-2/3 md:basis-1/2 lg:basis-1/3">
                  <div className="h-full flex">
                      <BlogPostCard post={post} priority={index < 3} />
                  </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex" />
          <CarouselNext className="hidden md:flex" />
        </Carousel>
      </div>
    </section>
  );
}
