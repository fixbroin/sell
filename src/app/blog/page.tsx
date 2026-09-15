import BlogPostCard from '@/components/blog/BlogPostCard';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import AppImage from '@/components/ui/AppImage';
import type { Metadata } from 'next';
import { getBaseUrl } from '@/lib/config';
import Link from 'next/link';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getPublishedPostsServer, getGlobalAppSettings } from '@/lib/webServerUtils';
import { formatDateInTimezone } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types/ui';

export const revalidate = false; // Persistent Cache

export async function generateMetadata(): Promise<Metadata> {
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  
  const title = `Expert Home Maintenance Tips & Guides | Blog${seoSettings.defaultMetaTitleSuffix || ' | Yourbrand'}`;
  const description = "Discover professional tips, DIY guides, and home maintenance advice from Yourbrand experts. Learn how to keep your home in top shape.";

  const rawOgImage = seoSettings.structuredDataImage || `/default-image.png`;
  const ogImage = rawOgImage.startsWith('http') ? rawOgImage : `${appBaseUrl}${rawOgImage.startsWith('/') ? '' : '/'}${rawOgImage}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${appBaseUrl}/blog`,
    },
    openGraph: {
      title,
      description,
      url: `${appBaseUrl}/blog`,
      siteName: seoSettings.siteName || 'Yourbrand',
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
  };
}

export default async function BlogListPage() {
  const posts = await getPublishedPostsServer();
  const appConfig = await getGlobalAppSettings();
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Blog' },
  ];

  const featuredPost = posts[0];
  const otherPosts = posts.slice(1);

  const appBaseUrl = getBaseUrl();
  const blogListingSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "Yourbrand Blog",
    "description": "Expert home maintenance tips, guides, and updates from Yourbrand.",
    "url": `${appBaseUrl}/blog`,
    "publisher": {
      "@type": "Organization",
      "name": "Yourbrand",
      "logo": {
        "@type": "ImageObject",
        "url": `${appBaseUrl}/android-chrome-512x512.png`
      }
    },
    "blogPost": posts.slice(0, 10).map(post => {
      const rawImage = post.coverImageUrl || `/default-image.png`;
      const absImage = rawImage.startsWith('http') ? rawImage : `${appBaseUrl}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`;
      return {
        "@type": "BlogPosting",
        "headline": post.title,
        "url": `${appBaseUrl}/blog/${post.slug}`,
        "datePublished": post.createdAt,
        "image": absImage,
        "author": {
          "@type": "Person",
          "name": post.authorName || "Yourbrand Expert"
        }
      };
    })
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <JsonLdScript data={blogListingSchema} idSuffix="blog-list" />
      {/* Header Section */}
      <div className="bg-primary/5 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="mt-8 text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-headline font-bold text-foreground mb-6">
              Our <span className="text-primary">Blog</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              Expert tips, home maintenance guides, and the latest updates from the Yourbrand team.
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-10">
        {posts.length > 0 ? (
          <div className="space-y-16">
            {/* Featured Post */}
            {featuredPost && (
              <Link href={`/blog/${featuredPost.slug}`} className="block group">
                <div className="relative bg-card rounded-3xl shadow-xl overflow-hidden border border-border/50 transition-all duration-500 hover:shadow-2xl">
                  <div className="grid grid-cols-1 lg:grid-cols-2">
                    <div className="relative aspect-square lg:aspect-auto h-full min-h-[400px] overflow-hidden">
                      <AppImage
                        src={featuredPost.coverImageUrl}
                        alt={featuredPost.title}
                        fill
                        className="group-hover:scale-105 transition-transform duration-700"
                        objectPosition="top"
                        priority
                      />
                      {featuredPost.categoryName && (
                        <div className="absolute top-6 left-6">
                          <span className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full uppercase tracking-widest shadow-lg">
                            Featured: {featuredPost.categoryName}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center space-y-6">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-primary" />
                          {formatDateInTimezone(new Date(featuredPost.createdAt), 'Asia/Kolkata', appConfig?.dateFormat)}
                        </span>
                        {featuredPost.readingTime && (
                          <span className="flex items-center gap-1.5 border-l pl-4">
                            <Clock className="h-4 w-4 text-primary" />
                            {featuredPost.readingTime}
                          </span>
                        )}
                      </div>
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-headline font-bold leading-tight group-hover:text-primary transition-colors">
                        {featuredPost.title}
                      </h2>
                      <p className="text-muted-foreground text-lg line-clamp-3 leading-relaxed">
                        {featuredPost.excerpt || featuredPost.content.replace(/<[^>]*>?/gm, '').substring(0, 160) + '...'}
                      </p>
                      <div className="pt-4">
                        <div className="inline-flex items-center gap-2 text-primary font-bold text-lg group-hover:gap-4 transition-all">
                          Read Full Article <ArrowRight className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Other Posts Grid */}
            {otherPosts.length > 0 && (
              <div className="space-y-10">
                <h3 className="text-3xl font-headline font-bold">Recent Articles</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                  {otherPosts.map((post, index) => (
                    <BlogPostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-24 bg-card rounded-3xl border border-dashed">
            <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="h-10 w-10 text-primary opacity-50" />
            </div>
            <h2 className="text-2xl font-headline font-bold mb-2">No posts found</h2>
            <p className="text-muted-foreground">We&apos;re working on some great content for you. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
