'use client';

import {
    MapContainer,
    TileLayer,
    Polygon,
    Popup
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // Ensure CSS is imported in layout or here if Next.js allows

export interface ZoneData {
    id: string;
    name: string;
    geojson: any; // GeoJSON Feature or Geometry
    color?: string;
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
        >
            <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {zones.map((zone) => {
                if (!zone.geojson || !zone.geojson.coordinates) return null;

                // GeoJSON Polygon [lng, lat] -> Leaflet [lat, lng]
                // Supporting simple Polygon (one ring)
                let positions: [number, number][] = [];
                try {
                    // Check if it's Feature or Geometry
                    const coords = zone.geojson.type === 'Feature'
                        ? zone.geojson.geometry.coordinates[0]
                        : zone.geojson.coordinates[0];

                    positions = coords.map((c: number[]) => [c[1], c[0]] as [number, number]);
                } catch (e) {
                    console.error("Invalid GeoJSON", zone.name);
                    return null;
                }

                return (
                    <Polygon key={zone.id} positions={positions} pathOptions={{ color: zone.color || 'blue' }}>
                        <Popup>{zone.name}</Popup>
                    </Polygon>
                );
            })}
        </MapContainer>
    );
}
