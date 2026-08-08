import React, { useMemo, useRef, useState } from 'react';
import { APIProvider, Map, Marker, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { LocateFixed, MapPin, Minus, Plus, Search } from 'lucide-react';
import { api } from '../../api';

type ResolvedAddress = {
  formattedAddress?: string;
  state?: string;
  district?: string;
  city?: string;
  pincode?: string;
};

interface GoogleMapPickerProps {
  lat?: number | string;
  lng?: number | string;
  label?: string;
  helperText?: string;
  className?: string;
  onChange: (coords: { lat: number; lng: number }) => void;
  onResolvedAddress?: (address: ResolvedAddress) => void;
}

const DEFAULT_CENTER = { lat: 12.9715987, lng: 77.5945627 };
const TILE_SIZE = 256;
const MAP_PIN_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="38" height="50" viewBox="0 0 38 50" fill="none" xmlns="http://www.w3.org/2000/svg">
  <filter id="shadow" x="-6" y="-4" width="50" height="62" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.25"/>
  </filter>
  <g filter="url(#shadow)">
    <path d="M19 47C19 47 34 30.8 34 18.9C34 10.1 27.28 3 19 3C10.72 3 4 10.1 4 18.9C4 30.8 19 47 19 47Z" fill="#dc2626"/>
    <path d="M19 47C19 47 34 30.8 34 18.9C34 10.1 27.28 3 19 3C10.72 3 4 10.1 4 18.9C4 30.8 19 47 19 47Z" stroke="white" stroke-width="2"/>
    <circle cx="19" cy="19" r="6.5" fill="white"/>
  </g>
</svg>
`)}`;

function toFiniteNumber(value: number | string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function latLngToWorld(lat: number, lng: number, zoom: number) {
  const sinLat = Math.sin((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function worldToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: clamp(lat, -85.05112878, 85.05112878), lng: clamp(lng, -180, 180) };
}

function tileUrl(x: number, y: number, zoom: number) {
  const max = 2 ** zoom;
  const wrappedX = ((x % max) + max) % max;
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
}

function PinMarker() {
  return (
    <span className="relative block h-[50px] w-[38px]">
      <span className="absolute inset-0 block drop-shadow-[0_4px_8px_rgba(15,23,42,0.3)]">
        <span className="absolute left-1/2 top-0 h-8 w-8 -translate-x-1/2 rounded-full border-2 border-white bg-red-600" />
        <span className="absolute left-1/2 top-[22px] h-6 w-6 -translate-x-1/2 rotate-45 rounded-br-[20px] border-b-2 border-r-2 border-white bg-red-600" />
        <span className="absolute left-1/2 top-[9px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white" />
      </span>
    </span>
  );
}

export default function GoogleMapPicker({
  lat,
  lng,
  label = 'Pin exact location',
  helperText = 'Click on the map or drag the marker to the exact entrance/location.',
  className = '',
  onChange,
  onResolvedAddress
}: GoogleMapPickerProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || '';
  const parsedLat = toFiniteNumber(lat);
  const parsedLng = toFiniteNumber(lng);
  const position = parsedLat !== null && parsedLng !== null ? { lat: parsedLat, lng: parsedLng } : null;
  const [status, setStatus] = useState('');
  const [osmCenter, setOsmCenter] = useState(position || DEFAULT_CENTER);
  const [osmZoom, setOsmZoom] = useState(15);
  const [draggingMarker, setDraggingMarker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const center = useMemo(() => position || DEFAULT_CENTER, [position?.lat, position?.lng]);
  const activeOsmCenter = position || osmCenter;

  const updatePin = async (coords: { lat: number; lng: number }, shouldReverse = true) => {
    const rounded = {
      lat: Number(coords.lat.toFixed(7)),
      lng: Number(coords.lng.toFixed(7))
    };
    onChange(rounded);
    setOsmCenter(rounded);
    if (!shouldReverse || !onResolvedAddress) return;
    try {
      setStatus('Reading pinned address...');
      const resolved = await api.reverseGeocode(rounded.lat, rounded.lng);
      onResolvedAddress(resolved);
      setStatus(resolved.formattedAddress || 'Pinned address detected.');
    } catch (err: any) {
      setStatus(apiKey ? (err.message || 'Pinned. Address lookup failed.') : 'Pinned. Address lookup needs Google key later; coordinates are saved now.');
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Location access is not supported in this browser.');
      return;
    }
    setStatus('Getting current GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => updatePin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setStatus('Location permission denied. Click on the map or enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const handleSearch = async () => {
    const query = searchText.trim();
    if (query.length < 3) {
      setStatus('Type at least 3 characters to search an address or area.');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const result = await api.geocode(query);
      const results = Array.isArray(result.results) && result.results.length ? result.results : [result];
      setSearchResults(results.slice(0, 5));
      const first = results[0];
      if (first && Number.isFinite(Number(first.lat)) && Number.isFinite(Number(first.lng))) {
        const coords = { lat: Number(first.lat), lng: Number(first.lng) };
        onResolvedAddress?.(first);
        setStatus(first.formattedAddress || 'Search result pinned.');
        updatePin(coords, false);
      }
    } catch (err: any) {
      setStatus(err.message || 'Address search failed. Try area, landmark, city, and pincode.');
    } finally {
      setSearching(false);
    }
  };

  const handleMapClick = (event: MapMouseEvent) => {
    if (!event.detail.latLng) return;
    updatePin(event.detail.latLng);
  };

  const handleMarkerDragEnd = (event: google.maps.MapMouseEvent) => {
    const next = event.latLng?.toJSON();
    if (next) updatePin(next);
  };

  const osmPointToLatLng = (clientX: number, clientY: number) => {
    const el = mapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const centerWorld = latLngToWorld(activeOsmCenter.lat, activeOsmCenter.lng, osmZoom);
    const worldX = centerWorld.x + (clientX - rect.left - rect.width / 2);
    const worldY = centerWorld.y + (clientY - rect.top - rect.height / 2);
    return worldToLatLng(worldX, worldY, osmZoom);
  };

  const osmTiles = useMemo(() => {
    const width = 900;
    const height = 360;
    const centerWorld = latLngToWorld(activeOsmCenter.lat, activeOsmCenter.lng, osmZoom);
    const startX = Math.floor((centerWorld.x - width / 2) / TILE_SIZE);
    const endX = Math.floor((centerWorld.x + width / 2) / TILE_SIZE);
    const startY = Math.floor((centerWorld.y - height / 2) / TILE_SIZE);
    const endY = Math.floor((centerWorld.y + height / 2) / TILE_SIZE);
    const maxTile = 2 ** osmZoom;
    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        tiles.push({
          key: `${osmZoom}-${x}-${y}`,
          url: tileUrl(x, y, osmZoom),
          left: x * TILE_SIZE - centerWorld.x + width / 2,
          top: y * TILE_SIZE - centerWorld.y + height / 2
        });
      }
    }
    return tiles;
  }, [activeOsmCenter.lat, activeOsmCenter.lng, osmZoom]);

  const markerOffset = useMemo(() => {
    if (!position) return null;
    const centerWorld = latLngToWorld(activeOsmCenter.lat, activeOsmCenter.lng, osmZoom);
    const markerWorld = latLngToWorld(position.lat, position.lng, osmZoom);
    return {
      left: markerWorld.x - centerWorld.x + 450,
      top: markerWorld.y - centerWorld.y + 180
    };
  }, [activeOsmCenter.lat, activeOsmCenter.lng, position?.lat, position?.lng, osmZoom]);

  const renderHeader = (provider: 'google' | 'osm') => (
    <div className="space-y-3 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{label}</p>
          <p className="text-[10px] font-semibold text-slate-500">
            {provider === 'osm' ? `${helperText} Free OpenStreetMap search mode is active.` : helperText}
          </p>
        </div>
        <button
          type="button"
          onClick={useCurrentLocation}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold uppercase text-white hover:bg-indigo-500"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          Use GPS
        </button>
      </div>
      <div className="relative">
        <div className="flex gap-2">
          <input
            id={`${provider}_map_location_search`}
            name={`${provider}_map_location_search`}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearch();
              }
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Search area, landmark, road, city, pincode..."
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-semibold uppercase text-white disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            <Search className="h-3.5 w-3.5" />
            {searching ? 'Searching' : 'Search'}
          </button>
        </div>
        {searchResults.length > 1 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
            {searchResults.map((result, index) => (
              <button
                key={`${result.lat}_${result.lng}_${index}`}
                type="button"
                onClick={() => {
                  setSearchResults([]);
                  setSearchText(result.formattedAddress || searchText);
                  onResolvedAddress?.(result);
                  setStatus(result.formattedAddress || 'Search result pinned.');
                  updatePin({ lat: Number(result.lat), lng: Number(result.lng) }, false);
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {result.formattedAddress || `${result.lat}, ${result.lng}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (apiKey) {
    return (
      <div className={`overflow-hidden rounded-xl border border-indigo-100 bg-white dark:border-indigo-900 dark:bg-slate-950 ${className}`}>
        {renderHeader('google')}
        <div className="h-64 w-full sm:h-72">
          <APIProvider apiKey={apiKey}>
            <Map
              defaultZoom={15}
              center={center}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl
              onClick={handleMapClick}
            >
              {position && (
                <Marker
                  position={position}
                  draggable
                  icon={MAP_PIN_SVG}
                  onDragEnd={handleMarkerDragEnd}
                />
              )}
            </Map>
          </APIProvider>
        </div>
        <div className="flex items-start gap-2 border-t border-slate-100 p-3 text-[10px] font-semibold text-slate-500 dark:border-slate-800">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span>{status || (position ? `Pinned at ${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}` : 'No location pinned yet.')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-indigo-100 bg-white dark:border-indigo-900 dark:bg-slate-950 ${className}`}>
      {renderHeader('osm')}
      <div
        ref={mapRef}
        className="relative h-64 w-full cursor-crosshair overflow-hidden bg-gradient-to-br from-emerald-50 via-slate-100 to-sky-50 touch-none sm:h-72"
        onClick={(event) => {
          if (draggingMarker) return;
          const next = osmPointToLatLng(event.clientX, event.clientY);
          if (next) updatePin(next, false);
        }}
      >
        <div className="absolute left-1/2 top-1/2 h-[360px] w-[900px] -translate-x-1/2 -translate-y-1/2">
          {osmTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              className="absolute h-64 w-64 select-none saturate-[0.88] contrast-[1.04] brightness-[1.02]"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_56%,rgba(15,23,42,0.12)_100%)]" />
        {markerOffset && (
          <button
            type="button"
            className="absolute z-10 -translate-x-1/2 -translate-y-full cursor-grab touch-none active:cursor-grabbing"
            style={{
              left: `calc(50% + ${markerOffset.left - 450}px)`,
              top: `calc(50% + ${markerOffset.top - 180}px)`
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDraggingMarker(true);
            }}
            onPointerMove={(event) => {
              if (!draggingMarker) return;
              const next = osmPointToLatLng(event.clientX, event.clientY);
              if (next) updatePin(next, false);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              setDraggingMarker(false);
            }}
            title="Drag pin"
          >
            <PinMarker />
          </button>
        )}
        <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button type="button" onClick={() => setOsmZoom((prev) => clamp(prev + 1, 3, 18))} className="p-2 text-slate-700 hover:bg-slate-100"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setOsmZoom((prev) => clamp(prev - 1, 3, 18))} className="border-t border-slate-200 p-2 text-slate-700 hover:bg-slate-100"><Minus className="h-4 w-4" /></button>
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[9px] font-semibold text-slate-600">
          © OpenStreetMap contributors
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-slate-100 p-3 text-[10px] font-semibold text-slate-500 dark:border-slate-800">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
        <span>{status || (position ? `Pinned at ${position.lat.toFixed(7)}, ${position.lng.toFixed(7)}. Free OSM mode stores coordinates; Google can be added later for address lookup.` : 'No location pinned yet. Click the map or use GPS.')}</span>
      </div>
    </div>
  );
}
