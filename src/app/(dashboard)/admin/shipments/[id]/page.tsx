'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateUY, getStatusLabel, getStatusColor, getOrgTypeLabel, formatPriceUYU } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface ShipmentDetail {
    id: string
    tracking_code: string
    status: string
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
    service_cost: number | null
    external_tracking: string | null
    pickup_at: string | null
    dispatched_at: string | null
    delivered_at: string | null
    created_at: string
    remitente_org_id: string
    cadeteria_org_id: string | null
    agencia_org_id: string | null
}

interface ShipmentEvent {
    id: string
    event_type: string
    description: string | null
    created_at: string
}

const STATUS_FLOW = ['pendiente', 'levantado', 'despachado', 'en_transito', 'entregado']

const statusIcons: Record<string, string> = {
    pendiente: '⏳',
    levantado: '📥',
    despachado: '🚚',
    en_transito: '🛣️',
    entregado: '✅',
    con_problema: '⚠️',
}

export default function ShipmentDetailPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const supabase = createClient()
    const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
    const [events, setEvents] = useState<ShipmentEvent[]>([])
    const [remitenteName, setRemitenteName] = useState('')
    const [cadeteriaName, setCadeteriaName] = useState('')
    const [agenciaName, setAgenciaName] = useState('')
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)

    useEffect(() => {
        fetchShipment()
    }, [id])

    async function fetchShipment() {
        setLoading(true)

        const { data } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', id)
            .single()

        if (!data) {
            router.push('/admin/shipments')
            return
        }

        setShipment(data as ShipmentDetail)

        // Fetch org names
        if (data.remitente_org_id) {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', data.remitente_org_id).single()
            setRemitenteName(org?.name || '')
        }
        if (data.cadeteria_org_id) {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', data.cadeteria_org_id).single()
            setCadeteriaName(org?.name || '')
        }
        if (data.agencia_org_id) {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', data.agencia_org_id).single()
            setAgenciaName(org?.name || '')
        }

        // Fetch events
        const { data: eventsData } = await supabase
            .from('shipment_events')
            .select('*')
            .eq('shipment_id', id)
            .order('created_at', { ascending: false })

        setEvents((eventsData as ShipmentEvent[]) || [])
        setLoading(false)
    }

    async function changeStatus(newStatus: string) {
        if (!shipment) return
        setUpdating(true)

        const updateData: Record<string, unknown> = { status: newStatus }

        // Set timestamps based on status
        if (newStatus === 'levantado') updateData.pickup_at = new Date().toISOString()
        if (newStatus === 'despachado') updateData.dispatched_at = new Date().toISOString()
        if (newStatus === 'entregado') updateData.delivered_at = new Date().toISOString()

        await supabase.from('shipments').update(updateData).eq('id', shipment.id)

        // Add event
        await supabase.from('shipment_events').insert({
            shipment_id: shipment.id,
            event_type: `status_change_${newStatus}`,
            description: `Estado cambiado a ${getStatusLabel(newStatus)}`
        })

        setUpdating(false)
        fetchShipment()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (!shipment) return null

    const sizeLabels: Record<string, string> = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl font-bold text-zinc-50">Envío</h1>
                        <span className="font-mono text-lg text-emerald-400">{shipment.tracking_code}</span>
                    </div>
                    <p className="text-zinc-400">Creado el {formatDateUY(shipment.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`text-sm px-3 py-1 ${getStatusColor(shipment.status)}`}>
                        {statusIcons[shipment.status]} {getStatusLabel(shipment.status)}
                    </Badge>
                    <Button
                        variant="outline"
                        onClick={() => router.push('/admin/shipments')}
                        className="border-zinc-700 text-zinc-400"
                    >
                        ← Volver
                    </Button>
                </div>
            </div>

            {/* Status Progress Bar */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="py-5">
                    <div className="flex items-center justify-between">
                        {STATUS_FLOW.map((status, i) => {
                            const currentIndex = STATUS_FLOW.indexOf(shipment.status)
                            const isCompleted = i <= currentIndex
                            const isCurrent = status === shipment.status
                            return (
                                <div key={status} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${isCurrent
                                                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                                                : isCompleted
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-zinc-800 text-zinc-500'
                                            }`}>
                                            {statusIcons[status]}
                                        </div>
                                        <span className={`text-xs mt-1.5 ${isCurrent ? 'text-emerald-400 font-medium' : isCompleted ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                            {getStatusLabel(status)}
                                        </span>
                                    </div>
                                    {i < STATUS_FLOW.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-2 mt-[-16px] ${isCompleted && i < currentIndex ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Quick Status Change */}
            {shipment.status !== 'entregado' && (
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="py-4 flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Cambiar estado:</span>
                        <div className="flex gap-2">
                            <Select onValueChange={changeStatus} disabled={updating}>
                                <SelectTrigger className="w-48 bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9">
                                    <SelectValue placeholder={updating ? 'Actualizando...' : 'Seleccionar...'} />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700">
                                    {STATUS_FLOW.filter(s => s !== shipment.status).map(s => (
                                        <SelectItem key={s} value={s}>
                                            {statusIcons[s]} {getStatusLabel(s)}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="con_problema">⚠️ Con problema</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Destinatario */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-zinc-200">👤 Destinatario</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <InfoRow label="Nombre" value={shipment.recipient_name} />
                        <InfoRow label="Teléfono" value={shipment.recipient_phone} />
                        <InfoRow label="Email" value={shipment.recipient_email} />
                        <InfoRow label="Dirección" value={shipment.recipient_address} />
                        <InfoRow label="Departamento" value={shipment.recipient_department} />
                        <InfoRow label="Ciudad" value={shipment.recipient_city} />
                    </CardContent>
                </Card>

                {/* Paquete */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-zinc-200">📦 Paquete</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <InfoRow label="Tipo entrega" value={shipment.delivery_type === 'domicilio' ? '🏠 Domicilio' : '🏪 Sucursal'} />
                        <InfoRow label="Tamaño" value={sizeLabels[shipment.package_size]} />
                        <InfoRow label="Cantidad" value={String(shipment.package_count)} />
                        <InfoRow label="Peso" value={shipment.weight_kg ? `${shipment.weight_kg} kg` : null} />
                        <InfoRow label="Descripción" value={shipment.description} />
                        <InfoRow label="Notas" value={shipment.notes} />
                    </CardContent>
                </Card>

                {/* Organizaciones */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-zinc-200">🏢 Organizaciones</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <InfoRow label="Remitente" value={remitenteName} />
                        <InfoRow label="Cadetería" value={cadeteriaName} />
                        <InfoRow label="Agencia" value={agenciaName} />
                    </CardContent>
                </Card>

                {/* Costos y Fechas */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-zinc-200">💰 Costos y Fechas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <InfoRow label="Costo envío" value={shipment.shipping_cost ? formatPriceUYU(shipment.shipping_cost) : null} />
                        <InfoRow label="Costo servicio" value={shipment.service_cost ? formatPriceUYU(shipment.service_cost) : null} />
                        <Separator className="bg-zinc-800" />
                        <InfoRow label="Levantado" value={shipment.pickup_at ? formatDateUY(shipment.pickup_at) : null} />
                        <InfoRow label="Despachado" value={shipment.dispatched_at ? formatDateUY(shipment.dispatched_at) : null} />
                        <InfoRow label="Entregado" value={shipment.delivered_at ? formatDateUY(shipment.delivered_at) : null} />
                    </CardContent>
                </Card>
            </div>

            {/* Timeline */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base text-zinc-200">📋 Historial de eventos</CardTitle>
                </CardHeader>
                <CardContent>
                    {events.length === 0 ? (
                        <p className="text-zinc-500 text-sm py-4 text-center">Sin eventos registrados</p>
                    ) : (
                        <div className="space-y-0">
                            {events.map((event, i) => (
                                <div key={event.id} className="flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-3 h-3 rounded-full mt-1.5 ${i === 0 ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                        {i < events.length - 1 && <div className="w-px flex-1 bg-zinc-800" />}
                                    </div>
                                    <div className="pb-5">
                                        <p className="text-sm text-zinc-200">{event.description || event.event_type}</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">{formatDateUY(event.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-sm text-zinc-200">{value || '—'}</span>
        </div>
    )
}
