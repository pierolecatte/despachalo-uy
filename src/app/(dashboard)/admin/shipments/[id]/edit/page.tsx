'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getStatusLabel, getStatusColor, formatDateUY } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Organization {
    id: string
    name: string
    type: string
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
    created_at: string
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
    const [packageSize, setPackageSize] = useState('mediano')
    const [department, setDepartment] = useState('')

    const isDespachoAgencia = serviceCode === 'despacho_agencia'

    useEffect(() => {
        fetchAll()
    }, [])

    async function fetchAll() {
        setLoading(true)

        const [shipmentRes, orgsRes, deptsRes, servicesRes] = await Promise.all([
            supabase.from('shipments').select('*').eq('id', id).single(),
            supabase.from('organizations').select('id, name, type').eq('active', true).order('name'),
            supabase.from('departments').select('id, name').order('name'),
            supabase.from('service_types').select('id, code').eq('active', true),
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
        setPackageSize(s.package_size)
        setDepartment(s.recipient_department || '')

        // Reverse-lookup service code from service_type_id
        if (s.service_type_id && servicesRes.data) {
            const matched = (servicesRes.data as { id: string; code: string }[]).find(
                st => st.id === s.service_type_id
            )
            if (matched) setServiceCode(matched.code)
        }

        const orgs = orgsRes.data || []
        setRemitentes(orgs.filter((o: Organization) => o.type === 'remitente'))
        setCadeterias(orgs.filter((o: Organization) => o.type === 'cadeteria'))
        setAgencias(orgs.filter((o: Organization) => o.type === 'agencia'))
        setDepartments(deptsRes.data || [])
        setLoading(false)
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        setError('')
        setSuccess('')

        const formData = new FormData(e.currentTarget)

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

        const updateData = {
            status,
            remitente_org_id: remitente,
            cadeteria_org_id: cadeteria || null,
            agencia_org_id: isDespachoAgencia ? (agencia || null) : null,
            service_type_id: serviceTypeId,
            recipient_name: formData.get('recipient_name') as string,
            recipient_phone: (formData.get('recipient_phone') as string) || null,
            recipient_email: (formData.get('recipient_email') as string) || null,
            recipient_address: (formData.get('recipient_address') as string) || null,
            recipient_department: department || null,
            recipient_city: (formData.get('recipient_city') as string) || null,
            delivery_type: deliveryType,
            package_size: packageSize,
            package_count: parseInt(formData.get('package_count') as string) || 1,
            weight_kg: parseFloat(formData.get('weight_kg') as string) || null,
            description: (formData.get('description') as string) || null,
            notes: (formData.get('notes') as string) || null,
            shipping_cost: parseFloat(formData.get('shipping_cost') as string) || null,
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
                                    if (val !== 'despacho_agencia') setAgencia('')
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
                    </CardContent>
                </Card>

                {/* Destinatario */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">👤 Destinatario</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Nombre completo *</Label>
                                <Input name="recipient_name" required defaultValue={shipment.recipient_name}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Teléfono</Label>
                                <Input name="recipient_phone" defaultValue={shipment.recipient_phone || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" placeholder="09X XXX XXX" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Email</Label>
                            <Input name="recipient_email" type="email" defaultValue={shipment.recipient_email || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Dirección</Label>
                            <Input name="recipient_address" defaultValue={shipment.recipient_address || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100" placeholder="Calle, número, apto..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Departamento</Label>
                                <Select value={department} onValueChange={setDepartment}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Ciudad / Localidad</Label>
                                <Input name="recipient_city" defaultValue={shipment.recipient_city || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Paquete */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">📦 Paquete</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
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
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Tamaño</Label>
                                <Select value={packageSize} onValueChange={setPackageSize}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        <SelectItem value="chico">📦 Chico</SelectItem>
                                        <SelectItem value="mediano">📦 Mediano</SelectItem>
                                        <SelectItem value="grande">📦 Grande</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Cantidad</Label>
                                <Input name="package_count" type="number" min="1"
                                    defaultValue={shipment.package_count}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Peso (kg)</Label>
                                <Input name="weight_kg" type="number" step="0.1"
                                    defaultValue={shipment.weight_kg || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" placeholder="Opcional" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Costo de envío ($)</Label>
                                <Input name="shipping_cost" type="number" step="0.01"
                                    defaultValue={shipment.shipping_cost || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100" placeholder="Opcional" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Descripción del contenido</Label>
                            <Textarea name="description" defaultValue={shipment.description || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none" rows={2} />
                        </div>
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
