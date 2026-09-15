import { adminDb } from '@/lib/firebaseAdmin';
import { notFound } from 'next/navigation';
import type { FirestoreBlogPost, ClientBlogPost } from '@/types/firestore';
import AppImage from '@/components/ui/AppImage';
import { ArrowRight, Calendar, User, Clock } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getBaseUrl } from '@/lib/config';
import type { Metadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import ShareButtons from '@/components/blog/ShareButtons';
import BlogPostCard from '@/components/blog/BlogPostCard';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { formatDateInTimezone } from '@/lib/utils';

export const revalidate = false; // Persistent Cache

/**
 * Server-side helper to safely get milliseconds from various timestamp formats.
 * Important for Server Components handling both Admin SDK and serialized client-side data.
 */
function getTimestampMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'object') {
    if (ts.seconds !== undefined) return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
    if (ts._seconds !== undefined) return ts._seconds * 1000 + (ts._nanoseconds || 0) / 1000000;
    if (ts instanceof Date) return ts.getTime();
  }
  if (typeof ts === 'string') {
    const date = new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return typeof ts === 'number' ? ts : 0;
}

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

const getBlogPost = cache(async (slug: string): Promise<FirestoreBlogPost | null> => {
  return unstable_cache(
    async () => {
      try {
        const blogRef = adminDb.collection('blogPosts');
        const q = blogRef.where('slug', '==', slug).where('isPublished', '==', true).limit(1);
        const snapshot = await q.get();
        
        if (snapshot.empty) return null;
        
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as FirestoreBlogPost;
      } catch (error) {
        console.error('Error fetching blog post:', error);
        return null;
      }
    },
    [`blog-post-${slug}`],
    { revalidate: false, tags: ['blog', `blog-${slug}`, 'global-cache'] }
  )();
});

const getRelatedPosts = cache(async (currentSlug: string, categoryId?: string): Promise<ClientBlogPost[]> => {
  return unstable_cache(
    async () => {
      try {
        const blogPostsRef = adminDb.collection('blogPosts');
        let q = blogPostsRef.where('isPublished', '==', true);
        
        if (categoryId) {
          q = q.where('categoryId', '==', categoryId);
        }
        
        const snapshot = await q.limit(4).get();
        return snapshot.docs
          .map(doc => {
            const data = doc.data() as FirestoreBlogPost;
            return {
              ...data,
              id: doc.id,
              createdAt: (() => {
                const millis = getTimestampMillis(data.createdAt);
                return millis ? new Date(millis).toISOString() : new Date().toISOString();
              })(),
              updatedAt: (() => {
                const millis = getTimestampMillis(data.updatedAt);
                return millis ? new Date(millis).toISOString() : undefined;
              })(),
            } as ClientBlogPost;
          })
          .filter(post => post.slug !== currentSlug)
          .slice(0, 3);
      } catch (error) {
        console.error('Error fetching related posts:', error);
        return [];
      }
    },
    [`related-posts-${currentSlug}`],
    { revalidate: false, tags: ['blog', 'global-cache'] }
  )();
});

