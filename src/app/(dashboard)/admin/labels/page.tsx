'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LabelPreview from '@/components/labels/label-preview'
import LogoUpload from '@/components/labels/logo-upload'
import type { PackageSize } from '@/types/database'
import type { LabelConfig } from '@/types/label-config'
import { DEFAULT_LABEL_CONFIG } from '@/types/label-config'

interface Profile {
    id: string
    name: string
    org_id: string | null
    is_default: boolean
    org_name?: string
}

interface Org {
    id: string
    name: string
    logo_url: string | null
}

const SIZE_TABS: { value: PackageSize; label: string; emoji: string }[] = [
    { value: 'grande', label: 'Grande', emoji: '📦' },
    { value: 'mediano', label: 'Mediana', emoji: '📬' },
    { value: 'chico', label: 'Pequeña', emoji: '✉️' },
]

const POSITIONS = [
    { value: 'top_left', label: 'Superior izq.' },
    { value: 'top_right', label: 'Superior der.' },
    { value: 'bottom_left', label: 'Inferior izq.' },
    { value: 'bottom_right', label: 'Inferior der.' },
    { value: 'bottom_center', label: 'Inferior centro' },
]

const FONT_OPTIONS = [
    { value: 'helvetica', label: 'Helvetica' },
    { value: 'times', label: 'Times' },
    { value: 'courier', label: 'Courier' },
]

const PRESETS = [
    { value: 'minimal', label: 'Minimalista' },
    { value: 'classic', label: 'Clásico' },
    { value: 'bold', label: 'Bold (Negrita)' },
    { value: 'branded', label: 'Con Marca' },
]

