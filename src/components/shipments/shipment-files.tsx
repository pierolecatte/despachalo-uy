'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateUY } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ShipmentFile {
    id: string
    shipment_id: string
    category: string
    storage_path: string
    created_at: string
}

interface FileSlot {
    key: string
    category: string
    label: string
    icon: string
    description: string
    existing?: ShipmentFile
}

interface ShipmentFilesProps {
    shipmentId: string
    readOnly?: boolean
}

export default function ShipmentFiles({ shipmentId, readOnly = false }: ShipmentFilesProps) {
    const supabase = createClient()
    const [files, setFiles] = useState<ShipmentFile[]>([])
    const [uploading, setUploading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

    useEffect(() => {
        fetchFiles()
    }, [shipmentId])

    async function fetchFiles() {
        // Fetch from new table shipment_files
        const { data } = await supabase
            .from('shipment_files')
            .select('*')
            .eq('shipment_id', shipmentId)
            .order('created_at', { ascending: true })

        setFiles((data as ShipmentFile[]) || [])
    }

    // Build the 4 slots with existing data
    const etiquetaFile = files.find(f => f.category === 'etiqueta')
    const comprobanteFile = files.find(f => f.category === 'comprobante')
    const adicionales = files.filter(f => f.category === 'documento_adicional')

    const slots: FileSlot[] = [
        {
            key: 'etiqueta',
            category: 'etiqueta',
            label: 'Foto de etiqueta',
            icon: '🏷️',
            description: 'Foto de la etiqueta del paquete',
            existing: etiquetaFile,
        },
        {
            key: 'comprobante',
            category: 'comprobante',
            label: 'Comprobante de envío',
            icon: '🧾',
            description: 'Comprobante del despacho',
            existing: comprobanteFile,
        },
        {
            key: 'adicional_1',
            category: 'documento_adicional',
            label: 'Documento adicional 1',
            icon: '📄',
            description: 'Remito, factura, u otro documento',
            existing: adicionales[0],
        },
        {
            key: 'adicional_2',
            category: 'documento_adicional',
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
        const fileName = `${shipmentId}/${slot.category}_${Date.now()}.${fileExt}`

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

        // Get public URL (though we primarily store path now, we might want to store full path/url)
        // Table expects 'storage_path'. We can store the full public URL or just the path.
        // Migration copied 'photo_url'. Let's store the full public URL to be consistent with migration
        // or cleaner: store relative path if we wanted, but existing code used full URL.
        // The prompt said: "storage_path text".
        // Let's store the Public URL for convenience of display.
        const { data: urlData } = supabase.storage
            .from('shipment-files')
            .getPublicUrl(fileName)

        // If replacing existing, delete old record first?
        // Logic: if slot is occupied, we delete the OLD file record + file?
        // For 'adicional', it handles 2 slots.
        if (slot.existing) {
            await handleDelete(slot.existing) // Delete old one cleanly
        }

        // Insert file record
        const { error: insertError } = await supabase
            .from('shipment_files')
            .insert({
                shipment_id: shipmentId,
                storage_path: urlData.publicUrl, // Using public URL as 'storage_path' for now
                category: slot.category,
            })

        if (insertError) {
            setError(`Error al guardar registro: ${insertError.message}`)
            setUploading(null)
            return
        }

        setUploading(null)
        fetchFiles()
    }

    async function handleDelete(fileRec: ShipmentFile) {
        // Extract path from URL for storage deletion
        // URL is: .../shipment-files/FOLDER/FILE...
        // We need 'FOLDER/FILE'
        const urlParts = fileRec.storage_path.split('/shipment-files/')
        if (urlParts[1]) {
            await supabase.storage
                .from('shipment-files')
                .remove([urlParts[1]])
        }

        await supabase
            .from('shipment_files')
            .delete()
            .eq('id', fileRec.id)

        fetchFiles()
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
                                    {isImage(slot.existing.storage_path) ? (
                                        <a href={slot.existing.storage_path} target="_blank" rel="noopener noreferrer">
                                            <div className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={slot.existing.storage_path}
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
                                            href={slot.existing.storage_path}
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
