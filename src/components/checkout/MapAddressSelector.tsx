
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { AddressFormData } from '@/components/forms/AddressForm';
import { Loader2, LocateFixed, CheckCircle, XCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ServiceZone } from '@/types/firestore';
import { getHaversineDistance } from '@/lib/locationUtils'; // Import distance utility
import { useToast } from "@/hooks/use-toast"; // Import useToast

interface MapAddressSelectorProps {
  apiKey: string;
  onAddressSelect: (address: Partial<AddressFormData>) => void;
  onClose: () => void;
  initialCenter: { lat: number, lng: number } | null;
  serviceZones: ServiceZone[]; // New prop
  onManualSearchClick?: () => void; // Added for manual search
  onOutOfCoverage?: (address: Partial<AddressFormData>) => void;
}

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const DEFAULT_ZOOM = 10;
const DETAILED_ZOOM = 17;

const GOOGLE_MAPS_SCRIPT_ID = "yourbrand-google-maps-places-script";
const GOOGLE_MAPS_CALLBACK_NAME = `initYourbrandMapAddressSelectorCallback_${Math.random().toString(36).substring(2, 15)}`;


const MapAddressSelector: React.FC<MapAddressSelectorProps> = ({ apiKey, onAddressSelect, onClose, initialCenter, serviceZones, onManualSearchClick, onOutOfCoverage }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const autocompleteInstanceRef = useRef<google.maps.places.Autocomplete | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const serviceZoneCirclesRef = useRef<google.maps.Circle[]>([]); // Ref to hold circle instances
  
  const placeChangedListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const markerDragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const [selectedAddress, setSelectedAddress] = useState<Partial<AddressFormData> | null>(null);
  const [showPermissionDeniedDialog, setShowPermissionDeniedDialog] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null); // State for serviceability
  const [hasManuallySelected, setHasManuallySelected] = useState(false); // New state to track explicit user action
  const { toast } = useToast(); // Use the toast hook

  const checkServiceability = useCallback((lat: number, lng: number) => {
    if (serviceZones.length === 0) {
      setIsServiceable(false); // If no zones or providers are online, it is NOT serviceable.
      return;
    }
    const serviceable = serviceZones.some(zone => {
      const distance = getHaversineDistance(
        lat,
        lng,
        zone.center.latitude,
        zone.center.longitude
      );
      return distance <= zone.radiusKm;
    });
    setIsServiceable(serviceable);
  }, [serviceZones]);


  const loadGoogleMapsScript = useCallback(() => {
    if (window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder) {
      setIsScriptLoaded(true);
      setIsLoading(false);
      return;
    }

    if (document.getElementById(GOOGLE_MAPS_SCRIPT_ID)) {
      if (!(window as any)[GOOGLE_MAPS_CALLBACK_NAME]) {
        (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
          setIsScriptLoaded(true);
          setIsLoading(false);
        };
      }
      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder) {
         setIsScriptLoaded(true);
         setIsLoading(false);
      }
      return;
    }
    
    setIsLoading(true); 

    (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
      setIsScriptLoaded(true);
      setIsLoading(false);
    };

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID; 
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding&callback=${GOOGLE_MAPS_CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error("MapAddressSelector: Google Maps script failed to load.");
      setIsLoading(false); 
      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      if (existingScript) existingScript.remove();
      if ((window as any)[GOOGLE_MAPS_CALLBACK_NAME]) delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
    };

    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) {
      loadGoogleMapsScript();
    } else {
      console.warn("MapAddressSelector: Google Maps API Key is missing.");
      setIsLoading(false);
    }
    
    return () => {
        if (placeChangedListenerRef.current && autocompleteInstanceRef.current) {
            window.google?.maps?.event?.removeListener(placeChangedListenerRef.current);
        }
        if (mapClickListenerRef.current && mapInstanceRef.current) {
            window.google?.maps?.event?.removeListener(mapClickListenerRef.current);
        }
        if (markerDragEndListenerRef.current && markerRef.current) {
            window.google?.maps?.event?.removeListener(markerDragEndListenerRef.current);
        }
    };
  }, [apiKey, loadGoogleMapsScript]);

  const processAddressResult = useCallback((result: google.maps.places.PlaceResult | google.maps.GeocoderResult, latLng?: google.maps.LatLng | null, updateInput = true) => {
    setHasManuallySelected(true); // User made an explicit selection
    const addressComponents = result.address_components;
    if (!addressComponents) {
      console.warn("MapAddressSelector: No address components found for result.");
      return;
    }

    let streetNumber = "";
    let route = "";
    let sublocalityLevel1 = ""; 
    let sublocalityLevel2 = "";
    let locality = ""; 
    let administrativeAreaLevel1 = ""; 
    let postalCode = "";
    let premise = "";

    for (const component of addressComponents) {
      const types = component.types;
      if (types.includes("premise")) premise = component.long_name;
      if (types.includes("street_number")) streetNumber = component.long_name;
      if (types.includes("route")) route = component.long_name;
      if (types.includes("sublocality_level_2")) sublocalityLevel2 = component.long_name;
      if (types.includes("sublocality_level_1")) sublocalityLevel1 = component.long_name;
      if (types.includes("locality")) locality = component.long_name;
      if (types.includes("administrative_area_level_1")) administrativeAreaLevel1 = component.long_name;
      if (types.includes("postal_code")) postalCode = component.long_name;
    }
    
    let determinedAddressLine1 = "";
    const streetLevelInfo = [streetNumber, route].filter(Boolean).join(" ");
    const placeName = 'name' in result && result.name && result.name !== locality && result.name !== administrativeAreaLevel1 ? result.name : null;

    if (premise) {
      determinedAddressLine1 = [premise, streetLevelInfo].filter(Boolean).join(", ");
    } else if (placeName && streetLevelInfo && placeName !== streetLevelInfo) {
        determinedAddressLine1 = [placeName, streetLevelInfo].filter(Boolean).join(", ");
    } else if (placeName && !streetLevelInfo) {
        determinedAddressLine1 = placeName;
    } else if (streetLevelInfo) {
        determinedAddressLine1 = streetLevelInfo;
    }

    if (!determinedAddressLine1 && sublocalityLevel2) {
      determinedAddressLine1 = sublocalityLevel2;
    } else if (!determinedAddressLine1 && sublocalityLevel1) {
      determinedAddressLine1 = sublocalityLevel1;
    }
    
    let determinedAddressLine2 = "";
    if (sublocalityLevel1 && determinedAddressLine1 && !determinedAddressLine1.includes(sublocalityLevel1)) {
      determinedAddressLine2 = sublocalityLevel1;
    }
    else if (sublocalityLevel2 && determinedAddressLine1 && !determinedAddressLine1.includes(sublocalityLevel2) && sublocalityLevel1 === determinedAddressLine1) {
      determinedAddressLine2 = sublocalityLevel2;
    }
    else if (placeName && determinedAddressLine1 === placeName) {
      if (sublocalityLevel2) determinedAddressLine2 = sublocalityLevel2;
      else if (sublocalityLevel1) determinedAddressLine2 = sublocalityLevel1;
    }

    if (result.formatted_address && !determinedAddressLine1) {
        const parts = result.formatted_address.split(',');
        determinedAddressLine1 = parts[0]?.trim();
        if (parts.length > 1 && !determinedAddressLine2 && parts[1]?.trim() !== locality) {
            determinedAddressLine2 = parts[1]?.trim();
        }
    }

    const currentLatLng = latLng || result.geometry?.location;
    const finalAddress = {
      addressLine1: determinedAddressLine1 || "",
      addressLine2: determinedAddressLine2 || "",
      city: locality,
      state: administrativeAreaLevel1,
      pincode: postalCode,
      latitude: currentLatLng?.lat() || null,
      longitude: currentLatLng?.lng() || null,
    };
    setSelectedAddress(finalAddress);
    if(finalAddress.latitude && finalAddress.longitude) {
      checkServiceability(finalAddress.latitude, finalAddress.longitude);
    }
    
    if (updateInput && autocompleteInputRef.current && result.formatted_address) {
      autocompleteInputRef.current.value = result.formatted_address;
    }
  }, [checkServiceability]);

  const handleConfirmAndClose = () => {
    if (!hasManuallySelected) {
      toast({
        title: "Location Not Selected",
        description: "Please search for an address or click/drag the pin on the map to set your location.",
        variant: "destructive",
      });
      return;
    }
    if (isServiceable === false) {
      if (serviceZones.length === 0) {
        toast({
          title: "Providers Currently Unavailable",
          description: "All service providers are currently offline or fully busy. We will be back online soon! Please check back later.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Area Not Serviceable",
          description: "This address is outside our service area. Please select a different location.",
          variant: "destructive",
        });
      }
      if (selectedAddress && onOutOfCoverage) {
        onOutOfCoverage(selectedAddress);
      }
      return;
    }
    if (selectedAddress) {
      onAddressSelect(selectedAddress);
    }
    onClose();
  };

  const geocodePosition = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral, updateInput = true) => {
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          processAddressResult(results[0], position instanceof window.google.maps.LatLng ? position : new window.google.maps.LatLng(position), updateInput);
        } else {
          console.warn('MapAddressSelector: Geocode (from click/drag) was not successful: ' + status);
        }
      });
    }
  }, [processAddressResult]);

  const updateMarker = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral, map: google.maps.Map, shouldGeocode = false, updateInput = true) => {
    if (!window.google || !window.google.maps) return;

    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      markerRef.current = new window.google.maps.Marker({
        position: position,
        map: map,
        draggable: true,
      });

      if (markerDragEndListenerRef.current) {
          window.google.maps.event.removeListener(markerDragEndListenerRef.current);
      }
      markerDragEndListenerRef.current = markerRef.current.addListener('dragend', () => {
        if (markerRef.current) {
          const newPosition = markerRef.current.getPosition();
          if (newPosition) {
            geocodePosition(newPosition, true); 
          }
        }
      });
    }
    
    checkServiceability(
      typeof position.lat === 'function' ? position.lat() : position.lat, 
      typeof position.lng === 'function' ? position.lng() : position.lng
    );

    if (shouldGeocode) {
      geocodePosition(position, updateInput);
    }
  }, [geocodePosition, checkServiceability]);

  const handleLocateMe = useCallback(() => {
    const locateButton = document.getElementById('map-locate-me-button') as HTMLButtonElement | null;
    if (!locateButton) return;
  
    if (navigator.geolocation && mapInstanceRef.current) {
      locateButton.disabled = true;
      const currentMap = mapInstanceRef.current;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          currentMap.setCenter(pos);
          currentMap.setZoom(DETAILED_ZOOM);
          updateMarker(pos, currentMap, true, true);
          locateButton.disabled = false;
        },
        (error) => {
          setShowPermissionDeniedDialog(true);
          locateButton.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      alert("Geolocation is not supported or the map is not ready.");
    }
  }, [updateMarker]);

  const initMapAndControls = useCallback(() => {
    if (!isScriptLoaded || !mapRef.current || mapInstanceRef.current) return;
  
    const centerPosition = initialCenter || DEFAULT_CENTER;
    const zoomLevel = initialCenter ? DETAILED_ZOOM : DEFAULT_ZOOM;

    const map = new window.google.maps.Map(mapRef.current, {
      center: centerPosition,
      zoom: zoomLevel,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();
  
    serviceZoneCirclesRef.current.forEach(circle => circle.setMap(null));
    serviceZoneCirclesRef.current = [];

    serviceZones.forEach(zone => {
      const circle = new window.google.maps.Circle({
        strokeColor: "#45A0A2",
        strokeOpacity: 0.7,
        strokeWeight: 1,
        fillColor: "#45A0A2",
        fillOpacity: 0.15,
        map,
        center: { lat: zone.center.latitude, lng: zone.center.longitude },
        radius: zone.radiusKm * 1000,
      });
      serviceZoneCirclesRef.current.push(circle);
    });

    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng && mapInstanceRef.current) {
            updateMarker(e.latLng, mapInstanceRef.current, true, true);
        }
    });
  
    if (autocompleteInputRef.current) {
      const inputElement = autocompleteInputRef.current;
      const ac = new window.google.maps.places.Autocomplete(inputElement, { 
        componentRestrictions: { country: 'in' },
        fields: ["address_components", "geometry", "name", "formatted_address"]
      });
      autocompleteInstanceRef.current = ac;
      
      placeChangedListenerRef.current = ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(place.geometry.location);
          mapInstanceRef.current.setZoom(DETAILED_ZOOM);
          updateMarker(place.geometry.location, mapInstanceRef.current);
          processAddressResult(place, place.geometry.location, true);
        } else { if (autocompleteInputRef.current) autocompleteInputRef.current.value = ""; }
      });
    }

    const locateMeButtonContainer = document.createElement('div');
    locateMeButtonContainer.style.marginRight = '10px';
    locateMeButtonContainer.style.marginBottom = '22px'; 
    
    const locateMeButton = document.createElement('button');
    locateMeButton.id = 'map-locate-me-button';
    locateMeButton.type = 'button';
    locateMeButton.title = "Locate Me";
    const bodyStyles = getComputedStyle(document.body);
    const textColorForLocate = bodyStyles.color;
    const backgroundColorForLocate = bodyStyles.backgroundColor;
    const borderColorForLocate = bodyStyles.borderColor || 'rgba(0,0,0,0.1)';

    locateMeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColorForLocate}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
    
    Object.assign(locateMeButton.style, { backgroundColor: backgroundColorForLocate, border: `1px solid ${borderColorForLocate}`, borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,.3)', cursor: 'pointer', padding: '8px', textAlign: 'center', height: '38px', width: '38px' });

    locateMeButton.onclick = handleLocateMe;
    locateMeButtonContainer.appendChild(locateMeButton);
    
    map.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(locateMeButtonContainer);
    
    if (initialCenter) {
      updateMarker(centerPosition, map, true, false);
      setHasManuallySelected(true); // If initialCenter is provided, assume it's a valid starting point
    } else {
      updateMarker(centerPosition, map, false, false); 
    }

  }, [isScriptLoaded, initialCenter, handleLocateMe, updateMarker, processAddressResult, serviceZones]);
  
  useEffect(() => {
    initMapAndControls();
  }, [initMapAndControls]);

  // Sync service zones and re-check serviceability dynamically whenever serviceZones prop changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    // Clear old circles
    serviceZoneCirclesRef.current.forEach(circle => circle.setMap(null));
    serviceZoneCirclesRef.current = [];

    // Draw updated circles
    serviceZones.forEach(zone => {
      const circle = new window.google.maps.Circle({
        strokeColor: "#45A0A2",
        strokeOpacity: 0.7,
        strokeWeight: 1,
        fillColor: "#45A0A2",
        fillOpacity: 0.15,
        map: mapInstanceRef.current,
        center: { lat: zone.center.latitude, lng: zone.center.longitude },
        radius: zone.radiusKm * 1000,
      });
      serviceZoneCirclesRef.current.push(circle);
    });

    // Re-check serviceability with current marker position
    if (markerRef.current) {
      const currentPos = markerRef.current.getPosition();
      if (currentPos) {
        checkServiceability(currentPos.lat(), currentPos.lng());
      }
    } else if (initialCenter) {
      checkServiceability(initialCenter.lat, initialCenter.lng);
    } else {
      checkServiceability(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
    }
  }, [serviceZones, checkServiceability, initialCenter]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Loading map...</p>
      </div>
    );
  }
  
  if (!isScriptLoaded && !isLoading && apiKey) { 
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive text-center">Could not load Google Maps. Check API key or network. Reload to try again.</p>
      </div>
    );
  }

  if (!apiKey && !isLoading) {
     return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-center">Google Maps API key not configured. Set in admin settings.</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div className="p-2 sm:p-4 border-b bg-background z-10 space-y-2">
          <div className="relative">
             <Input
                id="address-search-input"
                ref={autocompleteInputRef}
                type="text"
                placeholder="Search for building, area, street, or address..."
                className="shadow-md h-9 pr-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
           </div>
        </div>
        <div className="relative w-full flex-grow" style={{ minHeight: '300px' }}>
          <div ref={mapRef} className="w-full h-full rounded-md" />
          {isServiceable !== null && (
            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 p-2 px-3 rounded-full text-sm font-medium shadow-lg transition-all ${
              isServiceable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isServiceable ? (
                <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4"/> Serviceable Area</span>
              ) : serviceZones.length === 0 ? (
                <span className="flex items-center gap-1.5"><XCircle className="h-4 w-4"/> Providers Currently Unavailable</span>
              ) : (
                <span className="flex items-center gap-1.5"><XCircle className="h-4 w-4"/> Not a Serviceable Area</span>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-background mt-auto flex flex-col sm:flex-row gap-2">
          <Button onClick={handleConfirmAndClose} className="w-full sm:flex-grow">
              Use Selected Address & Close
          </Button>
          {onManualSearchClick && (
            <Button onClick={onManualSearchClick} variant="outline" className="w-full sm:w-auto">
              Search Manually Address
            </Button>
          )}
        </div>
      </div>
      <AlertDialog open={showPermissionDeniedDialog} onOpenChange={setShowPermissionDeniedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center">
            <AlertDialogTitle className="text-2xl">Location Access Denied</AlertDialogTitle>
             <AlertDialogDescription className="text-red-600 font-semibold text-lg py-4">
               Please search for your address manually in the search bar or click/drag the pin on the map to set your location.
             </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction onClick={() => { setShowPermissionDeniedDialog(false); }}>Got it</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MapAddressSelector;
      



