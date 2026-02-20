'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const ZoneEditableMapInner = dynamic(
    () => import('./ZoneEditableMapInner'),
    {
        ssr: false,
        loading: () => <div className="h-full w-full bg-muted animate-pulse rounded-md flex items-center justify-center text-muted-foreground">Cargando Editor de Mapa...</div>
    }
);

interface ZoneEditableMapProps {
    initialGeojson?: any;
    onChange: (geojsonStr: string | null) => void;
    height?: string;
}

export function ZoneEditableMap({ initialGeojson, onChange, height = '400px' }: ZoneEditableMapProps) {
    // Memoize the initial geojson so changes from the parent don't force a re-render of inner components constantly
    const memoizedInitial = useMemo(() => initialGeojson, []);

    return (
        <div style={{ height, width: '100%', position: 'relative' }} className="rounded-md border overflow-hidden">
            <ZoneEditableMapInner initialGeojson={memoizedInitial} onChange={onChange} />
        </div>
    );
}
