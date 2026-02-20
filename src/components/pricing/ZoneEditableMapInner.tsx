'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L from 'leaflet';

interface GeomanProps {
    initialGeojson?: any;
    onChange: (geojsonStr: string | null) => void;
}

function extractGeometryForBackend(featureGroup: L.FeatureGroup) {
    const geojson = featureGroup.toGeoJSON() as any;

    // If it's empty
    if (!geojson.features || geojson.features.length === 0) return null;

    // We want to combine all drawn shapes into a single MultiPolygon (or GeometryCollection)
    // because PostGIS ST_GeomFromGeoJSON expects a Geometry, not a FeatureCollection.
    const coords: any[] = [];

    geojson.features.forEach((f: any) => {
        if (!f.geometry) return;
        if (f.geometry.type === 'Polygon') {
            coords.push(f.geometry.coordinates);
        } else if (f.geometry.type === 'MultiPolygon') {
            coords.push(...f.geometry.coordinates);
        }
    });

    if (coords.length === 0) return null;

    return {
        type: 'MultiPolygon',
        coordinates: coords
    };
}

function GeomanControl({ initialGeojson, onChange }: GeomanProps) {
    const map = useMap();
    const fgRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
    const isInit = useRef(false);

    // Maintain a fresh reference to onChange to avoid dependency cycle in useEffect
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (isInit.current) return;

        // Import geoman only on client side to avoid SSR issues
        import('@geoman-io/leaflet-geoman-free').then(() => {
            isInit.current = true;

            const fg = fgRef.current;
            fg.addTo(map);

            map.pm.addControls({
                position: 'topleft',
                drawMarker: false,
                drawCircleMarker: false,
                drawPolyline: false,
                drawRectangle: false,
                drawCircle: false,
                drawText: false,
                editMode: true,
                dragMode: true,
                cutPolygon: false,
                removalMode: true,
                drawPolygon: true,
            });

            map.pm.setPathOptions({
                color: 'rgb(249, 115, 22)', // Tailwind orange-500
                fillColor: 'rgb(249, 115, 22)',
                fillOpacity: 0.3,
                weight: 3
            });

            const updateGeoJSON = () => {
                const geometry = extractGeometryForBackend(fg);
                if (!geometry) {
                    onChangeRef.current(null);
                } else {
                    onChangeRef.current(JSON.stringify(geometry));
                }
            };

            // Load initial geojson if any
            if (initialGeojson) {
                try {
                    const layer = L.geoJSON(initialGeojson);
                    layer.eachLayer((l) => {
                        fg.addLayer(l);
                        l.on('pm:edit', updateGeoJSON);
                    });

                    if (fg.getLayers().length > 0) {
                        map.fitBounds(fg.getBounds(), { padding: [30, 30] });
                    }
                } catch (e) {
                    console.error("Failed to load initial geojson for editing", e);
                }
            }

            // Global map events for Geoman
            map.on('pm:create', (e) => {
                fg.addLayer(e.layer);
                e.layer.on('pm:edit', updateGeoJSON);

                // Allow editing vertexes of the newly created shape
                updateGeoJSON();
            });

            map.on('pm:remove', (e) => {
                fg.removeLayer(e.layer);
                updateGeoJSON();
            });

            // Listen to layer drag events
            map.on('pm:globaldragmodeenabled', () => {
                fg.getLayers().forEach(layer => {
                    layer.on('pm:dragend', updateGeoJSON);
                    layer.on('pm:centerplaced', updateGeoJSON);
                });
            });

            return () => {
                map.pm.removeControls();
                map.off('pm:create');
                map.off('pm:remove');
                map.off('pm:globaldragmodeenabled');
                fg.clearLayers();
                fg.removeFrom(map);
            };
        }).catch(err => console.error("Failed to load geoman", err));
    }, [map, initialGeojson]);

    return null;
}

export default function ZoneEditableMapInner({ initialGeojson, onChange }: GeomanProps) {
    return (
        <MapContainer
            center={[-34.9011, -56.1645]}
            zoom={12}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', minHeight: '400px' }}
            className="z-0 relative"
        >
            <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <GeomanControl initialGeojson={initialGeojson} onChange={onChange} />
        </MapContainer>
    );
}
