"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { AddressFormData } from '@/components/forms/AddressForm';
import { Loader2, Search, Sliders } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface ProviderMapZoneSelectorProps {
  apiKey: string;
  onConfirm: (data: {
    center: { lat: number; lng: number };
    radiusKm: number;
    address: string;
  }) => void;
  onClose: () => void;
  initialCenter: { lat: number; lng: number } | null;
  initialRadiusKm?: number;
  maxRadiusKm?: number;
}

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const DEFAULT_ZOOM = 10;
const DETAILED_ZOOM = 17;

const GOOGLE_MAPS_SCRIPT_ID = "fixbro-google-maps-places-script";
const GOOGLE_MAPS_CALLBACK_NAME = `initFixbroProviderMapSelectorCallback_${Math.random().toString(36).substring(2, 15)}`;

const PRESET_RADII = [3, 5, 10, 15, 20, 25];

const ProviderMapZoneSelector: React.FC<ProviderMapZoneSelectorProps> = ({
  apiKey,
  onConfirm,
  onClose,
  initialCenter,
  initialRadiusKm = 5,
  maxRadiusKm = 50,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);

  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const autocompleteInstanceRef = useRef<google.maps.places.Autocomplete | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const placeChangedListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const markerDragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const [selectedAddress, setSelectedAddress] = useState<Partial<AddressFormData> | null>(null);
  const [showPermissionDeniedDialog, setShowPermissionDeniedDialog] = useState(false);
  const [hasManuallySelected, setHasManuallySelected] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(Math.min(initialRadiusKm || 5, maxRadiusKm));

  const { toast } = useToast();

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
      console.error("ProviderMapZoneSelector: Google Maps script failed to load.");
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
      console.warn("ProviderMapZoneSelector: Google Maps API Key is missing.");
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

  const processAddressResult = useCallback(
    (result: google.maps.places.PlaceResult | google.maps.GeocoderResult, latLng?: google.maps.LatLng | null, updateInput = true) => {
      setHasManuallySelected(true);
      const addressComponents = result.address_components;
      if (!addressComponents) {
        console.warn("ProviderMapZoneSelector: No address components found for result.");
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
      } else if (sublocalityLevel2 && determinedAddressLine1 && !determinedAddressLine1.includes(sublocalityLevel2) && sublocalityLevel1 === determinedAddressLine1) {
        determinedAddressLine2 = sublocalityLevel2;
      } else if (placeName && determinedAddressLine1 === placeName) {
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

      if (updateInput && autocompleteInputRef.current && result.formatted_address) {
        autocompleteInputRef.current.value = result.formatted_address;
      }
    },
    []
  );

  const geocodePosition = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral, updateInput = true) => {
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          processAddressResult(results[0], position instanceof window.google.maps.LatLng ? position : new window.google.maps.LatLng(position), updateInput);
        } else {
          console.warn('ProviderMapZoneSelector: Geocode was not successful: ' + status);
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
            updateMarker(newPosition, map, true, true);
          }
        }
      });
    }

    // Work Coverage Radius Circle
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        strokeColor: "#45A0A2",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#45A0A2",
        fillOpacity: 0.20,
        map: map,
        center: position,
        radius: radiusKm * 1000,
      });
    } else {
      circleRef.current.setCenter(position);
      circleRef.current.setRadius(radiusKm * 1000);
    }

    if (shouldGeocode) {
      geocodePosition(position, updateInput);
    }
  }, [geocodePosition, radiusKm]);

  // Dynamic radius update for circle
  const handleRadiusChange = (newRadius: number) => {
    const clamped = Math.max(1, Math.min(newRadius, maxRadiusKm));
    setRadiusKm(clamped);
    if (circleRef.current) {
      circleRef.current.setRadius(clamped * 1000);
    }
  };

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
        () => {
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

    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng && mapInstanceRef.current) {
        updateMarker(e.latLng, mapInstanceRef.current, true, true);
      }
    });

    if (autocompleteInputRef.current) {
      const inputElement = autocompleteInputRef.current;
      const ac = new window.google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: 'in' },
        fields: ["address_components", "geometry", "name", "formatted_address"],
      });
      autocompleteInstanceRef.current = ac;

      placeChangedListenerRef.current = ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(place.geometry.location);
          mapInstanceRef.current.setZoom(DETAILED_ZOOM);
          updateMarker(place.geometry.location, mapInstanceRef.current);
          processAddressResult(place, place.geometry.location, true);
        } else {
          if (autocompleteInputRef.current) autocompleteInputRef.current.value = "";
        }
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

    Object.assign(locateMeButton.style, {
      backgroundColor: backgroundColorForLocate,
      border: `1px solid ${borderColorForLocate}`,
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,.3)',
      cursor: 'pointer',
      padding: '8px',
      textAlign: 'center',
      height: '38px',
      width: '38px',
    });

    locateMeButton.onclick = handleLocateMe;
    locateMeButtonContainer.appendChild(locateMeButton);

    map.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(locateMeButtonContainer);

    if (initialCenter) {
      updateMarker(centerPosition, map, true, false);
      setHasManuallySelected(true);
    } else {
      updateMarker(centerPosition, map, false, false);
    }
  }, [isScriptLoaded, initialCenter, handleLocateMe, updateMarker, processAddressResult]);

  useEffect(() => {
    initMapAndControls();
  }, [initMapAndControls]);

  // Handle confirmation
  const handleConfirmAndClose = () => {
    if (!hasManuallySelected || !selectedAddress?.latitude || !selectedAddress?.longitude) {
      toast({
        title: "Location Not Selected",
        description: "Please search for an address or click/drag the pin on the map to set your location.",
        variant: "destructive",
      });
      return;
    }

    const formattedAddress = [
      selectedAddress.addressLine1,
      selectedAddress.addressLine2,
      selectedAddress.city,
      selectedAddress.state,
      selectedAddress.pincode
    ].filter(Boolean).join(", ") || autocompleteInputRef.current?.value || `${selectedAddress.latitude.toFixed(5)}, ${selectedAddress.longitude.toFixed(5)}`;

    onConfirm({
      center: { lat: selectedAddress.latitude, lng: selectedAddress.longitude },
      radiusKm,
      address: formattedAddress,
    });
    onClose();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-sm text-muted-foreground">Loading Map...</p>
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
        {/* Top Search bar & Radius Control */}
        <div className="p-2 sm:p-4 border-b bg-background z-10 space-y-2.5">
          <div className="relative">
            <Input
              id="address-search-input"
              ref={autocompleteInputRef}
              type="text"
              placeholder="Search for building, area, street, or address..."
              className="shadow-md h-9 pr-10 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          </div>

          {/* Service Radius Slider & Presets */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t text-xs">
            <div className="flex items-center gap-2 flex-grow max-w-sm">
              <Sliders className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium text-muted-foreground whitespace-nowrap">Service Radius:</span>
              <Slider
                value={[radiusKm]}
                min={1}
                max={maxRadiusKm}
                step={1}
                onValueChange={(val) => handleRadiusChange(val[0])}
                className="cursor-pointer"
              />
              <span className="font-bold text-primary whitespace-nowrap min-w-[45px] text-right">{radiusKm} km</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-0.5">Presets:</span>
              {PRESET_RADII.filter(r => r <= maxRadiusKm).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRadiusChange(r)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    radiusKm === r
                      ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm'
                      : 'bg-muted/50 hover:bg-muted border-border text-foreground'
                  }`}
                >
                  {r}km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map Canvas */}
        <div className="relative w-full flex-grow" style={{ minHeight: '300px' }}>
          <div ref={mapRef} className="w-full h-full rounded-md" />
        </div>

        {/* Footer Actions matching MapAddressSelector */}
        <div className="p-4 border-t bg-background mt-auto flex flex-col sm:flex-row gap-2">
          <Button onClick={handleConfirmAndClose} className="w-full sm:flex-grow">
            Use Selected Address & Close
          </Button>
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

export default ProviderMapZoneSelector;