export async function generateMetadata(
  { params }: BlogPostPageProps
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  
  if (!post) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  const title = post.metaTitle || post.meta_title || `${post.title} | Yourbrand Blog`;
  const description = post.metaDescription || post.meta_description || post.excerpt || post.title || '';
  
  const rawOgImage = post.coverImageUrl || seoSettings.structuredDataImage || `/default-image.png`;
  const ogImage = rawOgImage.startsWith('http') ? rawOgImage : `${appBaseUrl}${rawOgImage.startsWith('/') ? '' : '/'}${rawOgImage}`;

  return {
    title: title,
    description: description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}/blog/${slug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/blog/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'article',
      publishedTime: (() => {
        const millis = getTimestampMillis(post.createdAt);
        return millis ? new Date(millis).toISOString() : undefined;
      })(),
      modifiedTime: (() => {
        const millis = getTimestampMillis(post.updatedAt);
        return millis ? new Date(millis).toISOString() : undefined;
      })(),
      authors: post.authorName ? [post.authorName] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  const appConfig = await getGlobalAppSettings();

  if (!post) {
    notFound();
  }

  const relatedPosts = await getRelatedPosts(slug, post.categoryId);
  const appBaseUrl = getBaseUrl();

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog" },
    { label: post.title },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: "Blog", url: `${appBaseUrl}/blog` },
    { name: post.title, url: `${appBaseUrl}/blog/${slug}` }
  ]);

  const getDisplayDate = (date: any): string => {
    const millis = getTimestampMillis(date);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata', appConfig?.dateFormat);
  };

  const getIsoDate = (date: any): string => {
    const millis = getTimestampMillis(date);
    if (!millis) return new Date().toISOString();
    return new Date(millis).toISOString();
  };

  const calculateReadingTime = (content: string) => {
    if (!content) return null;
    const words = content.replace(/<[^>]*>?/gm, '').trim().split(/\s+/).length;
    if (words < 10) return null;
    const minutes = Math.ceil(words / 225); // Average reading speed
    return `${minutes} min`;
  };

  const displayReadingTime = post.readingTime || calculateReadingTime(post.content);

  const rawSchemaImage = post.coverImageUrl || `/default-image.png`;
  const schemaImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt || post.metaDescription,
    "image": schemaImage,
    "datePublished": getIsoDate(post.createdAt),
    "dateModified": getIsoDate(post.updatedAt || post.createdAt),
    "author": {
      "@type": "Person",
      "name": post.authorName || "Yourbrand Expert"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Yourbrand",
      "logo": {
        "@type": "ImageObject",
        "url": `${appBaseUrl}/android-chrome-512x512.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${appBaseUrl}/blog/${slug}`
    }
  };

  return (
    <article className="min-h-screen bg-background pb-20">
      <JsonLdScript data={blogSchema} idSuffix={`blog-${post.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-blog-${post.id}`} />
      
      {/* Header with Background */}
      <div className="relative bg-primary/5 py-12 md:py-20 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full -ml-32 -mb-32 blur-3xl" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto">
            <Breadcrumbs items={breadcrumbItems} />
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center mt-8">
              {/* Cover Image on Desktop (Left Side) */}
              <div className="hidden md:block md:col-span-4">
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-muted">
                  <AppImage
                    src={post.coverImageUrl}
                    alt={post.title}
                    fill
                    objectPosition="top"
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              {/* Titles & Metadata (Right Side on Desktop, Centered on Mobile) */}
              <div className="col-span-1 md:col-span-8 text-center md:text-left">
                {post.categoryName && (
                  <span className="px-4 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-widest mb-4 md:mb-6 inline-block">
                    {post.categoryName}
                  </span>
                )}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-headline font-bold text-foreground leading-tight mb-6 md:mb-8">
                  {post.title}
                </h1>
                
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 text-muted-foreground font-medium text-sm md:text-base">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs md:text-sm">
                      {post.authorName?.charAt(0) || <User className="h-4 w-4 md:h-5 md:w-5" />}
                    </div>
                    <span>{post.authorName || 'Yourbrand Expert'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    <span>{getDisplayDate(post.createdAt)}</span>
                  </div>
                  {displayReadingTime && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      <span>{displayReadingTime} read</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-12 relative z-20">
        <div className="max-w-4xl mx-auto">
          {/* Main Content Card */}
          <div className="bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden mb-16">
            {/* Cover Image on Mobile (Hidden on Desktop) */}
            <div className="relative aspect-square w-full md:hidden">
              <AppImage
                src={post.coverImageUrl}
                alt={post.title}
                fill
                objectPosition="top"
                className="object-cover"
                priority
              />
            </div>
            
            <div className="p-8 md:p-12 lg:p-16">
              <div 
                className="prose prose-lg dark:prose-invert max-w-none 
                  prose-headings:font-headline prose-headings:font-bold prose-headings:text-foreground
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-strong:text-foreground prose-strong:font-bold
                  prose-ul:list-disc prose-li:marker:text-primary
                  prose-img:rounded-3xl prose-img:shadow-xl"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
              
              <div className="mt-16 pt-8 border-t border-border/50 flex flex-col gap-10">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/60">Related Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const tagsArray = Array.isArray(post.tags) 
                        ? post.tags 
                        : (typeof post.tags === 'string' ? post.tags.split(',') : []);
                      
                      return tagsArray.map(tag => (
                        <span key={tag} className="px-4 py-1.5 bg-muted text-muted-foreground text-xs font-bold rounded-full">
                          #{tag.trim()}
                        </span>
                      ));
                    })()}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/60">Share this Article</h4>
                  <ShareButtons 
                    title={post.title} 
                    url={`${getBaseUrl()}/blog/${post.slug}`} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Related Posts Section */}
          {relatedPosts.length > 0 && (
            <div className="space-y-10">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-headline font-bold">Related Articles</h2>
                <Link href="/blog" className="text-primary font-bold hover:underline flex items-center gap-2 group">
                  View All Blog <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {relatedPosts.map(rp => (
                  <BlogPostCard key={rp.id} post={rp} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
