'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PackageQrData {
    index: number
    qr_token: string
}

interface ShipmentPackageQrProps {
    packages: PackageQrData[]
    trackingCode: string
}

export default function ShipmentPackageQr({ packages, trackingCode }: ShipmentPackageQrProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<string>('0') // Index in the sorted array

    // 1. Stable ordering by package index
    const sortedPackages = [...packages].sort((a, b) => a.index - b.index)

    // 2. Base URL normalization
    const getBaseUrl = () => {
        // Prefer env var if available (though usually safe to use window.origin in client)
        const raw = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        return raw.replace(/\/$/, '')
    }

    const generateQr = async (pkg: PackageQrData) => {
        try {
            const baseUrl = getBaseUrl()
            // 3. Payload must match label format
            const payload = `${baseUrl}/tracking?code=${trackingCode}&pkg=${pkg.qr_token}`

            const url = await QRCode.toDataURL(payload, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'M',
                color: { dark: '#000000', light: '#ffffff' },
            })
            setQrDataUrl(url)
        } catch (e) {
            console.error('Error generating QR:', e)
            setQrDataUrl(null)
        }
    }

    // Regenerate QR when active package changes
    useEffect(() => {
        if (sortedPackages.length === 0) {
            setQrDataUrl(null)
            return
        }

        const index = parseInt(activeTab, 10)
        const pkg = sortedPackages[index]
        if (pkg) {
            generateQr(pkg)
        }
    }, [activeTab, trackingCode, sortedPackages])

    if (sortedPackages.length === 0) {
        return (
            <div className="flex flex-col items-center py-8">
                <p className="text-sm text-red-400 text-center">
                    Este envío no tiene paquetes
                    <br />
                    <span className="text-xs opacity-75">(Inconsistencia de datos)</span>
                </p>
            </div>
        )
    }

    // Single package view
    if (sortedPackages.length === 1) {
        return (
            <div className="flex flex-col items-center">
                {qrDataUrl ? (
                    <img
                        src={qrDataUrl}
                        alt={`QR ${trackingCode}`}
                        className="w-40 h-40 rounded-lg bg-white p-1"
                    />
                ) : (
                    <div className="w-40 h-40 rounded-lg bg-zinc-800 animate-pulse" />
                )}
                <p className="text-xs text-zinc-500 mt-2 text-center">
                    Escaneá para ver el tracking
                </p>
            </div>
        )
    }

    // Multi-package view (Tabs)
    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col items-center">
            <TabsList className="bg-zinc-800 text-zinc-400 border border-zinc-700 mb-4 grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
                {sortedPackages.map((pkg, idx) => (
                    <TabsTrigger
                        key={pkg.index}
                        value={idx.toString()}
                        className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 py-1.5 text-xs"
                    >
                        {pkg.index} de {sortedPackages.length}
                    </TabsTrigger>
                ))}
            </TabsList>

            <div className="flex flex-col items-center min-h-[180px]">
                {qrDataUrl ? (
                    <img
                        src={qrDataUrl}
                        alt={`QR ${trackingCode} - Pkg ${sortedPackages[parseInt(activeTab)]?.index}`}
                        className="w-40 h-40 rounded-lg bg-white p-1"
                    />
                ) : (
                    <div className="w-40 h-40 rounded-lg bg-zinc-800 animate-pulse" />
                )}
                <p className="text-xs text-zinc-500 mt-2 text-center">
                    Paquete {sortedPackages[parseInt(activeTab)]?.index} - Escaneá para ver el tracking
                </p>
            </div>
        </Tabs>
    )
}
