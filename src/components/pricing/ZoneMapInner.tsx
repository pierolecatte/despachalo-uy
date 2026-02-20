'use client';

import {
    MapContainer,
    TileLayer,
    GeoJSON,
    useMap
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

export interface ZoneData {
    id: string;
    name: string;
    geojson: any; // GeoJSON Feature or Geometry
    color?: string;
}

function FitBounds({ zones }: { zones: ZoneData[] }) {
    const map = useMap();

    useEffect(() => {
        if (!zones || zones.length === 0) return;
        try {
            const group = new L.FeatureGroup();
            let hasValidLayers = false;

            zones.forEach(zone => {
                if (zone.geojson) {
                    const layer = L.geoJSON(zone.geojson);
                    layer.addTo(group);
                    hasValidLayers = true;
                }
            });

            if (hasValidLayers) {
                map.fitBounds(group.getBounds(), { padding: [20, 20] });
            }
        } catch (e) {
            console.error("Error fitting bounds:", e);
        }
    }, [map, zones]);

    return null;
}

export default function ZoneMapInner({
    zones,
    center = [-34.9011, -56.1645],
    zoom = 12
}: {
    zones: ZoneData[],
    center?: [number, number],
    zoom?: number
}) {
    return (
        <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', minHeight: '400px' }}
            className="z-0 relative" // FIX: Ensure Leaflet is behind Radix UI modals
        >
            <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds zones={zones} />

            {zones.map((zone) => {
                if (!zone.geojson) return null;

                return (
                    <GeoJSON
                        key={zone.id}
                        data={zone.geojson}
                        style={{
                            color: zone.color || 'blue',
                            weight: 2,
                            opacity: 0.8,
                            fillOpacity: 0.2
                        }}
                        onEachFeature={(feature, layer) => {
                            layer.bindTooltip(zone.name, {
                                permanent: false,
                                direction: 'center',
                                className: 'font-semibold'
                            });
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}
