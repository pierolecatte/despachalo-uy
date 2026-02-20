'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateUY, getStatusLabel, getStatusColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Shipment {
    id: string
    tracking_code: string
    status: string
    recipient_name: string
    recipient_phone: string | null
    recipient_department: string | null
    recipient_city: string | null
    delivery_type: string
    package_size: string
    package_count: number
    shipping_cost: number | null
    created_at: string
    remitente: { id: string; name: string } | null
    cadeteria: { id: string; name: string } | null
    agencia: { id: string; name: string } | null
}

interface Organization {
    id: string
    name: string
    type: string
}

const STATUSES = [
    { value: 'all', label: 'Todos' },
    { value: 'pendiente', label: '⏳ Pendiente' },
    { value: 'levantado', label: '📥 Levantado' },
    { value: 'despachado', label: '🚚 Despachado' },
    { value: 'en_transito', label: '🛣️ En tránsito' },
    { value: 'entregado', label: '✅ Entregado' },
    { value: 'con_problema', label: '⚠️ Con problema' },
]

const BULK_STATUSES = [
    { value: 'pendiente', label: '⏳ Pendiente' },
    { value: 'levantado', label: '📥 Levantado' },
    { value: 'despachado', label: '🚚 Despachado' },
    { value: 'en_transito', label: '🛣️ En tránsito' },
    { value: 'entregado', label: '✅ Entregado' },
    { value: 'con_problema', label: '⚠️ Con problema' },
]

const PAGE_SIZE = 20

