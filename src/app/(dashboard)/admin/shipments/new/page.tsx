'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { generateTrackingCode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

interface ServiceType {
    id: string
    code: string
    name: string
    description: string | null
    pricing_mode: string
    base_price: number | null
}

const SERVICE_TYPE_OPTIONS = [
    { code: 'express_24h', label: '⚡ Express 24hs', description: 'Entrega garantizada en 24 horas' },
    { code: 'comun_48h', label: '📦 Común 48hs', description: 'Entrega estándar en 48 horas' },
    { code: 'despacho_agencia', label: '🚛 Despacho Agencia', description: 'Envío a través de agencia de transporte' },
    { code: 'por_km', label: '📍 Por kilómetro', description: 'Tarifa basada en distancia' },
    { code: 'por_horas', label: '⏱️ Por horas', description: 'Tarifa basada en tiempo' },
    { code: 'especial', label: '⭐ Especial', description: 'Servicio personalizado' },
]

export default function NewShipmentPage() {
    const router = useRouter()
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [remitentes, setRemitentes] = useState<Organization[]>([])
    const [cadeterias, setCadeterias] = useState<Organization[]>([])
    const [agencias, setAgencias] = useState<Organization[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])

    // Controlled state for conditional logic
    const [selectedServiceCode, setSelectedServiceCode] = useState('')
    const [selectedAgencia, setSelectedAgencia] = useState('')
    const [selectedCadeteria, setSelectedCadeteria] = useState('')
    const [selectedRemitente, setSelectedRemitente] = useState('')
    const [selectedDepartment, setSelectedDepartment] = useState('')
    const [selectedDeliveryType, setSelectedDeliveryType] = useState('domicilio')
    const [selectedSize, setSelectedSize] = useState('mediano')

    const isDespachoAgencia = selectedServiceCode === 'despacho_agencia'

    useEffect(() => {
        fetchData()
    }, [])

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

        const shipmentData = {
            tracking_code: generateTrackingCode(),
            remitente_org_id: selectedRemitente,
            cadeteria_org_id: selectedCadeteria || null,
            agencia_org_id: isDespachoAgencia ? (selectedAgencia || null) : null,
            service_type_id: matchingService?.id || null,
            status: 'pendiente' as const,
            recipient_name: formData.get('recipient_name') as string,
            recipient_phone: (formData.get('recipient_phone') as string) || null,
            recipient_email: (formData.get('recipient_email') as string) || null,
            recipient_address: (formData.get('recipient_address') as string) || null,
            recipient_department: selectedDepartment || null,
            recipient_city: (formData.get('recipient_city') as string) || null,
            delivery_type: selectedDeliveryType,
            package_size: selectedSize,
            package_count: parseInt(formData.get('package_count') as string) || 1,
            weight_kg: parseFloat(formData.get('weight_kg') as string) || null,
            description: (formData.get('description') as string) || null,
            notes: (formData.get('notes') as string) || null,
            shipping_cost: parseFloat(formData.get('shipping_cost') as string) || null,
        }

        const { error: insertError } = await supabase.from('shipments').insert(shipmentData)

        if (insertError) {
            setError(insertError.message)
            setSaving(false)
            return
        }

        router.push('/admin/shipments')
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
                                    }
                                }}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar servicio..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {SERVICE_TYPE_OPTIONS.map(s => (
                                            <SelectItem key={s.code} value={s.code}>
                                                {s.label}
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
                                    ℹ️ {SERVICE_TYPE_OPTIONS.find(s => s.code === selectedServiceCode)?.description}
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
                                <Input
                                    name="recipient_name"
                                    required
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                    placeholder="Nombre del destinatario"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Teléfono</Label>
                                <Input
                                    name="recipient_phone"
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                    placeholder="09X XXX XXX"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Email</Label>
                            <Input
                                name="recipient_email"
                                type="email"
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                placeholder="destinatario@email.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Dirección *</Label>
                            <Input
                                name="recipient_address"
                                required
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                placeholder="Calle, número, apto..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Departamento</Label>
                                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
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
                                <Input
                                    name="recipient_city"
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                    placeholder="Ciudad"
                                />
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
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Tamaño</Label>
                                <Select value={selectedSize} onValueChange={setSelectedSize}>
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
                                <Input
                                    name="package_count"
                                    type="number"
                                    min="1"
                                    defaultValue="1"
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Peso (kg)</Label>
                                <Input
                                    name="weight_kg"
                                    type="number"
                                    step="0.1"
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Costo de envío ($)</Label>
                                <Input
                                    name="shipping_cost"
                                    type="number"
                                    step="0.01"
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                    placeholder="Opcional"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Descripción del contenido</Label>
                            <Textarea
                                name="description"
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none"
                                placeholder="¿Qué contiene el paquete?"
                                rows={2}
                            />
                        </div>
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
