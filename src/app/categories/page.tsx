import { adminDb } from '@/lib/firebaseAdmin';
import CategoryCard from "@/components/home/CategoryCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { FirestoreCategory } from '@/types/firestore';
import { unstable_cache } from 'next/cache';
import { serializeFirestoreData } from '@/lib/serializeUtils';
import type { Metadata } from 'next';
import { getBaseUrl } from '@/lib/config';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const appBaseUrl = getBaseUrl();
  return {
    title: 'Top-Rated Home Service Categories in Bangalore',
    description: 'Explore all professional home service categories in Bangalore. Find expert carpenters, plumbers, electricians, painters, and appliance technicians near you.',
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}/categories`,
    },
    openGraph: {
      title: 'Top-Rated Home Service Categories in Bangalore',
      description: 'Explore all professional home service categories in Bangalore. Find expert carpenters, plumbers, electricians, painters, and appliance technicians near you.',
      url: '/categories',
      images: [{ url: `${appBaseUrl}/android-chrome-512x512.png`, width: 512, height: 512, alt: 'Yourbrand Categories' }],
      type: 'website',
    },
  };
}

const getCategories = unstable_cache(
  async () => {
    try {
      const categoriesCollectionRef = adminDb.collection("adminCategories");
      const snapshot = await categoriesCollectionRef.where("isActive", "==", true).orderBy("order", "asc").get();
      return snapshot.docs.map((doc) => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreCategory));
    } catch (err) {
      console.error("Error fetching categories: ", err);
      return [];
    }
  },
  ['admin-categories-list'],
  { revalidate: 86400, tags: ['categories', 'global-cache'] }
);


export default async function AllCategoriesPage() {
  const categories = await getCategories();
  const appBaseUrl = getBaseUrl();
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: "Categories", url: `${appBaseUrl}/categories` }
  ]);

  return (
    <>
      <JsonLdScript data={breadcrumbSchema} idSuffix="categories-breadcrumbs" />
      <div className="container mx-auto px-4 py-12 min-h-screen">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-foreground mb-4">
              Service Categories
            </h1>
            <p className="text-lg text-muted-foreground">
              Find the perfect professional for your home needs from our specialized service categories.
            </p>
          </div>
          <Link href="/" passHref>
            <Button variant="outline" className="rounded-full px-6 hidden md:flex">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border">
            <PackageSearch className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-2xl font-headline font-bold mb-2 text-foreground/80">No Categories Found</h2>
            <p className="text-muted-foreground">We are currently updating our services. Please check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