export default function ShipmentsPage() {
    const [shipments, setShipments] = useState<Shipment[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)

    // Filters
    const [filterStatus, setFilterStatus] = useState('all')
    const [filterRemitente, setFilterRemitente] = useState('all')
    const [filterCadeteria, setFilterCadeteria] = useState('all')
    const [filterDateFrom, setFilterDateFrom] = useState('')
    const [filterDateTo, setFilterDateTo] = useState('')
    const [search, setSearch] = useState('')

    // Orgs for filter dropdowns
    const [remitentes, setRemitentes] = useState<Organization[]>([])
    const [cadeterias, setCadeterias] = useState<Organization[]>([])

    // Bulk actions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkStatus, setBulkStatus] = useState('')
    const [bulkUpdating, setBulkUpdating] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [bulkMessage, setBulkMessage] = useState('')

    const supabase = createClient()

    useEffect(() => {
        fetchOrgs()
    }, [])

    async function fetchOrgs() {
        const { data } = await supabase
            .from('organizations')
            .select('id, name, type')
            .eq('active', true)
            .order('name')
        if (data) {
            setRemitentes(data.filter((o: Organization) => o.type === 'remitente'))
            setCadeterias(data.filter((o: Organization) => o.type === 'cadeteria'))
        }
    }

    const fetchShipments = useCallback(async () => {
        setLoading(true)

        let query = supabase
            .from('shipments')
            .select(`
        id, tracking_code, status, recipient_name, recipient_phone,
        recipient_department, recipient_city, delivery_type, package_size,
        package_count, shipping_cost, created_at,
        remitente:organizations!shipments_remitente_org_id_fkey(id, name),
        cadeteria:organizations!shipments_cadeteria_org_id_fkey(id, name),
        agencia:organizations!shipments_agencia_org_id_fkey(id, name)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (filterStatus !== 'all') {
            query = query.eq('status', filterStatus)
        }
        if (filterRemitente !== 'all') {
            query = query.eq('remitente_org_id', filterRemitente)
        }
        if (filterCadeteria !== 'all') {
            query = query.eq('cadeteria_org_id', filterCadeteria)
        }
        if (filterDateFrom) {
            query = query.gte('created_at', filterDateFrom + 'T00:00:00')
        }
        if (filterDateTo) {
            query = query.lte('created_at', filterDateTo + 'T23:59:59')
        }
        if (search) {
            query = query.or(
                `recipient_name.ilike.%${search}%,tracking_code.ilike.%${search}%,recipient_city.ilike.%${search}%`
            )
        }

        const { data, count } = await query
        setShipments((data as unknown as Shipment[]) || [])
        setTotalCount(count || 0)
        setLoading(false)
    }, [page, filterStatus, filterRemitente, filterCadeteria, filterDateFrom, filterDateTo, search])

    useEffect(() => {
        fetchShipments()
    }, [fetchShipments])

    function handleFilter() {
        setPage(0)
        fetchShipments()
    }

    function clearFilters() {
        setFilterStatus('all')
        setFilterRemitente('all')
        setFilterCadeteria('all')
        setFilterDateFrom('')
        setFilterDateTo('')
        setSearch('')
        setPage(0)
    }

    // ---- Bulk selection ----
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleSelectAll() {
        if (selectedIds.size === shipments.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(shipments.map(s => s.id)))
        }
    }

    async function executeBulkStatusChange() {
        if (!bulkStatus || selectedIds.size === 0) return
        setBulkUpdating(true)
        setBulkMessage('')

        const ids = Array.from(selectedIds)

        // Update all selected shipments
        const { error } = await supabase
            .from('shipments')
            .update({ status: bulkStatus })
            .in('id', ids)

        if (error) {
            setBulkMessage(`❌ Error: ${error.message}`)
            setBulkUpdating(false)
            return
        }

        // Update timestamps based on status
        const timestampField: Record<string, string> = {
            levantado: 'pickup_at',
            despachado: 'dispatched_at',
            entregado: 'delivered_at',
        }
        if (timestampField[bulkStatus]) {
            await supabase
                .from('shipments')
                .update({ [timestampField[bulkStatus]]: new Date().toISOString() })
                .in('id', ids)
        }

        // Insert events for each shipment
        const events = ids.map(shipmentId => ({
            shipment_id: shipmentId,
            event_type: 'status_change',
            description: `Estado cambiado masivamente a ${getStatusLabel(bulkStatus)}`,
            metadata: { to: bulkStatus, bulk: true },
        }))
        await supabase.from('shipment_events').insert(events)

        setBulkMessage(`✅ ${ids.length} envíos actualizados a "${getStatusLabel(bulkStatus)}"`)
        setSelectedIds(new Set())
        setBulkStatus('')
        setBulkUpdating(false)
        fetchShipments()
    }

    async function executeBulkDelete() {
        if (selectedIds.size === 0) return

        if (!confirm('¿Estás seguro que deseas eliminar los envíos seleccionados?\n\nIMPORTANTE: Solo se eliminarán los envíos que estén en estado "Pendiente". Los demás permanecerán intactos.')) {
            return
        }

        setBulkDeleting(true)
        setBulkMessage('')

        const ids = Array.from(selectedIds)

        // Delete only pending shipments
        const { error, count } = await supabase
            .from('shipments')
            .delete({ count: 'exact' })
            .in('id', ids)
            .eq('status', 'pendiente')

        if (error) {
            setBulkMessage(`❌ Error al eliminar: ${error.message}`)
            setBulkDeleting(false)
            return
        }

        setBulkMessage(`✅ ${count} envíos eliminados correctamente (solo pendientes).`)
        setSelectedIds(new Set())
        setBulkDeleting(false)
        fetchShipments()
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    const sizeLabels: Record<string, string> = {
        chico: 'Chico',
        mediano: 'Mediano',
        grande: 'Grande',
    }
    const allSelected = shipments.length > 0 && selectedIds.size === shipments.length

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Gestión de Envíos</h1>
                    <p className="text-zinc-400 mt-1">
                        Mostrando {shipments.length} de {totalCount} envíos totales
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/admin/shipments/import">
                        <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800">
                            📥 Importar
                        </Button>
                    </Link>
                    <Link href="/admin/shipments/new">
                        <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                            ➕ Nuevo envío
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-5">
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">Filtros de búsqueda</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Estado</Label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                {STATUSES.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Remitente</Label>
                        <Select value={filterRemitente} onValueChange={setFilterRemitente}>
                            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                <SelectItem value="all">Todos</SelectItem>
                                {remitentes.map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Cadetería</Label>
                        <Select value={filterCadeteria} onValueChange={setFilterCadeteria}>
                            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                <SelectItem value="all">Todas</SelectItem>
                                {cadeterias.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Desde</Label>
                        <Input
                            type="date"
                            value={filterDateFrom}
                            onChange={e => setFilterDateFrom(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Hasta</Label>
                        <Input
                            type="date"
                            value={filterDateTo}
                            onChange={e => setFilterDateTo(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">Buscar</Label>
                        <Input
                            placeholder="Destinatario, tracking..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-9"
                        />
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        size="sm"
                        onClick={handleFilter}
                        className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                    >
                        🔍 Filtrar
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={clearFilters}
                        className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    >
                        🧹 Limpiar
                    </Button>
                </div>
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedIds.size > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm">
                            {selectedIds.size}
                        </div>
                        <span className="text-sm text-amber-200">
                            envío{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={bulkStatus} onValueChange={setBulkStatus}>
                            <SelectTrigger className="w-48 bg-zinc-800/80 border-zinc-700 text-zinc-100 h-9">
                                <SelectValue placeholder="Cambiar estado a..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                                {BULK_STATUSES.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            disabled={!bulkStatus || bulkUpdating}
                            onClick={executeBulkStatusChange}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-medium px-4"
                        >
                            {bulkUpdating ? 'Actualizando...' : '⚡ Aplicar'}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                const res = await fetch('/api/labels/generate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ shipment_ids: Array.from(selectedIds) }),
                                })
                                if (res.ok) {
                                    const blob = await res.blob()
                                    const url = URL.createObjectURL(blob)
                                    window.open(url, '_blank')
                                } else {
                                    const err = await res.json()
                                    console.error('Label generation error:', err)
                                    alert(`Error: ${err.error}\n\nDebug: ${JSON.stringify(err.debug || {}, null, 2)}`)
                                }
                            }}
                            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        >
                            🏷️ Imprimir etiquetas
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={bulkUpdating || bulkDeleting}
                            onClick={executeBulkDelete}
                            className="bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                        >
                            {bulkDeleting ? 'Eliminando...' : '🗑️ Eliminar'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setSelectedIds(new Set()); setBulkStatus('') }}
                            className="text-zinc-400 hover:text-zinc-200"
                        >
                            ✕ Cancelar
                        </Button>
                    </div>
                </div>
            )}

            {/* Bulk message */}
            {bulkMessage && (
                <div className={`p-3 rounded-lg text-sm ${bulkMessage.startsWith('✅')
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {bulkMessage}
                </div>
            )}

            {/* Table */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-zinc-400 w-[40px]">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                    className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                                />
                            </TableHead>
                            <TableHead className="text-zinc-400 w-[100px]">Tracking</TableHead>
                            <TableHead className="text-zinc-400">Fecha</TableHead>
                            <TableHead className="text-zinc-400">Remitente</TableHead>
                            <TableHead className="text-zinc-400">Destinatario</TableHead>
                            <TableHead className="text-zinc-400">Cadetería</TableHead>
                            <TableHead className="text-zinc-400">Tipo</TableHead>
                            <TableHead className="text-zinc-400">Estado</TableHead>
                            <TableHead className="text-zinc-400">Zona</TableHead>
                            <TableHead className="text-zinc-400 text-right">Costo</TableHead>
                            <TableHead className="text-zinc-400 text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={11} className="text-center text-zinc-500 py-10">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                        Cargando envíos...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : shipments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="text-center text-zinc-500 py-16">
                                    <div className="space-y-2">
                                        <span className="text-4xl">📦</span>
                                        <p className="text-zinc-400">No se encontraron envíos</p>
                                        <Link href="/admin/shipments/new">
                                            <Button size="sm" className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white">
                                                Crear el primer envío
                                            </Button>
                                        </Link>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            shipments.map(shipment => (
                                <TableRow
                                    key={shipment.id}
                                    className={`border-zinc-800 hover:bg-zinc-800/30 ${selectedIds.has(shipment.id) ? 'bg-amber-500/5' : ''}`}
                                >
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(shipment.id)}
                                            onChange={() => toggleSelect(shipment.id)}
                                            className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                                        />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-emerald-400">
                                        {shipment.tracking_code}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {formatDateUY(shipment.created_at)}
                                    </TableCell>
                                    <TableCell className="text-zinc-200 text-sm">
                                        {(shipment.remitente as unknown as { name: string })?.name || '—'}
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="text-sm text-zinc-200">{shipment.recipient_name}</p>
                                            {shipment.recipient_phone && (
                                                <p className="text-xs text-zinc-500">{shipment.recipient_phone}</p>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-zinc-300 text-sm">
                                        {(shipment.cadeteria as unknown as { name: string })?.name || '—'}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs text-zinc-400">
                                            {sizeLabels[shipment.package_size] || shipment.package_size}
                                            {shipment.package_count > 1 && ` ×${shipment.package_count}`}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getStatusColor(shipment.status)}>
                                            {getStatusLabel(shipment.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {shipment.recipient_department || '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-zinc-300 text-sm font-medium">
                                        {shipment.shipping_cost
                                            ? `$${shipment.shipping_cost.toLocaleString()}`
                                            : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-1 justify-end">
                                            <Link href={`/admin/shipments/${shipment.id}`}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-zinc-400 hover:text-zinc-200 h-8 w-8 p-0"
                                                    title="Ver detalle"
                                                >
                                                    🔍
                                                </Button>
                                            </Link>
                                            <Link href={`/admin/shipments/${shipment.id}/edit`}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-zinc-400 hover:text-zinc-200 h-8 w-8 p-0"
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </Button>
                                            </Link>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-500">
                        Página {page + 1} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                        >
                            ← Anterior
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                        >
                            Siguiente →
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
