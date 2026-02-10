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

export default function NewShipmentPage() {
    const router = useRouter()
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [remitentes, setRemitentes] = useState<Organization[]>([])
    const [cadeterias, setCadeterias] = useState<Organization[]>([])
    const [agencias, setAgencias] = useState<Organization[]>([])
    const [departments, setDepartments] = useState<Department[]>([])

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        const [orgsRes, deptsRes] = await Promise.all([
            supabase.from('organizations').select('id, name, type').eq('active', true).order('name'),
            supabase.from('departments').select('id, name').order('name'),
        ])
        const orgs = orgsRes.data || []
        setRemitentes(orgs.filter((o: Organization) => o.type === 'remitente'))
        setCadeterias(orgs.filter((o: Organization) => o.type === 'cadeteria'))
        setAgencias(orgs.filter((o: Organization) => o.type === 'agencia'))
        setDepartments(deptsRes.data || [])
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        setError('')

        const formData = new FormData(e.currentTarget)

        const shipmentData = {
            tracking_code: generateTrackingCode(),
            remitente_org_id: formData.get('remitente_org_id') as string,
            cadeteria_org_id: (formData.get('cadeteria_org_id') as string) || null,
            agencia_org_id: (formData.get('agencia_org_id') as string) || null,
            status: 'pendiente' as const,
            recipient_name: formData.get('recipient_name') as string,
            recipient_phone: (formData.get('recipient_phone') as string) || null,
            recipient_email: (formData.get('recipient_email') as string) || null,
            recipient_address: (formData.get('recipient_address') as string) || null,
            recipient_department: (formData.get('recipient_department') as string) || null,
            recipient_city: (formData.get('recipient_city') as string) || null,
            delivery_type: (formData.get('delivery_type') as string) || 'domicilio',
            package_size: (formData.get('package_size') as string) || 'mediano',
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
                {/* Organizaciones */}
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-zinc-200">🏢 Organizaciones</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Remitente *</Label>
                            <Select name="remitente_org_id" required>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Cadetería</Label>
                                <Select name="cadeteria_org_id">
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
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Agencia de transporte</Label>
                                <Select name="agencia_org_id">
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Sin asignar" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {agencias.map(a => (
                                            <SelectItem key={a.id} value={a.id}>🚛 {a.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
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
                            <Label className="text-zinc-300">Dirección</Label>
                            <Input
                                name="recipient_address"
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                placeholder="Calle, número, apto..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Departamento</Label>
                                <Select name="recipient_department">
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
                                <Select name="delivery_type" defaultValue="domicilio">
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
                                <Select name="package_size" defaultValue="mediano">
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
