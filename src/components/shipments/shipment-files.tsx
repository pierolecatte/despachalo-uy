'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateUY } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ShipmentPhoto {
    id: string
    shipment_id: string
    photo_url: string
    photo_type: string
    ai_extracted_data: Record<string, unknown> | null
    processed: boolean
    created_at: string
}

interface FileSlot {
    key: string
    photo_type: string
    label: string
    icon: string
    description: string
    existing?: ShipmentPhoto
}

interface ShipmentFilesProps {
    shipmentId: string
    readOnly?: boolean
}

export default function ShipmentFiles({ shipmentId, readOnly = false }: ShipmentFilesProps) {
    const supabase = createClient()
    const [photos, setPhotos] = useState<ShipmentPhoto[]>([])
    const [uploading, setUploading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

    useEffect(() => {
        fetchPhotos()
    }, [shipmentId])

    async function fetchPhotos() {
        const { data } = await supabase
            .from('shipment_photos')
            .select('*')
            .eq('shipment_id', shipmentId)
            .order('created_at', { ascending: true })

        setPhotos((data as ShipmentPhoto[]) || [])
    }

    // Build the 4 slots with existing data
    const etiquetaPhoto = photos.find(p => p.photo_type === 'etiqueta')
    const comprobantePhoto = photos.find(p => p.photo_type === 'comprobante')
    const adicionales = photos.filter(p => p.photo_type === 'documento_adicional')

    const slots: FileSlot[] = [
        {
            key: 'etiqueta',
            photo_type: 'etiqueta',
            label: 'Foto de etiqueta',
            icon: '🏷️',
            description: 'Foto de la etiqueta del paquete (para extracción IA)',
            existing: etiquetaPhoto,
        },
        {
            key: 'comprobante',
            photo_type: 'comprobante',
            label: 'Comprobante de envío',
            icon: '🧾',
            description: 'Comprobante del despacho (para matching IA)',
            existing: comprobantePhoto,
        },
        {
            key: 'adicional_1',
            photo_type: 'documento_adicional',
            label: 'Documento adicional 1',
            icon: '📄',
            description: 'Remito, factura, u otro documento',
            existing: adicionales[0],
        },
        {
            key: 'adicional_2',
            photo_type: 'documento_adicional',
            label: 'Documento adicional 2',
            icon: '📄',
            description: 'Foto de local cerrado, otro doc, etc.',
            existing: adicionales[1],
        },
    ]

    async function handleUpload(slot: FileSlot, file: File) {
        setUploading(slot.key)
        setError('')

        const fileExt = file.name.split('.').pop()
        const fileName = `${shipmentId}/${slot.photo_type}_${Date.now()}.${fileExt}`

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from('shipment-files')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false,
            })

        if (uploadError) {
            setError(`Error al subir: ${uploadError.message}`)
            setUploading(null)
            return
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('shipment-files')
            .getPublicUrl(fileName)

        // If replacing existing, delete old record first
        if (slot.existing) {
            await supabase
                .from('shipment_photos')
                .delete()
                .eq('id', slot.existing.id)
        }

        // Insert photo record
        const { error: insertError } = await supabase
            .from('shipment_photos')
            .insert({
                shipment_id: shipmentId,
                photo_url: urlData.publicUrl,
                photo_type: slot.photo_type,
            })

        if (insertError) {
            setError(`Error al guardar registro: ${insertError.message}`)
            setUploading(null)
            return
        }

        setUploading(null)
        fetchPhotos()
    }

    async function handleDelete(photo: ShipmentPhoto) {
        // Extract path from URL for storage deletion
        const urlParts = photo.photo_url.split('/shipment-files/')
        if (urlParts[1]) {
            await supabase.storage
                .from('shipment-files')
                .remove([urlParts[1]])
        }

        await supabase
            .from('shipment_photos')
            .delete()
            .eq('id', photo.id)

        fetchPhotos()
    }

    function isImage(url: string) {
        return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)
    }

    return (
        <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-base text-zinc-200">📎 Archivos del envío</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        ⚠️ {error}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {slots.map(slot => (
                        <div
                            key={slot.key}
                            className={`rounded-lg border p-3 transition-all ${slot.existing
                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : 'border-zinc-800 bg-zinc-800/30'
                                }`}
                        >
                            {/* Header */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{slot.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-200 truncate">{slot.label}</p>
                                    <p className="text-xs text-zinc-500">{slot.description}</p>
                                </div>
                            </div>

                            {/* Content */}
                            {slot.existing ? (
                                <div className="space-y-2">
                                    {/* Preview */}
                                    {isImage(slot.existing.photo_url) ? (
                                        <a href={slot.existing.photo_url} target="_blank" rel="noopener noreferrer">
                                            <div className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={slot.existing.photo_url}
                                                    alt={slot.label}
                                                    className="w-full h-24 object-cover rounded-md border border-zinc-700 group-hover:brightness-110 transition"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40 rounded-md">
                                                    <span className="text-white text-xs">🔍 Ver</span>
                                                </div>
                                            </div>
                                        </a>
                                    ) : (
                                        <a
                                            href={slot.existing.photo_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-emerald-400 hover:bg-zinc-700 transition"
                                        >
                                            📄 Ver documento ↗
                                        </a>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-zinc-500">
                                            {formatDateUY(slot.existing.created_at)}
                                        </span>
                                        {!readOnly && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(slot.existing!)}
                                                className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            >
                                                🗑️ Eliminar
                                            </Button>
                                        )}
                                    </div>
                                    {slot.existing.processed && (
                                        <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                                            ✅ Procesado por IA
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Upload area */
                                !readOnly ? (
                                    <div>
                                        <input
                                            type="file"
                                            accept="image/*,.pdf,.doc,.docx"
                                            ref={el => { fileInputRefs.current[slot.key] = el }}
                                            onChange={e => {
                                                const file = e.target.files?.[0]
                                                if (file) handleUpload(slot, file)
                                            }}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            disabled={uploading === slot.key}
                                            onClick={() => fileInputRefs.current[slot.key]?.click()}
                                            className="w-full h-20 rounded-md border-2 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 text-xs flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50"
                                        >
                                            {uploading === slot.key ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                                    <span>Subiendo...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-lg">⬆️</span>
                                                    <span>Subir archivo</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="h-20 rounded-md border border-zinc-800 flex items-center justify-center text-xs text-zinc-600">
                                        Sin archivo
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
