"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, Navigation, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import LeafletMapDialog from './LeafletMapDialog';

interface Area {
  id: string;
  name: string;
  slug: string;
  latitude?: number | string;
  longitude?: number | string;
}

interface NearMeLocationDetectorProps {
  categorySlug: string;
  searchTerm: string;
  cityName: string;
  citySlug: string;
  areas: Area[];
}

function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function NearMeLocationDetector({ 
  categorySlug, 
  searchTerm,
  cityName,
  citySlug,
  areas 
}: NearMeLocationDetectorProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedArea, setDetectedArea] = useState<Area | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const router = useRouter();

  const detectLocation = () => {
    setIsDetecting(true);
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setIsDetecting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        setTimeout(() => {
          let closestArea: Area | null = null;
          let minDistance = Infinity;

          for (const area of areas) {
            const areaLat = parseFloat(String(area.latitude || 0));
            const areaLng = parseFloat(String(area.longitude || 0));
            if (!areaLat || !areaLng) continue;

            const dist = getHaversineDistance(userLat, userLng, areaLat, areaLng);
            if (dist < minDistance) {
              minDistance = dist;
              closestArea = area;
            }
          }

          // Fallback if coordinates are not set
          if (!closestArea && areas.length > 0) {
            closestArea = areas[0];
          }

          if (closestArea) {
            setDetectedArea(closestArea);
          }
          setIsDetecting(false);
        }, 1200);
      },
      (error) => {
        console.warn("Geolocation denied or failed. Opening manual map selection...", error);
        setIsMapOpen(true);
        setIsDetecting(false);
      },
      { timeout: 10000 }
    );
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-3xl p-3 md:p-10 text-center">
      <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
        <Navigation className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl md:text-3xl font-headline font-bold mb-4">
        Detecting {searchTerm} Near You
      </h2>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">
        Allow location access to find the fastest available {searchTerm.toLowerCase()} in your specific neighborhood of {cityName}.
      </p>

      {!detectedArea ? (
        <Button 
          size="lg" 
          onClick={detectLocation} 
          disabled={isDetecting}
          className="h-12 px-8 rounded-full shadow-lg"
        >
          {isDetecting ? (
            <> <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Detecting Area...</>
          ) : (
            <> <MapPin className="mr-2 h-5 w-5" /> Find Near Me Now</>
          )}
        </Button>
      ) : (
        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full font-bold text-sm">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
             Detected Locality: {detectedArea.name}
          </div>
          <br />
          <Button 
            size="lg" 
            variant="default"
            onClick={() => router.push(`/${citySlug}/${detectedArea.slug}/${categorySlug}`)}
            className="h-14 px-10 rounded-full text-lg font-bold shadow-xl hover:scale-105 transition-transform"
          >
            View {searchTerm} in {detectedArea.name} <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="mt-10">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4 text-xs">Or select your area manually</p>
        <div className="flex flex-wrap justify-center gap-2">
            {areas.slice(0, 12).map(area => (
                <Button 
                    key={area.id} 
                    variant="outline" 
                    size="sm"
                    className="rounded-full bg-background"
                    onClick={() => router.push(`/${citySlug}/${area.slug}/${categorySlug}`)}
                >
                    {area.name}
                </Button>
            ))}
        </div>
      </div>
      <LeafletMapDialog
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        areas={areas}
        onConfirm={(closest) => {
          setIsMapOpen(false);
          setDetectedArea(closest);
          router.push(`/${citySlug}/${closest.slug}/${categorySlug}`);
        }}
      />
    </div>
  );
}
