'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getStatusLabel, getStatusColor, formatDateUY } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import RecipientAutocomplete from '@/components/shipments/recipient-autocomplete'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import dynamic from 'next/dynamic'

const AddressMapPicker = dynamic(
    () => import('@/components/shipments/address-map-picker'),
    { ssr: false, loading: () => <div className="w-full h-[250px] bg-zinc-800/50 rounded-lg animate-pulse" /> }
)

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

interface ShipmentRow {
    id: string
    tracking_code: string
    status: string
    remitente_org_id: string
    cadeteria_org_id: string | null
    agencia_org_id: string | null
    service_type_id: string | null
    recipient_name: string
    recipient_phone: string | null
    recipient_email: string | null
    recipient_address: string | null
    recipient_department: string | null
    recipient_city: string | null
    delivery_type: string
    package_size: string
    package_count: number
    weight_kg: number | null
    description: string | null
    notes: string | null
    shipping_cost: number | null
    recipient_observations: string | null
    recipient_lat: number | null
    recipient_lng: number | null
    is_freight_paid: boolean
    freight_amount: number | null
    cadete_user_id: string | null
    created_at: string
}

interface PackageFormData {
    id?: string  // existing package id (for tracking)
    size: string
    weight_kg: string
    shipping_cost: string
    content_description: string
    fragile?: boolean
}

const SERVICE_TYPE_OPTIONS = [
    { code: 'express_24h', label: '⚡ Express 24hs' },
    { code: 'comun_48h', label: '📦 Común 48hs' },
    { code: 'despacho_agencia', label: '🚛 Despacho Agencia' },
    { code: 'por_km', label: '📍 Por kilómetro' },
    { code: 'por_horas', label: '⏱️ Por horas' },
    { code: 'especial', label: '⭐ Especial' },
]

const STATUS_OPTIONS = [
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'levantado', label: 'Levantado' },
    { value: 'despachado', label: 'Despachado' },
    { value: 'en_transito', label: 'En tránsito' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'con_problema', label: 'Con problema' },
]

function createDefaultPackage(): PackageFormData {
    return { size: 'mediano', weight_kg: '', shipping_cost: '', content_description: '', fragile: false }
}

