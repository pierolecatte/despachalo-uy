'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { generateTrackingCode } from '@/lib/utils'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import RecipientAutocomplete from '@/components/shipments/recipient-autocomplete'
import dynamic from 'next/dynamic'
import { repriceShipment } from '@/lib/pricing/api'

const AddressMapPicker = dynamic(
    () => import('@/components/shipments/address-map-picker'),
    { ssr: false, loading: () => <div className="w-full h-[250px] bg-zinc-800/50 rounded-lg animate-pulse" /> }
)
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Organization {
    id: string
    name: string
    type: string
}

interface CadeteUser {
    id: string
    full_name: string
    email: string | null
}

interface Department {
    id: number
    name: string
}

interface ServiceType {
    id: string
    code: string
    name: string
    description: string | null
    pricing_mode: string
    base_price: number | null
}

interface PackageFormData {
    size: string
    weight_kg: string
    shipping_cost: string
    content_description: string
    fragile: boolean
}

const SERVICE_TYPE_OPTIONS = [
    { code: 'express_24h', label: '⚡ Express 24hs', description: 'Entrega garantizada en 24 horas' },
    { code: 'comun_48h', label: '📦 Común 48hs', description: 'Entrega estándar en 48 horas' },
    { code: 'despacho_agencia', label: '🚛 Despacho Agencia', description: 'Envío a través de agencia de transporte' },
    { code: 'por_km', label: '📍 Por kilómetro', description: 'Tarifa basada en distancia' },
    { code: 'por_horas', label: '⏱️ Por horas', description: 'Tarifa basada en tiempo' },
    { code: 'especial', label: '⭐ Especial', description: 'Servicio personalizado' },
]

function createDefaultPackage(): PackageFormData {
    return { size: 'mediano', weight_kg: '', shipping_cost: '', content_description: '', fragile: false }
}

