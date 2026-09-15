
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ZoneMapSelectorProps {
  apiKey: string;
  center: { lat: number, lng: number };
  radiusKm: number;
  onCenterChange: (center: google.maps.LatLngLiteral) => void;
}

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const DEFAULT_ZOOM = 10;
const DETAILED_ZOOM = 14;

const GOOGLE_MAPS_SCRIPT_ID_ZONE = "yourbrand-google-maps-script-zone";

const ZoneMapSelector: React.FC<ZoneMapSelectorProps> = ({ apiKey, center, radiusKm, onCenterChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (window.google && window.google.maps) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID_ZONE);
    if (existingScript) {
      const handleLoad = () => setScriptLoaded(true);
      existingScript.addEventListener('load', handleLoad);
      if (window.google && window.google.maps) setScriptLoaded(true);
      return () => existingScript.removeEventListener('load', handleLoad);
    } else {
      const script = document.createElement('script');
      script.id = GOOGLE_MAPS_SCRIPT_ID_ZONE;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding`;
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => {
        console.error("ZoneMapSelector: Google Maps script failed to load.");
        setIsLoading(false);
      };
      document.head.appendChild(script);
    }
  }, [apiKey]);
  
  const updateMarkerAndCircle = useCallback(() => {
    if (!mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;
    
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: center,
        map: map,
        draggable: true,
      });
      markerRef.current.addListener('dragend', () => {
        const newPos = markerRef.current?.getPosition();
        if (newPos) onCenterChange({ lat: newPos.lat(), lng: newPos.lng() });
      });
    } else {
      markerRef.current.setPosition(center);
    }
    
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        strokeColor: "#45A0A2", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#45A0A2", fillOpacity: 0.25,
        map: map,
      });
    }
    circleRef.current.setCenter(center);
    circleRef.current.setRadius(radiusKm * 1000);
  }, [center, radiusKm, onCenterChange]);

  const handleLocateMe = useCallback(() => {
    const locateButton = document.getElementById('zone-locate-me-button') as HTMLButtonElement | null;
    if (!locateButton) return;

    if (navigator.geolocation && mapInstanceRef.current) {
      locateButton.disabled = true;
      const currentMap = mapInstanceRef.current;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          currentMap.setCenter(pos);
          currentMap.setZoom(DETAILED_ZOOM);
          onCenterChange(pos);
          locateButton.disabled = false;
        },
        () => {
          alert('Your location is not enabled. Please enable GPS/location permissions and try again.');
          locateButton.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      alert("Geolocation is not supported or the map is not ready.");
    }
  }, [onCenterChange]);

  useEffect(() => {
    if (scriptLoaded && mapRef.current && !mapInstanceRef.current) {
      const map = new window.google.maps.Map(mapRef.current, {
        center: center || DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
      });
      mapInstanceRef.current = map;
      
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) onCenterChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });

      if (autocompleteInputRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
          componentRestrictions: { country: 'in' },
          fields: ["geometry", "name", "formatted_address"]
        });
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry && place.geometry.location && mapInstanceRef.current) {
            const location = place.geometry.location;
            mapInstanceRef.current.setCenter(location);
            mapInstanceRef.current.setZoom(DETAILED_ZOOM);
            onCenterChange({ lat: location.lat(), lng: location.lng() });
          }
        });
      }

      const locateMeButtonContainer = document.createElement('div');
      locateMeButtonContainer.style.marginRight = '10px';
      locateMeButtonContainer.style.marginBottom = '22px';
      const locateMeButton = document.createElement('button');
      locateMeButton.id = 'zone-locate-me-button';
      locateMeButton.type = 'button'; // Prevent form submission
      locateMeButton.title = "Locate Me";
      const textColorForLocate = getComputedStyle(document.body).color;
      const backgroundColorForLocate = getComputedStyle(document.body).backgroundColor;
      locateMeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColorForLocate}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
      Object.assign(locateMeButton.style, { backgroundColor: backgroundColorForLocate, border: `1px solid rgba(0,0,0,0.1)`, borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,.3)', cursor: 'pointer', padding: '8px', textAlign: 'center', height: '38px', width: '38px' });
      locateMeButton.onclick = handleLocateMe;
      locateMeButtonContainer.appendChild(locateMeButton);
      map.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(locateMeButtonContainer);

      setIsLoading(false);
    }
  }, [scriptLoaded, center, onCenterChange, handleLocateMe]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      updateMarkerAndCircle();
    }
  }, [center, radiusKm, updateMarkerAndCircle]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-sm">
        <Input 
          ref={autocompleteInputRef} 
          placeholder="Search for building, place, or address..." 
          className="shadow-md h-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}
        />
      </div>
      {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}
      <div ref={mapRef} className="w-full h-full rounded-md" />
    </div>
  );
};

export default ZoneMapSelector;
