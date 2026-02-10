'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'

// Leaflet CSS needs to be imported globally or in the component
import 'leaflet/dist/leaflet.css'

interface AddressMapPickerProps {
    initialLat?: number | null
    initialLng?: number | null
    initialAddress?: string
    onLocationSelect: (lat: number, lng: number, address?: string) => void
}

interface SearchResult {
    display_name: string
    lat: string
    lon: string
}

// Dynamic import wrapper for Leaflet (SSR-safe)
function MapContainer({ lat, lng, onMapClick, markerRef }: {
    lat: number
    lng: number
    onMapClick: (lat: number, lng: number) => void
    markerRef: React.MutableRefObject<unknown>
}) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<unknown>(null)

    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined' || !mapContainerRef.current) return

        let L: typeof import('leaflet')
        let map: import('leaflet').Map
        let marker: import('leaflet').Marker | null = null

        async function initMap() {
            L = await import('leaflet')

            // Fix default marker icon issue with webpack/next.js
            const DefaultIcon = L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41],
            })

            if (!mapContainerRef.current) return
            if (mapRef.current) return // Already initialized

            map = L.map(mapContainerRef.current).setView([lat, lng], 13)
            mapRef.current = map

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(map)

            // Place initial marker if coordinates are valid (not default center)
            if (lat !== -34.9 || lng !== -56.2) {
                marker = L.marker([lat, lng], { icon: DefaultIcon }).addTo(map)
                markerRef.current = marker
            }

            // Handle click on map
            map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
                const { lat: clickLat, lng: clickLng } = e.latlng

                if (marker) {
                    marker.setLatLng([clickLat, clickLng])
                } else {
                    marker = L.marker([clickLat, clickLng], { icon: DefaultIcon }).addTo(map)
                    markerRef.current = marker
                }

                onMapClick(clickLat, clickLng)
            })
        }

        initMap()

        return () => {
            if (mapRef.current) {
                (mapRef.current as import('leaflet').Map).remove()
                mapRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Update marker position when lat/lng change from search
    useEffect(() => {
        if (!mapRef.current || typeof window === 'undefined') return

        async function updateMarker() {
            const L = await import('leaflet')
            const map = mapRef.current as import('leaflet').Map
            const DefaultIcon = L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41],
            })

            map.setView([lat, lng], 15)

            if (markerRef.current) {
                (markerRef.current as import('leaflet').Marker).setLatLng([lat, lng])
            } else {
                const newMarker = L.marker([lat, lng], { icon: DefaultIcon }).addTo(map)
                markerRef.current = newMarker
            }
        }

        if (lat !== -34.9 || lng !== -56.2) {
            updateMarker()
        }
    }, [lat, lng, markerRef])

    return (
        <div
            ref={mapContainerRef}
            className="w-full h-[250px] rounded-lg border border-zinc-700 overflow-hidden z-0"
        />
    )
}

export default function AddressMapPicker({
    initialLat,
    initialLng,
    initialAddress,
    onLocationSelect,
}: AddressMapPickerProps) {
    const [searchQuery, setSearchQuery] = useState(initialAddress || '')
    const [results, setResults] = useState<SearchResult[]>([])
    const [searching, setSearching] = useState(false)
    const [showResults, setShowResults] = useState(false)
    const [lat, setLat] = useState(initialLat || -34.9)
    const [lng, setLng] = useState(initialLng || -56.2)
    const [hasPin, setHasPin] = useState(!!(initialLat && initialLng))
    const markerRef = useRef<unknown>(null)
    const searchTimeout = useRef<NodeJS.Timeout | null>(null)

    // Debounced search with Nominatim
    const searchAddress = useCallback(async (query: string) => {
        if (query.length < 3) {
            setResults([])
            return
        }

        setSearching(true)
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Uruguay')}&format=json&limit=5&countrycodes=uy`,
                { headers: { 'Accept-Language': 'es' } }
            )
            const data = await res.json()
            setResults(data)
            setShowResults(data.length > 0)
        } catch {
            setResults([])
        }
        setSearching(false)
    }, [])

    function handleSearchInput(value: string) {
        setSearchQuery(value)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        searchTimeout.current = setTimeout(() => searchAddress(value), 400)
    }

    function selectResult(result: SearchResult) {
        const newLat = parseFloat(result.lat)
        const newLng = parseFloat(result.lon)
        setLat(newLat)
        setLng(newLng)
        setHasPin(true)
        setSearchQuery(result.display_name)
        setShowResults(false)
        onLocationSelect(newLat, newLng, result.display_name)
    }

    function handleMapClick(clickLat: number, clickLng: number) {
        setLat(clickLat)
        setLng(clickLng)
        setHasPin(true)
        onLocationSelect(clickLat, clickLng)
    }

    return (
        <div className="space-y-2">
            {/* Address Search */}
            <div className="relative">
                <div className="relative">
                    <Input
                        value={searchQuery}
                        onChange={e => handleSearchInput(e.target.value)}
                        placeholder="🔍 Buscar dirección en el mapa..."
                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 pr-10"
                    />
                    {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* Search Results Dropdown */}
                {showResults && results.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {results.map((r, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectResult(r)}
                                className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors border-b border-zinc-700/50 last:border-0"
                            >
                                📍 {r.display_name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Map */}
            <MapContainer
                lat={lat}
                lng={lng}
                onMapClick={handleMapClick}
                markerRef={markerRef}
            />

            {/* Coordinates display */}
            {hasPin && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>📌 {lat.toFixed(6)}, {lng.toFixed(6)}</span>
                    <button
                        type="button"
                        onClick={() => {
                            setHasPin(false)
                            setLat(-34.9)
                            setLng(-56.2)
                            onLocationSelect(0, 0)
                        }}
                        className="text-red-400 hover:text-red-300"
                    >
                        ✕ Quitar pin
                    </button>
                </div>
            )}

            <p className="text-xs text-zinc-600">
                Buscá la dirección o hacé click en el mapa para pinchar la ubicación
            </p>
        </div>
    )
}
