"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, MapPin } from 'lucide-react';

interface Area {
  id: string;
  name: string;
  slug: string;
  latitude?: number | string;
  longitude?: number | string;
}

interface LeafletMapDialogProps {
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  onConfirm: (closestArea: Area) => void;
}

export default function LeafletMapDialog({ isOpen, onClose, areas, onConfirm }: LeafletMapDialogProps) {
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({ lat: 12.9716, lng: 77.5946 }); // Default Bangalore Center

  // Autocomplete Suggestions State
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close suggestions list on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowSuggestions(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Load Leaflet from CDN
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadLeaflet = async () => {
      // Check if Leaflet is already loaded
      if ((window as any).L) {
        if (isMounted) setIsMapLoaded(true);
        return;
      }

      // Inject Leaflet CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // Inject Leaflet JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) setIsMapLoaded(true);
      };
      document.head.appendChild(script);
    };

    loadLeaflet();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Initialize Map
  useEffect(() => {
    if (!isMapLoaded || !isOpen || !mapContainer) return;

    const L = (window as any).L;
    if (!L) return;

    // Destroy existing map instance if it exists
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch (err) {
        console.error("Error removing old map instance:", err);
      }
      mapRef.current = null;
    }

    // Reset container DOM node to clear Leaflet properties
    if (mapContainer) {
      (mapContainer as any)._leaflet_id = null;
      mapContainer.innerHTML = '';
    }

    let map: any = null;
    try {
      // Create Map
      map = L.map(mapContainer).setView([currentCoords.lat, currentCoords.lng], 13);
      mapRef.current = map;
    } catch (err) {
      console.error("Failed to initialize Leaflet map:", err);
      return;
    }

    // Add OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Custom Icon (to avoid default Leaflet icon path issues in Next.js)
    const customIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // Add Draggable Marker
    const marker = L.marker([currentCoords.lat, currentCoords.lng], {
      draggable: true,
      icon: customIcon
    }).addTo(map);
    markerRef.current = marker;

    // Handle marker drag
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      setCurrentCoords({ lat: position.lat, lng: position.lng });
    });

    // Handle map click to place marker
    map.on('click', (e: any) => {
      marker.setLatLng(e.latlng);
      setCurrentCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Invalidate size to fix Leaflet rendering issues in dialogs
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (err) {
          console.error("Error removing map on cleanup:", err);
        }
        mapRef.current = null;
      }
    };
  }, [isMapLoaded, isOpen, mapContainer]);

  // Search Address using Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ', Bangalore')}`);
      const data = await res.json();

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);

        setCurrentCoords({ lat: newLat, lng: newLng });

        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([newLat, newLng], 15);
          markerRef.current.setLatLng([newLat, newLng]);
        }
      } else {
        alert("Location not found. Please try searching for a different area.");
      }
    } catch (error) {
      console.error("Nominatim Search Error:", error);
      alert("Error searching for location. Please try manually placing the pin.");
    } finally {
      setIsSearching(false);
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (val: string) => {
    setSearchQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(val + ', Bangalore')}&limit=5`);
        const data = await res.json();
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error("Autocomplete fetch error:", err);
      }
    }, 500);
  };

  const handleSuggestionClick = (sug: any) => {
    const newLat = parseFloat(sug.lat);
    const newLng = parseFloat(sug.lon);
    
    setSearchQuery(sug.display_name);
    setCurrentCoords({ lat: newLat, lng: newLng });
    setSuggestions([]);
    setShowSuggestions(false);

    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([newLat, newLng], 15);
      markerRef.current.setLatLng([newLat, newLng]);
    }
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleConfirm = () => {
    if (areas.length === 0) return;

    let closestArea = areas[0];
    let minDistance = Infinity;

    for (const area of areas) {
      const areaLat = parseFloat(String(area.latitude || 0));
      const areaLng = parseFloat(String(area.longitude || 0));
      if (!areaLat || !areaLng) continue;

      const dist = getDistance(currentCoords.lat, currentCoords.lng, areaLat, areaLng);
      if (dist < minDistance) {
        minDistance = dist;
        closestArea = area;
      }
    }

    onConfirm(closestArea);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[550px] p-6 gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="text-primary h-6 w-6" /> Select Your Location
          </DialogTitle>
          <DialogDescription>
            Search for your neighborhood, click on the map, or drag the pin to your location.
          </DialogDescription>
        </DialogHeader>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input 
              placeholder="Type your area or building name..." 
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              disabled={isSearching || !isMapLoaded}
              className="flex-1"
            />
            <Button type="submit" disabled={isSearching || !isMapLoaded}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-popover border rounded-xl shadow-lg z-[9999] max-h-[200px] overflow-y-auto">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(sug)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted text-sm border-b last:border-b-0 flex items-start gap-2 text-foreground"
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{sug.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative border rounded-2xl overflow-hidden bg-slate-50">
          {!isMapLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading interactive map...</span>
            </div>
          )}
          <div ref={setMapContainer} className="h-[300px] w-full" />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isMapLoaded}>
            Confirm Location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
