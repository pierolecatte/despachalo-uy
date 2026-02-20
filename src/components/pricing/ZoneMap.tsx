'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

// Dynamic import with ssr: false is crucial for Leaflet
const ZoneMapInner = dynamic(
    () => import('./ZoneMapInner'),
    {
        ssr: false,
        loading: () => <div className="h-full w-full bg-muted animate-pulse rounded-md flex items-center justify-center text-muted-foreground">Cargando Mapa...</div>
    }
);

interface ZoneData {
    id: string;
    name: string;
    geojson: any;
    color?: string;
}

export function ZoneMap({ zones, height = '400px' }: { zones: ZoneData[], height?: string }) {
    // Memoize zones to prevent re-renders if parent re-renders
    const mapZones = useMemo(() => zones, [zones]);

    return (
        <div style={{ height, width: '100%', position: 'relative' }} className="rounded-md border overflow-hidden">
            <ZoneMapInner zones={mapZones} />
        </div>
    );
}