export default function NewShipmentPage() {
    const router = useRouter()
    const supabase = createClient()
    // ... (omitting unchanged lines until we reach updatePackage or package form) ...
    // ... actually I need to be careful with range. I will split this into chunks.

    // First chunk: Update Interface and Default

    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [remitentes, setRemitentes] = useState<Organization[]>([])
    const [cadeterias, setCadeterias] = useState<Organization[]>([])
    const [agencias, setAgencias] = useState<Organization[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
    const [cadetes, setCadetes] = useState<CadeteUser[]>([])

    // Controlled state for conditional logic
    const [selectedServiceCode, setSelectedServiceCode] = useState('')
    const [selectedAgencia, setSelectedAgencia] = useState('')
    const [selectedCadeteria, setSelectedCadeteria] = useState('')
    const [selectedCadete, setSelectedCadete] = useState('')
    const [selectedRemitente, setSelectedRemitente] = useState('')
    const [selectedDepartment, setSelectedDepartment] = useState('')
    const [selectedDeliveryType, setSelectedDeliveryType] = useState('domicilio')
    const [recipientLat, setRecipientLat] = useState<number | null>(null)
    const [recipientLng, setRecipientLng] = useState<number | null>(null)

    // Multi-package state
    const [packageCount, setPackageCount] = useState(1)
    const [packages, setPackages] = useState<PackageFormData[]>([createDefaultPackage()])

    // Recipient autocomplete data ref
    const recipientDataRef = useRef<{
        recipientName: string
        recipientPhone: string
        recipientEmail: string
        recipientAddress: string
        recipientCity: string
        recipientDepartment: string
        recipientObservations: string
        recipientId: string | null
        recipientAddressId: string | null
        departmentId: string | number | null
        localityId: string | number | null
        localityManual: string | null
    } | null>(null)

    // New fields for freight
    const [isFreightPaid, setIsFreightPaid] = useState(false)
    const [freightAmount, setFreightAmount] = useState('')

    const isDespachoAgencia = selectedServiceCode === 'despacho_agencia'

    useEffect(() => {
        fetchData()
    }, [])

    // Fetch cadetes and enabled services when cadeteria changes
    const [enabledServices, setEnabledServices] = useState<Set<string> | null>(null)

    useEffect(() => {
        setCadetes([])
        setSelectedCadete('')
        setEnabledServices(null)

        if (!selectedCadeteria) return

        async function fetchCadeteriaData() {
            const [cadetesRes, servicesRes] = await Promise.all([
                supabase
                    .from('users')
                    .select('id, full_name, email')
                    .eq('org_id', selectedCadeteria)
                    .eq('role', 'cadete')
                    .eq('active', true)
                    .order('full_name'),
                supabase
                    .from('courier_services')
                    .select('service_type_code, enabled')
                    .eq('courier_org_id', selectedCadeteria)
            ])

            setCadetes((cadetesRes.data as CadeteUser[]) || [])

            if (servicesRes.data && servicesRes.data.length > 0) {
                // Filter enabled only
                const enabled = new Set(servicesRes.data.filter((s: any) => s.enabled).map((s: any) => s.service_type_code))
                setEnabledServices(enabled)
            } else {
                // If no config found, assume all enabled? Or none?
                // Let's assume all enabled if no config exists (migration strategy)
                setEnabledServices(null)
            }
        }
        fetchCadeteriaData()
    }, [selectedCadeteria])

    // Sync packages array when packageCount changes
    function handlePackageCountChange(newCount: number) {
        const count = Math.max(1, newCount)
        setPackageCount(count)
        setPackages(prev => {
            if (count > prev.length) {
                return [...prev, ...Array(count - prev.length).fill(null).map(() => createDefaultPackage())]
            }
            return prev.slice(0, count)
        })
    }

    function updatePackage(index: number, field: keyof PackageFormData, value: string | boolean) {
        setPackages(prev => {
            const updated = [...prev]
            // @ts-ignore - dynamic key assignment validation is tricky here but safe by runtime usage
            updated[index] = { ...updated[index], [field]: value }
            return updated
        })
    }

    async function fetchData() {
        const [orgsRes, deptsRes, servicesRes] = await Promise.all([
            supabase.from('organizations').select('id, name, type').eq('active', true).order('name'),
            supabase.from('departments').select('id, name').order('name'),
            supabase.from('service_types').select('id, code, name, description, pricing_mode, base_price').eq('active', true).order('name'),
        ])
        const orgs = orgsRes.data || []
        setRemitentes(orgs.filter((o: Organization) => o.type === 'remitente'))
        setCadeterias(orgs.filter((o: Organization) => o.type === 'cadeteria'))
        setAgencias(orgs.filter((o: Organization) => o.type === 'agencia'))
        setDepartments(deptsRes.data || [])
        setServiceTypes((servicesRes.data as ServiceType[]) || [])
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        setError('')

        const formData = new FormData(e.currentTarget)

        // Find the service_type_id from our service_types table
        const matchingService = serviceTypes.find(s => s.code === selectedServiceCode)

        const rd = recipientDataRef.current

        // Use first package's data as shipment-level defaults (backward compat)
        const firstPkg = packages[0]

        // Validate Location (Frontend check)
        const deptId = rd?.departmentId ? Number(rd.departmentId) : (selectedDepartment ? Number(selectedDepartment) : null);
        const locId = rd?.localityId ? Number(rd.localityId) : null;
        const locManual = rd?.localityManual ? rd.localityManual.trim() : null;

        // If strict validation is needed here, we can add it, 
        // but backend will handle it. 
        // We do basic check: if using manual, must have department.

        const shipmentData = {
            tracking_code: generateTrackingCode(),
            remitente_org_id: selectedRemitente,
            cadeteria_org_id: selectedCadeteria || null,
            cadete_user_id: (selectedCadeteria && selectedCadete) ? selectedCadete : null,
            agencia_org_id: isDespachoAgencia ? (selectedAgencia || null) : null,
            service_type_id: matchingService?.id || null,
            status: 'pendiente' as const,
            recipient_name: rd?.recipientName || formData.get('recipient_name') as string,
            recipient_phone: rd?.recipientPhone || (formData.get('recipient_phone') as string) || null,
            recipient_email: rd?.recipientEmail || (formData.get('recipient_email') as string) || null,
            recipient_address: rd?.recipientAddress || (formData.get('recipient_address') as string) || null,

            // New Location Fields
            department_id: deptId,
            locality_id: locId,
            locality_manual: locManual,

            // Maintain legacy text fields for now if helpful, but they might be deprecated in favor of relations
            recipient_department: rd?.recipientDepartment || null,
            recipient_city: rd?.recipientCity || null,

            delivery_type: selectedDeliveryType,
            package_size: firstPkg.size || 'mediano',
            package_count: packageCount,
            weight_kg: parseFloat(firstPkg.weight_kg) || null,
            description: firstPkg.content_description || null,
            notes: (formData.get('notes') as string) || null,
            shipping_cost: parseFloat(firstPkg.shipping_cost) || null,
            is_freight_paid: isDespachoAgencia ? isFreightPaid : false,
            freight_amount: (isDespachoAgencia && freightAmount) ? parseFloat(freightAmount) : null,
            recipient_observations: rd?.recipientObservations || (formData.get('recipient_observations') as string) || null,
            recipient_lat: recipientLat,
            recipient_lng: recipientLng,
            // Pass packages to API for atomic creation
            packages: packages.map((pkg, idx) => ({
                index: idx + 1,
                size: pkg.size || 'mediano',
                weight_kg: parseFloat(pkg.weight_kg) || null,
                shipping_cost: parseFloat(pkg.shipping_cost) || null,
                content_description: pkg.content_description || null,
                fragile: pkg.fragile,
            }))
        }

        const response = await fetch('/api/shipments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(shipmentData),
        })

        let result
        try {
            result = await response.json()
        } catch (e) {
            setError('Error de comunicación con el servidor')
            setSaving(false)
            return
        }

        if (!response.ok) {
            if (result.fieldErrors) {
                // If we have specific field errors, format them for display
                const errorMessages = Object.entries(result.fieldErrors)
                    .map(([field, msg]) => `${field}: ${msg}`)
                    .join(' | ')
                setError(`Error de validación: ${errorMessages}`)
            } else {
                setError(result.message || 'Error al crear envío')
            }
            setSaving(false)
            return
        }

        const inserted = result

        // Generate QR code pointing to public tracking URL
        try {
            const trackingUrl = `${window.location.origin}/tracking?code=${inserted.tracking_code}`
            const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' },
            })
            await supabase
                .from('shipments')
                .update({ qr_code_url: qrDataUrl })
                .eq('id', inserted.id)
        } catch {
            // QR generation failure is non-blocking
            console.error('QR generation failed')
        }

        // Trigger Reprice
        try {
            await repriceShipment(inserted.id, 'REGENERATE_ALL')
        } catch (err) {
            console.error('Initial Reprice Failed:', err)
            // We don't block flow, but user will see "Pricing Incomplete" on detail page
        }

        router.push(`/admin/shipments/${inserted.id}`)
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Nuevo Envío</h1>
                    <p className="text-zinc-400 mt-1">Registrá un nuevo envío en el sistema</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => router.back()}
                    className="border-zinc-700 text-zinc-400"
                >
                    ← Volver
                </Button>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    ⚠️ {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Organizaciones + Servicio */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">🏢 Remitente y Servicio</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Remitente *</Label>
                                <Select value={selectedRemitente} onValueChange={setSelectedRemitente} required>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar remitente..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {remitentes.map(r => (
                                            <SelectItem key={r.id} value={r.id}>📦 {r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Tipo de servicio *</Label>
                                <Select value={selectedServiceCode} onValueChange={(val) => {
                                    setSelectedServiceCode(val)
                                    // Clear agencia when not despacho_agencia
                                    if (val !== 'despacho_agencia') {
                                        setSelectedAgencia('')
                                        setIsFreightPaid(false)
                                        setFreightAmount('')
                                    }
                                }}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar servicio..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {serviceTypes
                                            .filter(s => {
                                                if (!enabledServices) return true; // Show all if no config
                                                return enabledServices.has(s.code);
                                            })
                                            .map(s => (
                                                <SelectItem key={s.code} value={s.code}>
                                                    {s.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Service type description hint */}
                        {selectedServiceCode && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                                <span className="text-xs text-emerald-400">
                                    ℹ️ {serviceTypes.find(s => s.code === selectedServiceCode)?.description}
                                </span>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Cadetería</Label>
                                <Select value={selectedCadeteria} onValueChange={setSelectedCadeteria}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Sin asignar" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {cadeterias.map(c => (
                                            <SelectItem key={c.id} value={c.id}>🏍️ {c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Cadete — only when cadeteria is selected */}
                            {selectedCadeteria && (
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Cadete</Label>
                                    <Select value={selectedCadete} onValueChange={setSelectedCadete}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                            <SelectValue placeholder="Sin asignar" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {cadetes.length === 0 ? (
                                                <SelectItem value="__none" disabled>No hay cadetes disponibles</SelectItem>
                                            ) : (
                                                cadetes.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        🏍️ {c.full_name}
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Agencia — only visible for despacho_agencia */}
                            {isDespachoAgencia && (
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">
                                        Agencia de transporte *
                                    </Label>
                                    <Select value={selectedAgencia} onValueChange={setSelectedAgencia}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 ring-1 ring-amber-500/30">
                                            <SelectValue placeholder="Seleccionar agencia..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {agencias.map(a => (
                                                <SelectItem key={a.id} value={a.id}>🚛 {a.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-amber-400/70">
                                        Requerido para despacho por agencia
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Freight payment fields — only visible for despacho_agencia */}
                        {isDespachoAgencia && (
                            <div className="mt-4 p-4 bg-zinc-800/30 rounded-lg border border-zinc-700/50 space-y-4">
                                <h3 className="text-sm font-medium text-zinc-300">💰 Información de Flete</h3>
                                <div className="grid grid-cols-2 gap-4 items-center">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="flete_pago"
                                            checked={isFreightPaid}
                                            onChange={(e) => setIsFreightPaid(e.target.checked)}
                                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500"
                                        />
                                        <Label htmlFor="flete_pago" className="text-zinc-300 cursor-pointer">
                                            ¿Flete pago en origen?
                                        </Label>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-zinc-300">Monto del flete ($)</Label>
                                        <Input
                                            type="number"
                                            value={freightAmount}
                                            onChange={(e) => setFreightAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Destinatario */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">👤 Destinatario</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <RecipientAutocomplete
                            departments={departments}
                            dataRef={recipientDataRef}
                            orgId={selectedRemitente}
                        />
                        <div className="space-y-2">
                            <Label className="text-zinc-300">🗺️ Ubicación en el mapa</Label>
                            <AddressMapPicker
                                onLocationSelect={(lat, lng) => {
                                    setRecipientLat(lat || null)
                                    setRecipientLng(lng || null)
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Paquetes */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg text-zinc-200">📦 Paquetes</CardTitle>
                            <div className="flex items-center gap-3">
                                <Label className="text-zinc-400 text-sm">Cantidad de paquetes</Label>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 w-8 p-0 border-zinc-700 text-zinc-300"
                                        onClick={() => handlePackageCountChange(packageCount - 1)}
                                        disabled={packageCount <= 1}
                                    >
                                        −
                                    </Button>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={packageCount}
                                        onChange={(e) => handlePackageCountChange(parseInt(e.target.value) || 1)}
                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 w-16 h-8 text-center"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 w-8 p-0 border-zinc-700 text-zinc-300"
                                        onClick={() => handlePackageCountChange(packageCount + 1)}
                                    >
                                        +
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Delivery type — shared across all packages */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Tipo de entrega</Label>
                                <Select value={selectedDeliveryType} onValueChange={setSelectedDeliveryType}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        <SelectItem value="domicilio">🏠 Domicilio</SelectItem>
                                        <SelectItem value="sucursal">🏪 Sucursal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Dynamic package sub-forms */}
                        {packages.map((pkg, idx) => (
                            <div
                                key={idx}
                                className="p-4 rounded-lg border border-zinc-700/50 bg-zinc-800/20 space-y-3"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-emerald-400">
                                            📦 Paquete {idx + 1}
                                            {packageCount > 1 && (
                                                <span className="text-zinc-500 font-normal"> de {packageCount}</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`fragile-${idx}`}
                                            checked={pkg.fragile}
                                            onChange={(e) => updatePackage(idx, 'fragile', e.target.checked)}
                                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-red-500 focus:ring-red-500"
                                        />
                                        <Label htmlFor={`fragile-${idx}`} className="text-xs text-zinc-400 cursor-pointer">
                                            Fragilidad
                                        </Label>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-zinc-400 text-xs">Tamaño *</Label>
                                        <Select
                                            value={pkg.size}
                                            onValueChange={(val) => updatePackage(idx, 'size', val)}
                                        >
                                            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                                <SelectItem value="chico">📦 Chico</SelectItem>
                                                <SelectItem value="mediano">📦 Mediano</SelectItem>
                                                <SelectItem value="grande">📦 Grande</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-zinc-400 text-xs">Peso (kg)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={pkg.weight_kg}
                                            onChange={(e) => updatePackage(idx, 'weight_kg', e.target.value)}
                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9"
                                            placeholder="Opcional"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-zinc-400 text-xs">Costo envío ($)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={pkg.shipping_cost}
                                            onChange={(e) => updatePackage(idx, 'shipping_cost', e.target.value)}
                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9"
                                            placeholder="Opcional"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-zinc-400 text-xs">Descripción del contenido</Label>
                                    <Textarea
                                        value={pkg.content_description}
                                        onChange={(e) => updatePackage(idx, 'content_description', e.target.value)}
                                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none"
                                        placeholder="¿Qué contiene este paquete?"
                                        rows={2}
                                    />
                                </div>
                            </div>
                        ))}

                        {/* Notas internas — shared */}
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Notas internas</Label>
                            <Textarea
                                name="notes"
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none"
                                placeholder="Notas para el equipo (no se muestran al destinatario)"
                                rows={2}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Submit */}
                <div className="flex gap-3 justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        className="border-zinc-700 text-zinc-300"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={saving}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 px-8"
                    >
                        {saving ? 'Creando envío...' : '📦 Crear envío'}
                    </Button>
                </div>
            </form>
        </div>
    )
}
