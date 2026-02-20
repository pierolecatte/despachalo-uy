'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface LogoUploadProps {
    orgId: string
    currentLogoUrl: string | null
    onUploaded: (url: string) => void
}

export default function LogoUpload({ orgId, currentLogoUrl, onUploaded }: LogoUploadProps) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [preview, setPreview] = useState<string | null>(currentLogoUrl)
    const supabase = createClient()

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            alert('Solo se permiten imágenes (JPG, PNG)')
            return
        }
        if (file.size > 1024 * 1024) {
            alert('El archivo no debe exceder 1MB')
            return
        }

        setUploading(true)
        const ext = file.name.split('.').pop()
        const path = `logos/${orgId}_${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
            .from('shipment-files')
            .upload(path, file, { upsert: true })

        if (uploadError) {
            alert('Error al subir: ' + uploadError.message)
            setUploading(false)
            return
        }

        const { data: { publicUrl } } = supabase.storage
            .from('shipment-files')
            .getPublicUrl(path)

        // Update organization logo_url
        await supabase.from('organizations').update({ logo_url: publicUrl }).eq('id', orgId)

        setPreview(publicUrl)
        onUploaded(publicUrl)
        setUploading(false)
    }

    return (
        <div className="space-y-3">
            {preview && (
                <div className="w-24 h-24 rounded-lg border border-zinc-700 bg-white p-2 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleFile} />
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="border-zinc-700 text-zinc-300"
            >
                {uploading ? 'Subiendo...' : preview ? '🔄 Cambiar logo' : '📤 Subir logo'}
            </Button>
            <p className="text-xs text-zinc-500">JPG o PNG, máx 1MB</p>
        </div>
    )
}