export default function LabelsPage() {
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const [profiles, setProfiles] = useState<Profile[]>([])
    const [remitentes, setRemitentes] = useState<Org[]>([])
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
    const [activeSize, setActiveSize] = useState<PackageSize>('grande')
    const [config, setConfig] = useState<LabelConfig | null>(null)

    // Profile form
    const [profileName, setProfileName] = useState('')
    const [profileOrgId, setProfileOrgId] = useState<string>('')
    const [profileIsDefault, setProfileIsDefault] = useState(false)
    const [creatingNew, setCreatingNew] = useState(false)

    const selectedProfile = profiles.find(p => p.id === selectedProfileId)
    const selectedOrg = remitentes.find(r => r.id === (selectedProfile?.org_id || profileOrgId))

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [profilesRes, orgsRes] = await Promise.all([
            supabase
                .from('label_profiles')
                .select('*, organizations:org_id(name)')
                .order('is_default', { ascending: false })
                .order('name'),
            supabase
                .from('organizations')
                .select('id, name, logo_url')
                .eq('type', 'remitente')
                .eq('active', true)
                .order('name'),
        ])

        const profs: Profile[] = (profilesRes.data || []).map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: p.name as string,
            org_id: p.org_id as string | null,
            is_default: p.is_default as boolean,
            org_name: (p.organizations as { name: string } | null)?.name || undefined,
        }))
        setProfiles(profs)
        setRemitentes((orgsRes.data || []) as Org[])

        // Select first profile if none selected
        if (!selectedProfileId && profs.length > 0) {
            const defaultP = profs.find(p => p.is_default) || profs[0]
            setSelectedProfileId(defaultP.id)
            setProfileName(defaultP.name)
            setProfileOrgId(defaultP.org_id || '')
            setProfileIsDefault(defaultP.is_default)
        }

        setLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Fetch config for selected profile + size
    const fetchConfig = useCallback(async () => {
        if (!selectedProfileId) return
        const { data } = await supabase
            .from('label_configs')
            .select('*')
            .eq('profile_id', selectedProfileId)
            .eq('size', activeSize)
            .single()

        if (data) {
            setConfig({ ...DEFAULT_LABEL_CONFIG, ...data } as LabelConfig)
        } else {
            setConfig(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProfileId, activeSize])

    useEffect(() => { fetchAll() }, [fetchAll])
    useEffect(() => { fetchConfig() }, [fetchConfig])

    function selectProfile(profile: Profile) {
        setSelectedProfileId(profile.id)
        setProfileName(profile.name)
        setProfileOrgId(profile.org_id || '')
        setProfileIsDefault(profile.is_default)
        setCreatingNew(false)
    }

    function startNewProfile() {
        setSelectedProfileId(null)
        setProfileName('')
        setProfileOrgId('')
        setProfileIsDefault(false)
        setCreatingNew(true)
        setConfig(null)
    }

    async function saveProfile() {
        if (!profileName.trim()) {
            setMessage({ type: 'error', text: 'El nombre es obligatorio' })
            return
        }

        setSaving(true)
        setMessage(null)

        if (creatingNew) {
            // Unset other defaults if this is default
            if (profileIsDefault) {
                await supabase.from('label_profiles').update({ is_default: false }).eq('is_default', true)
            }

            const { data: newProfile, error } = await supabase
                .from('label_profiles')
                .insert({
                    name: profileName,
                    org_id: profileOrgId || null,
                    is_default: profileIsDefault,
                })
                .select()
                .single()

            if (error || !newProfile) {
                setMessage({ type: 'error', text: error?.message || 'Error al crear perfil' })
                setSaving(false)
                return
            }

            // Create 3 default configs
            const sizes: PackageSize[] = ['grande', 'mediano', 'chico']
            const dims = [
                { width_mm: 150, height_mm: 200 },
                { width_mm: 100, height_mm: 150 },
                { width_mm: 80, height_mm: 120 },
            ]

            // Merge defaults from DEFAULT_LABEL_CONFIG
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, profile_id, size, ...defaults } = DEFAULT_LABEL_CONFIG as LabelConfig

            await supabase.from('label_configs').insert(
                sizes.map((size, i) => ({
                    profile_id: newProfile.id,
                    size,
                    ...dims[i],
                    // Apply defaults for new columns
                    ...defaults
                }))
            )

            setSelectedProfileId(newProfile.id)
            setCreatingNew(false)
            setMessage({ type: 'success', text: 'Perfil creado' })
        } else if (selectedProfileId) {
            if (profileIsDefault) {
                await supabase.from('label_profiles').update({ is_default: false }).eq('is_default', true)
            }

            const { error } = await supabase
                .from('label_profiles')
                .update({
                    name: profileName,
                    org_id: profileOrgId || null,
                    is_default: profileIsDefault,
                })
                .eq('id', selectedProfileId)

            if (error) {
                setMessage({ type: 'error', text: error.message })
                setSaving(false)
                return
            }
            setMessage({ type: 'success', text: 'Perfil actualizado' })
        }

        await fetchAll()
        setSaving(false)
    }

    async function deleteProfile() {
        if (!selectedProfileId) return
        if (profiles.length <= 1) {
            setMessage({ type: 'error', text: 'Debe existir al menos un perfil' })
            return
        }
        if (!confirm('¿Eliminar este perfil? No se puede deshacer.')) return

        await supabase.from('label_profiles').delete().eq('id', selectedProfileId)

        setSelectedProfileId(null)
        setMessage({ type: 'success', text: 'Perfil eliminado' })
        await fetchAll()
    }

    async function duplicateProfile(profileId: string) {
        setLoading(true)
        try {
            const res = await fetch(`/api/labels/profiles/${profileId}/duplicate`, {
                method: 'POST',
            })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Error al duplicar perfil')
            }

            await fetchAll()
            setSelectedProfileId(data.newProfileId)

            // Find the new profile to set details
            const { data: newProfile } = await supabase
                .from('label_profiles')
                .select('*')
                .eq('id', data.newProfileId)
                .single()

            if (newProfile) {
                setProfileName(newProfile.name)
                setProfileOrgId(newProfile.org_id || '')
                setProfileIsDefault(false)
                setCreatingNew(false)
            }

            setMessage({ type: 'success', text: 'Perfil duplicado correctamente' })
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message })
        } finally {
            setLoading(false)
        }
    }

    async function saveConfig() {
        if (!config) return
        setSaving(true)
        setMessage(null)

        const { id, profile_id, size, ...updateData } = config
        void profile_id
        void size

        const { error } = await supabase
            .from('label_configs')
            .update(updateData)
            .eq('id', id)

        if (error) {
            setMessage({ type: 'error', text: error.message })
        } else {
            setMessage({ type: 'success', text: 'Configuración guardada' })
        }
        setSaving(false)
    }

    function updateConfig<K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) {
        if (!config) return

        // Logic for presets
        if (key === 'theme_preset') {
            const preset = value as LabelConfig['theme_preset']
            let updates: Partial<LabelConfig> = { theme_preset: preset }

            if (preset === 'minimal') {
                updates = { ...updates, header_band: false, show_border: true, border_width_pt: 0.5 }
            } else if (preset === 'classic') {
                updates = { ...updates, header_band: true, header_band_height_mm: 12, show_border: true, border_width_pt: 1 }
            } else if (preset === 'bold') {
                updates = { ...updates, header_band: true, header_band_height_mm: 16, show_border: true, border_width_pt: 2 }
            } else if (preset === 'branded') {
                updates = { ...updates, header_band: true, header_band_height_mm: 14, show_border: true, border_width_pt: 1 }
            }

            setConfig({ ...config, ...updates })
            return
        }

        setConfig({ ...config, [key]: value })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-zinc-50">🏷️ Configuración de Etiquetas</h1>
                <p className="text-zinc-400 mt-1">Personaliza las etiquetas de envío por remitente y tamaño</p>
            </div>

            {/* Messages */}
            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {message.type === 'success' ? '✅' : '⚠️'} {message.text}
                </div>
            )}

            <div className="grid grid-cols-12 gap-6">
                {/* LEFT: Profiles sidebar */}
                <div className="col-span-12 md:col-span-3">
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base text-zinc-200">Perfiles</CardTitle>
                                <Button size="sm" variant="ghost" onClick={startNewProfile} className="text-emerald-400 hover:text-emerald-300 h-8 px-2">
                                    ➕
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Profile form */}
                            <div className="space-y-3 pb-4 border-b border-zinc-800">
                                <div className="space-y-1.5">
                                    <Label className="text-zinc-400 text-xs">Nombre</Label>
                                    <Input
                                        value={profileName}
                                        onChange={e => setProfileName(e.target.value)}
                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm"
                                        placeholder="Mi perfil..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-zinc-400 text-xs">Remitente</Label>
                                    <Select value={profileOrgId} onValueChange={setProfileOrgId}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm">
                                            <SelectValue placeholder="Genérico (todos)" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            <SelectItem value="__none__">🌐 Genérico (todos)</SelectItem>
                                            {remitentes.map(r => (
                                                <SelectItem key={r.id} value={r.id}>📦 {r.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={profileIsDefault}
                                        onCheckedChange={setProfileIsDefault}
                                        className="data-[state=checked]:bg-emerald-500"
                                    />
                                    <span className="text-xs text-zinc-400">Predeterminado</span>
                                </div>

                                {/* Logo upload */}
                                {profileOrgId && profileOrgId !== '__none__' && (
                                    <LogoUpload
                                        orgId={profileOrgId}
                                        currentLogoUrl={selectedOrg?.logo_url || null}
                                        onUploaded={(url) => {
                                            setRemitentes(prev => prev.map(r => r.id === profileOrgId ? { ...r, logo_url: url } : r))
                                        }}
                                    />
                                )}

                                <div className="flex gap-2">
                                    <Button size="sm" onClick={saveProfile} disabled={saving}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 flex-1">
                                        {creatingNew ? 'Crear' : 'Guardar'}
                                    </Button>
                                    {selectedProfileId && !creatingNew && (
                                        <Button size="sm" variant="outline" onClick={deleteProfile}
                                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7">
                                            🗑️
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Profile list */}
                            <div className="space-y-1">
                                {profiles.map(p => (
                                    <div
                                        key={p.id}
                                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg transition-all ${p.id === selectedProfileId
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                                            }`}
                                    >
                                        <button
                                            onClick={() => selectProfile(p)}
                                            className="flex-1 text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="truncate">{p.name}</span>
                                                {p.is_default && (
                                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                                        default
                                                    </span>
                                                )}
                                            </div>
                                            {p.org_name && (
                                                <p className="text-xs text-zinc-500 truncate mt-0.5">{p.org_name}</p>
                                            )}
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                title="Duplicar perfil"
                                                disabled={loading}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    duplicateProfile(p.id)
                                                }}
                                                className="h-6 w-6 p-0 hover:bg-zinc-700/50 hover:text-emerald-400"
                                            >
                                                📋
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* CENTER: Config panel */}
                <div className="col-span-12 md:col-span-5">
                    {!selectedProfileId && !creatingNew ? (
                        <div className="text-center py-20 text-zinc-500">
                            Seleccione o cree un perfil para configurar
                        </div>
                    ) : creatingNew ? (
                        <div className="text-center py-20 text-zinc-500">
                            <p className="text-lg mb-2">📝 Creando nuevo perfil</p>
                            <p className="text-sm">Complete los datos del perfil a la izquierda y haga click en &quot;Crear&quot;</p>
                        </div>
                    ) : config ? (
                        <Card className="bg-zinc-900/80 border-zinc-800">
                            {/* Size tabs */}
                            <div className="flex border-b border-zinc-800">
                                {SIZE_TABS.map(tab => (
                                    <button
                                        key={tab.value}
                                        onClick={() => setActiveSize(tab.value)}
                                        className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${activeSize === tab.value
                                            ? 'border-b-2 border-emerald-500 text-emerald-400 bg-emerald-500/5'
                                            : 'text-zinc-400 hover:text-zinc-200'
                                            }`}
                                    >
                                        {tab.emoji} {tab.label}
                                    </button>
                                ))}
                            </div>

                            <CardContent className="p-5">
                                <Tabs defaultValue="structure" className="space-y-4">
                                    <TabsList className="grid w-full grid-cols-4 bg-zinc-800/50">
                                        <TabsTrigger value="structure">📐 Estructura</TabsTrigger>
                                        <TabsTrigger value="content">📋 Contenido</TabsTrigger>
                                        <TabsTrigger value="style">🎨 Estilo</TabsTrigger>
                                        <TabsTrigger value="advanced">⚙️ Avanzado</TabsTrigger>
                                    </TabsList>

                                    {/* STRUCTURE CONFIG */}
                                    <TabsContent value="structure" className="space-y-4">
                                        {/* Dimensions */}
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-medium text-zinc-300">Dimensiones (mm)</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Ancho papel</Label>
                                                    <Input type="number" step="0.5" value={config.width_mm}
                                                        onChange={e => updateConfig('width_mm', parseFloat(e.target.value) || 100)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Alto papel</Label>
                                                    <Input type="number" step="0.5" value={config.height_mm}
                                                        onChange={e => updateConfig('height_mm', parseFloat(e.target.value) || 150)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Margins */}
                                        <div className="space-y-2 pt-2 border-t border-zinc-800">
                                            <h3 className="text-sm font-medium text-zinc-300">Márgenes (mm)</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Superior</Label>
                                                    <Input type="number" step="0.5" value={config.margin_top}
                                                        onChange={e => updateConfig('margin_top', parseFloat(e.target.value) || 8)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Inferior</Label>
                                                    <Input type="number" step="0.5" value={config.margin_bottom}
                                                        onChange={e => updateConfig('margin_bottom', parseFloat(e.target.value) || 8)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Izquierdo</Label>
                                                    <Input type="number" step="0.5" value={config.margin_left}
                                                        onChange={e => updateConfig('margin_left', parseFloat(e.target.value) || 8)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Derecho</Label>
                                                    <Input type="number" step="0.5" value={config.margin_right}
                                                        onChange={e => updateConfig('margin_right', parseFloat(e.target.value) || 8)}
                                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    {/* CONTENT CONFIG */}
                                    <TabsContent value="content" className="space-y-5">
                                        {/* Service & Freight */}
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-medium text-zinc-300">Servicio y Flete</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_service_label} onCheckedChange={v => updateConfig('show_service_label', v)} />
                                                    <Label className="text-xs text-zinc-400">Tipo Servicio</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_freight_badge} onCheckedChange={v => updateConfig('show_freight_badge', v)} />
                                                    <Label className="text-xs text-zinc-400">Badge &quot;PAGO&quot;</Label>
                                                </div>
                                            </div>
                                            {config.show_freight_badge && (
                                                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-zinc-800">
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Posición Badge</Label>
                                                        <Select value={config.freight_badge_position} onValueChange={(v: any) => updateConfig('freight_badge_position', v)}>
                                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="service_block">Junto al servicio</SelectItem>
                                                                <SelectItem value="top">Arriba derecha</SelectItem>
                                                                <SelectItem value="bottom">Abajo</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Estilo Badge</Label>
                                                        <Select value={config.freight_badge_variant} onValueChange={(v: any) => updateConfig('freight_badge_variant', v)}>
                                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="outline">Borde (Outline)</SelectItem>
                                                                <SelectItem value="filled">Relleno (Filled)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3 pt-2 border-t border-zinc-800">
                                            <h3 className="text-sm font-medium text-zinc-300">Datos Remitente / Destinatario</h3>
                                            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_sender_name} onCheckedChange={v => updateConfig('show_sender_name', v)} />
                                                    <Label className="text-xs text-zinc-400">Nom. Remitente</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_sender_address} onCheckedChange={v => updateConfig('show_sender_address', v)} />
                                                    <Label className="text-xs text-zinc-400">Dir. Remitente</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_sender_phone} onCheckedChange={v => updateConfig('show_sender_phone', v)} />
                                                    <Label className="text-xs text-zinc-400">Tel. Remitente</Label>
                                                </div>

                                                <div className="col-span-2 h-px bg-zinc-800 my-1" />

                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_recipient_name} disabled className="opacity-50" />
                                                    <Label className="text-xs text-zinc-400">Nom. Destinatario*</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_recipient_address} disabled className="opacity-50" />
                                                    <Label className="text-xs text-zinc-400">Dir. Destinatario*</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_recipient_phone} onCheckedChange={v => updateConfig('show_recipient_phone', v)} />
                                                    <Label className="text-xs text-zinc-400">Tel. Destinatario</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_recipient_city} onCheckedChange={v => updateConfig('show_recipient_city', v)} />
                                                    <Label className="text-xs text-zinc-400">Ciudad</Label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-2 border-t border-zinc-800">
                                            <h3 className="text-sm font-medium text-zinc-300">Otros Datos</h3>
                                            <div className="flex gap-4 flex-wrap">
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_cadeteria} onCheckedChange={v => updateConfig('show_cadeteria', v)} />
                                                    <Label className="text-xs text-zinc-400">Cadetería</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_agencia} onCheckedChange={v => updateConfig('show_agencia', v)} />
                                                    <Label className="text-xs text-zinc-400">Agencia</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_description} onCheckedChange={v => updateConfig('show_description', v)} />
                                                    <Label className="text-xs text-zinc-400">Descripción</Label>
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    {/* STYLE CONFIG */}
                                    <TabsContent value="style" className="space-y-5">
                                        {/* Presets */}
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-medium text-zinc-300">Tema (Preset)</h3>
                                            <div className="grid grid-cols-2 gap-2">
                                                {PRESETS.map(p => (
                                                    <button
                                                        key={p.value}
                                                        onClick={() => updateConfig('theme_preset', p.value as any)}
                                                        className={`text-xs p-2 rounded border transition-all ${config.theme_preset === p.value
                                                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                                                            : 'bg-zinc-800/30 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                                                            }`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Colors & Header */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-zinc-500 text-xs">Color Primario</Label>
                                                <div className="flex gap-2">
                                                    <Input type="color" value={config.primary_color}
                                                        onChange={e => updateConfig('primary_color', e.target.value)}
                                                        className="w-8 h-8 p-1 bg-zinc-800 border-zinc-700" />
                                                    <Input type="text" value={config.primary_color}
                                                        onChange={e => updateConfig('primary_color', e.target.value)}
                                                        className="h-8 text-xs font-mono flex-1 bg-zinc-800/50 border-zinc-700" />
                                                </div>
                                            </div>
                                            <div className="space-y-2 pt-1">
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.header_band} onCheckedChange={v => updateConfig('header_band', v)} />
                                                    <Label className="text-xs text-zinc-400">Banda Superior</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={config.show_border} onCheckedChange={v => updateConfig('show_border', v)} />
                                                    <Label className="text-xs text-zinc-400">Recuadro</Label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Logo Control */}
                                        <div className="space-y-3 pt-3 border-t border-zinc-800">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-medium text-zinc-300">Logo</h3>
                                                <Switch checked={config.show_logo} onCheckedChange={v => updateConfig('show_logo', v)} />
                                            </div>

                                            {config.show_logo && (
                                                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-zinc-800">
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Posición</Label>
                                                        <Select value={config.logo_position} onValueChange={(v: any) => updateConfig('logo_position', v)}>
                                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {POSITIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Ajuste</Label>
                                                        <Select value={config.logo_fit} onValueChange={(v: any) => updateConfig('logo_fit', v)}>
                                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="contain">Contener (Contain)</SelectItem>
                                                                <SelectItem value="cover">Cubrir (Cover)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Ancho (mm)</Label>
                                                        <Input type="number" value={config.logo_width_mm} onChange={e => updateConfig('logo_width_mm', parseFloat(e.target.value))} className="h-7 text-xs" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-[10px]">Alto (mm)</Label>
                                                        <Input type="number" value={config.logo_height_mm} onChange={e => updateConfig('logo_height_mm', parseFloat(e.target.value))} className="h-7 text-xs" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>

                                    {/* ADVANCED CONFIG */}
                                    <TabsContent value="advanced" className="space-y-5">
                                        {/* QR config */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-medium text-zinc-300">Código QR</h3>
                                                <Switch checked={config.show_qr} onCheckedChange={v => updateConfig('show_qr', v)} />
                                            </div>
                                            {config.show_qr && (
                                                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-zinc-800">
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-xs">Posición</Label>
                                                        <Select value={config.qr_position} onValueChange={(v: any) => updateConfig('qr_position', v)}>
                                                            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                                                {POSITIONS.map(p => (
                                                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-xs">Tamaño (px)</Label>
                                                        <Input type="number" value={config.qr_size_px}
                                                            onChange={e => updateConfig('qr_size_px', parseInt(e.target.value) || 80)}
                                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Fonts */}
                                        <div className="space-y-3 pt-3 border-t border-zinc-800">
                                            <h3 className="text-sm font-medium text-zinc-300">Fuentes</h3>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-zinc-500 text-xs">Familia</Label>
                                                    <Select value={config.font_family} onValueChange={v => updateConfig('font_family', v)}>
                                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                                            {FONT_OPTIONS.map(f => (
                                                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-xs">Título (pt)</Label>
                                                        <Input type="number" step="0.5" value={config.font_size_title}
                                                            onChange={e => updateConfig('font_size_title', parseFloat(e.target.value) || 12)}
                                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-zinc-500 text-xs">Contenido (pt)</Label>
                                                        <Input type="number" step="0.5" value={config.font_size_content}
                                                            onChange={e => updateConfig('font_size_content', parseFloat(e.target.value) || 10)}
                                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>

                                {/* Save button */}
                                <Button onClick={saveConfig} disabled={saving}
                                    className="w-full mt-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                                    {saving ? 'Guardando...' : '💾 Guardar Configuración'}
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="text-center py-20 text-zinc-500">
                            Cargando configuración...
                        </div>
                    )}
                </div>

                {/* RIGHT: Preview */}
                <div className="col-span-12 md:col-span-4">
                    {config && (
                        <Card className="bg-zinc-900/80 border-zinc-800 sticky top-4">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base text-zinc-200">
                                    👁️ Vista Previa
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex justify-center pb-6">
                                <LabelPreview
                                    config={config}
                                    logoUrl={selectedOrg?.logo_url}
                                    orgName={selectedOrg?.name || selectedProfile?.org_name}
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