export default function EditShipmentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Data lists
    const [remitentes, setRemitentes] = useState<Organization[]>([])
    const [cadeterias, setCadeterias] = useState<Organization[]>([])
    const [agencias, setAgencias] = useState<Organization[]>([])
    const [departments, setDepartments] = useState<Department[]>([])

    // Shipment state (controlled)
    const [shipment, setShipment] = useState<ShipmentRow | null>(null)
    const [status, setStatus] = useState('')
    const [remitente, setRemitente] = useState('')
    const [cadeteria, setCadeteria] = useState('')
    const [agencia, setAgencia] = useState('')
    const [serviceCode, setServiceCode] = useState('')
    const [deliveryType, setDeliveryType] = useState('domicilio')
    const [department, setDepartment] = useState('')
    const [recipientLat, setRecipientLat] = useState<number | null>(null)
    const [recipientLng, setRecipientLng] = useState<number | null>(null)
    const [isFreightPaid, setIsFreightPaid] = useState(false)
    const [freightAmount, setFreightAmount] = useState('')
    const [cadetes, setCadetes] = useState<CadeteUser[]>([])
    const [selectedCadete, setSelectedCadete] = useState('')

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

    const isDespachoAgencia = serviceCode === 'despacho_agencia'

    useEffect(() => {
        fetchAll()
    }, [])

    // Fetch cadetes when cadeteria changes
    useEffect(() => {
        setCadetes([])
        // Don't reset selectedCadete if we're loading initial data
        if (!cadeteria) {
            setSelectedCadete('')
            return
        }
        async function fetchCadetes() {
            const { data } = await supabase
                .from('users')
                .select('id, full_name, email')
                .eq('org_id', cadeteria)
                .eq('role', 'cadete')
                .eq('active', true)
                .order('full_name')
            setCadetes((data as CadeteUser[]) || [])
        }
        fetchCadetes()
    }, [cadeteria])

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
            // @ts-ignore
            updated[index] = { ...updated[index], [field]: value }
            return updated
        })
    }

    async function fetchAll() {
        setLoading(true)

        const [shipmentRes, orgsRes, deptsRes, servicesRes] = await Promise.all([
            supabase.from('shipments').select('*').eq('id', id).single(),
            supabase.from('organizations').select('id, name, type').eq('active', true).order('name'),
            supabase.from('departments').select('id, name').order('name'),
            supabase.from('service_types').select('id, code'),
        ])

        if (!shipmentRes.data) {
            setError('Envío no encontrado')
            setLoading(false)
            return
        }

        const s = shipmentRes.data as ShipmentRow
        setShipment(s)

        // Set controlled state from loaded data
        setStatus(s.status)
        setRemitente(s.remitente_org_id)
        setCadeteria(s.cadeteria_org_id || '')
        setAgencia(s.agencia_org_id || '')
        setDeliveryType(s.delivery_type)
        setDepartment(s.recipient_department || '')
        setRecipientLat(s.recipient_lat || null)
        setRecipientLng(s.recipient_lng || null)
        setIsFreightPaid(s.is_freight_paid || false)
        setFreightAmount(s.freight_amount?.toString() || '')
        setSelectedCadete(s.cadete_user_id || '')

        // Reverse-lookup service code from service_type_id
        if (s.service_type_id && servicesRes.data) {
            const matched = (servicesRes.data as { id: string; code: string }[]).find(
                st => st.id === s.service_type_id
            )
            if (matched) {
                setServiceCode(matched.code)
            }
        }

        const orgs = orgsRes.data || []
        setRemitentes(orgs.filter((o: Organization) => o.type === 'remitente'))
        setCadeterias(orgs.filter((o: Organization) => o.type === 'cadeteria'))
        setAgencias(orgs.filter((o: Organization) => o.type === 'agencia'))
        setDepartments(deptsRes.data || [])

        // Load existing packages
        const { data: existingPackages } = await supabase
            .from('shipment_packages')
            .select('id, index, size, weight_kg, shipping_cost, content_description, fragile')
            .eq('shipment_id', id)
            .order('index', { ascending: true })

        if (existingPackages && existingPackages.length > 0) {
            const pkgForms: PackageFormData[] = existingPackages.map(p => ({
                id: p.id,
                size: p.size || 'mediano',
                weight_kg: p.weight_kg?.toString() || '',
                shipping_cost: p.shipping_cost?.toString() || '',
                content_description: p.content_description || '',
                // @ts-ignore
                fragile: p.fragile || false
            }))
            setPackages(pkgForms)
            setPackageCount(pkgForms.length)
        } else {
            // Legacy: no packages, create default from shipment data
            setPackages([{
                size: s.package_size || 'mediano',
                weight_kg: s.weight_kg?.toString() || '',
                shipping_cost: s.shipping_cost?.toString() || '',
                content_description: s.description || '',
            }])
            setPackageCount(s.package_count || 1)
        }

        setLoading(false)
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        setError('')
        setSuccess('')

        // Find service_type_id from code
        let serviceTypeId: string | null = null
        if (serviceCode) {
            const { data: stData } = await supabase
                .from('service_types')
                .select('id')
                .eq('code', serviceCode)
                .single()
            serviceTypeId = stData?.id || null
        }

        const previousStatus = shipment?.status

        const rd = recipientDataRef.current

        // Use first package's data as shipment-level defaults
        const firstPkg = packages[0]

        const updateData = {
            status,
            remitente_org_id: remitente,
            cadeteria_org_id: cadeteria || null,
            cadete_user_id: (cadeteria && selectedCadete) ? selectedCadete : null,
            agencia_org_id: isDespachoAgencia ? (agencia || null) : null,
            service_type_id: serviceTypeId,
            recipient_name: rd?.recipientName || (document.querySelector<HTMLInputElement>('[name="recipient_name"]')?.value) || shipment?.recipient_name || '',
            recipient_phone: rd?.recipientPhone || (document.querySelector<HTMLInputElement>('[name="recipient_phone"]')?.value) || null,
            recipient_email: rd?.recipientEmail || (document.querySelector<HTMLInputElement>('[name="recipient_email"]')?.value) || null,
            recipient_address: rd?.recipientAddress || (document.querySelector<HTMLInputElement>('[name="recipient_address"]')?.value) || null,
            recipient_department: rd?.recipientDepartment || department || null,
            recipient_city: rd?.recipientCity || (document.querySelector<HTMLInputElement>('[name="recipient_city"]')?.value) || null,
            delivery_type: deliveryType,
            package_size: firstPkg.size || 'mediano',
            package_count: packageCount,
            weight_kg: parseFloat(firstPkg.weight_kg) || null,
            description: firstPkg.content_description || null,
            notes: (document.querySelector<HTMLTextAreaElement>('[name="notes"]')?.value) || null,
            shipping_cost: parseFloat(firstPkg.shipping_cost) || null,
            recipient_observations: rd?.recipientObservations || (document.querySelector<HTMLTextAreaElement>('[name="recipient_observations"]')?.value) || null,
            recipient_lat: recipientLat,
            recipient_lng: recipientLng,
            is_freight_paid: isDespachoAgencia ? isFreightPaid : false,
            freight_amount: (isDespachoAgencia && freightAmount) ? parseFloat(freightAmount) : null,
        }

        // Update timestamp fields based on status change
        if (status === 'levantado' && previousStatus !== 'levantado') {
            Object.assign(updateData, { pickup_at: new Date().toISOString() })
        }
        if (status === 'despachado' && previousStatus !== 'despachado') {
            Object.assign(updateData, { dispatched_at: new Date().toISOString() })
        }
        if (status === 'entregado' && previousStatus !== 'entregado') {
            Object.assign(updateData, { delivered_at: new Date().toISOString() })
        }

        const { error: updateError } = await supabase
            .from('shipments')
            .update(updateData)
            .eq('id', id)

        if (updateError) {
            setError(updateError.message)
            setSaving(false)
            return
        }

        // Replace packages: delete existing, insert new
        await supabase
            .from('shipment_packages')
            .delete()
            .eq('shipment_id', id)

        const packageInserts = packages.map((pkg, idx) => ({
            shipment_id: id,
            index: idx + 1,
            size: pkg.size || 'mediano',
            weight_kg: parseFloat(pkg.weight_kg) || null,
            shipping_cost: parseFloat(pkg.shipping_cost) || null,
            content_description: pkg.content_description || null,
            fragile: pkg.fragile || false
        }))

        const { error: pkgError } = await supabase
            .from('shipment_packages')
            .insert(packageInserts)

        if (pkgError) {
            console.error('Error updating packages:', pkgError)
        }

        // Log event if status changed
        if (status !== previousStatus) {
            await supabase.from('shipment_events').insert({
                shipment_id: id,
                event_type: 'status_change',
                description: `Estado cambiado de ${getStatusLabel(previousStatus || '')} a ${getStatusLabel(status)}`,
                metadata: { from: previousStatus, to: status },
            })
        }

        setSuccess('Envío actualizado correctamente')
        setSaving(false)

        // Redirect after brief pause so user sees the success message
        setTimeout(() => router.push(`/admin/shipments/${id}`), 1200)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500" />
            </div>
        )
    }

    if (!shipment) {
        return (
            <div className="text-center py-20">
                <p className="text-zinc-400 text-lg">Envío no encontrado</p>
                <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300" onClick={() => router.push('/admin/shipments')}>
                    ← Volver a envíos
                </Button>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Editar Envío</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-zinc-400 font-mono text-sm">{shipment.tracking_code}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500 text-sm">Creado {formatDateUY(shipment.created_at)}</span>
                        <Badge variant="outline" className={getStatusColor(shipment.status)}>
                            {getStatusLabel(shipment.status)}
                        </Badge>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/admin/shipments/${id}`)}
                        className="border-zinc-700 text-zinc-400"
                    >
                        👁️ Ver detalle
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => router.back()}
                        className="border-zinc-700 text-zinc-400"
                    >
                        ← Volver
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    ⚠️ {error}
                </div>
            )}
            {success && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                    ✅ {success}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Estado */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">🔄 Estado del envío</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-2">
                            {STATUS_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setStatus(opt.value)}
                                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${status === opt.value
                                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30'
                                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Remitente y Servicio */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">🏢 Remitente y Servicio</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Remitente *</Label>
                                <Select value={remitente} onValueChange={setRemitente}>
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
                                <Label className="text-zinc-300">Tipo de servicio</Label>
                                <Select value={serviceCode} onValueChange={(val) => {
                                    setServiceCode(val)
                                    if (val !== 'despacho_agencia') {
                                        setAgencia('')
                                        setIsFreightPaid(false)
                                        setFreightAmount('')
                                    }
                                }}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar servicio..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {SERVICE_TYPE_OPTIONS.map(s => (
                                            <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Cadetería</Label>
                                <Select value={cadeteria} onValueChange={setCadeteria}>
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
                            {cadeteria && (
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
                            {isDespachoAgencia && (
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Agencia de transporte *</Label>
                                    <Select value={agencia} onValueChange={setAgencia}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 ring-1 ring-amber-500/30">
                                            <SelectValue placeholder="Seleccionar agencia..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {agencias.map(a => (
                                                <SelectItem key={a.id} value={a.id}>🚛 {a.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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
                            orgId={remitente}
                            initialData={{
                                recipientName: shipment.recipient_name,
                                recipientPhone: shipment.recipient_phone || '',
                                recipientEmail: shipment.recipient_email || '',
                                recipientAddress: shipment.recipient_address || '',
                                recipientCity: shipment.recipient_city || '',
                                recipientDepartment: shipment.recipient_department || '',
                                recipientObservations: shipment.recipient_observations || '',
                                recipientId: (shipment as ShipmentRow & { recipient_id?: string | null }).recipient_id || null,
                                recipientAddressId: (shipment as ShipmentRow & { recipient_address_id?: string | null }).recipient_address_id || null,
                                departmentId: (shipment as ShipmentRow & { department_id?: number | null }).department_id || null,
                                localityId: (shipment as ShipmentRow & { locality_id?: number | null }).locality_id || null,
                                localityManual: (shipment as ShipmentRow & { locality_manual?: string | null }).locality_manual || null,
                            }}
                        />
                        <div className="space-y-2">
                            <Label className="text-zinc-300">🗺️ Ubicación en el mapa</Label>
                            <AddressMapPicker
                                initialLat={shipment.recipient_lat}
                                initialLng={shipment.recipient_lng}
                                initialAddress={shipment.recipient_address || ''}
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
                                <Select value={deliveryType} onValueChange={setDeliveryType}>
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
                                            checked={pkg.fragile || false}
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
                            <Textarea name="notes" defaultValue={shipment.notes || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none" rows={2} />
                        </div>
                    </CardContent>
                </Card>

                {/* Submit */}
                <div className="flex gap-3 justify-end">
                    <Button type="button" variant="outline"
                        onClick={() => router.push(`/admin/shipments/${id}`)}
                        className="border-zinc-700 text-zinc-300"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={saving}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 px-8"
                    >
                        {saving ? 'Guardando...' : '💾 Guardar cambios'}
                    </Button>
                </div>
            </form>
        </div>
    )
}
