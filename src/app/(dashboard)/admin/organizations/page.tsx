'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrgTypeLabel } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { OrgType } from '@/types/database'

interface Organization {
    id: string
    name: string
    type: OrgType
    email: string | null
    phone: string | null
    address: string | null
    active: boolean
    is_internal_cadeteria: boolean
    created_at: string
}

export default function OrganizationsPage() {
    const [orgs, setOrgs] = useState<Organization[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
    const [saving, setSaving] = useState(false)
    const [filterType, setFilterType] = useState<string>('all')
    const supabase = createClient()

    useEffect(() => {
        fetchOrgs()
    }, [])

    async function fetchOrgs() {
        setLoading(true)
        const { data } = await supabase
            .from('organizations')
            .select('*')
            .order('created_at', { ascending: false })
        setOrgs(data || [])
        setLoading(false)
    }

    async function handleSave(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        const formData = new FormData(e.currentTarget)

        const orgData = {
            name: formData.get('name') as string,
            type: formData.get('type') as OrgType,
            email: (formData.get('email') as string) || null,
            phone: (formData.get('phone') as string) || null,
            address: (formData.get('address') as string) || null,
            active: formData.get('active') === 'on',
        }

        if (editingOrg) {
            await supabase.from('organizations').update(orgData).eq('id', editingOrg.id)
        } else {
            await supabase.from('organizations').insert(orgData)
        }

        setSaving(false)
        setDialogOpen(false)
        setEditingOrg(null)
        fetchOrgs()
    }

    function openEdit(org: Organization) {
        setEditingOrg(org)
        setDialogOpen(true)
    }

    function openNew() {
        setEditingOrg(null)
        setDialogOpen(true)
    }

    const filteredOrgs = filterType === 'all'
        ? orgs
        : orgs.filter(o => o.type === filterType)

    const typeColors: Record<string, string> = {
        remitente: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        cadeteria: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        agencia: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        admin: 'bg-red-500/10 text-red-400 border-red-500/20',
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Organizaciones</h1>
                    <p className="text-zinc-400 mt-1">Gestionar remitentes, cadeterías y agencias</p>
                </div>
                <Button onClick={openNew} className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                    ➕ Nueva organización
                </Button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {['all', 'remitente', 'cadeteria', 'agencia'].map(type => (
                    <Button
                        key={type}
                        variant={filterType === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterType(type)}
                        className={filterType === type
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                            : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                        }
                    >
                        {type === 'all' ? 'Todas' : getOrgTypeLabel(type)}
                        {type !== 'all' && (
                            <span className="ml-1.5 text-xs opacity-70">
                                {orgs.filter(o => o.type === type).length}
                            </span>
                        )}
                    </Button>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-zinc-400">Nombre</TableHead>
                            <TableHead className="text-zinc-400">Tipo</TableHead>
                            <TableHead className="text-zinc-400">Email</TableHead>
                            <TableHead className="text-zinc-400">Teléfono</TableHead>
                            <TableHead className="text-zinc-400">Estado</TableHead>
                            <TableHead className="text-zinc-400 text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-zinc-500 py-10">
                                    Cargando...
                                </TableCell>
                            </TableRow>
                        ) : filteredOrgs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-zinc-500 py-10">
                                    No hay organizaciones. Creá la primera.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredOrgs.map(org => (
                                <TableRow key={org.id} className="border-zinc-800 hover:bg-zinc-800/30">
                                    <TableCell className="font-medium text-zinc-200">
                                        {org.name}
                                        {org.is_internal_cadeteria && (
                                            <span className="ml-2 text-xs text-zinc-500">(interna)</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={typeColors[org.type]}>
                                            {getOrgTypeLabel(org.type)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400">{org.email || '—'}</TableCell>
                                    <TableCell className="text-zinc-400">{org.phone || '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={org.active
                                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                        }>
                                            {org.active ? 'Activa' : 'Inactiva'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(org)}
                                            className="text-zinc-400 hover:text-zinc-200"
                                        >
                                            ✏️ Editar
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-50">
                            {editingOrg ? 'Editar organización' : 'Nueva organización'}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            {editingOrg
                                ? 'Modificá los datos de la organización'
                                : 'Completá los datos para crear una nueva organización'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Nombre *</Label>
                            <Input
                                name="name"
                                required
                                defaultValue={editingOrg?.name}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Tipo *</Label>
                            <Select name="type" defaultValue={editingOrg?.type || 'remitente'}>
                                <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700">
                                    <SelectItem value="remitente">📦 Remitente</SelectItem>
                                    <SelectItem value="cadeteria">🏍️ Cadetería</SelectItem>
                                    <SelectItem value="agencia">🚛 Agencia</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Email</Label>
                                <Input
                                    name="email"
                                    type="email"
                                    defaultValue={editingOrg?.email || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Teléfono</Label>
                                <Input
                                    name="phone"
                                    defaultValue={editingOrg?.phone || ''}
                                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Dirección</Label>
                            <Textarea
                                name="address"
                                defaultValue={editingOrg?.address || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 resize-none"
                                rows={2}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                name="active"
                                defaultChecked={editingOrg ? editingOrg.active : true}
                            />
                            <Label className="text-zinc-300">Organización activa</Label>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                                className="border-zinc-700 text-zinc-300"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={saving}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            >
                                {saving ? 'Guardando...' : editingOrg ? 'Guardar cambios' : 'Crear'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
