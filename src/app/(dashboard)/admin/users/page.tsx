'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getRoleLabel, getOrgTypeLabel } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { UserRole } from '@/types/database'

interface User {
    id: string
    email: string
    full_name: string
    role: UserRole
    phone: string | null
    active: boolean
    created_at: string
    organizations: {
        id: string
        name: string
        type: string
    }
}

interface Organization {
    id: string
    name: string
    type: string
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([])
    const [orgs, setOrgs] = useState<Organization[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')
    const supabase = createClient()

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setLoading(true)
        const [usersRes, orgsRes] = await Promise.all([
            supabase.from('users').select('*, organizations(id, name, type)').order('created_at', { ascending: false }),
            supabase.from('organizations').select('id, name, type').eq('active', true).order('name'),
        ])
        setUsers((usersRes.data as User[]) || [])
        setOrgs(orgsRes.data || [])
        setLoading(false)
    }

    async function handleSave(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setSaving(true)
        const formData = new FormData(e.currentTarget)

        const userData = {
            full_name: formData.get('full_name') as string,
            email: formData.get('email') as string,
            role: formData.get('role') as UserRole,
            org_id: formData.get('org_id') as string,
            phone: (formData.get('phone') as string) || null,
            active: formData.get('active') === 'on',
        }

        if (editingUser) {
            await supabase.from('users').update(userData).eq('id', editingUser.id)
        } else {
            await supabase.from('users').insert(userData)
        }

        setSaving(false)
        setDialogOpen(false)
        setEditingUser(null)
        fetchData()
    }

    const roleColors: Record<string, string> = {
        super_admin: 'bg-red-500/10 text-red-400 border-red-500/20',
        org_admin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        operador: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        cadete: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    }

    const filteredUsers = users.filter(u =>
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.organizations?.name?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Usuarios</h1>
                    <p className="text-zinc-400 mt-1">Gestionar usuarios del sistema y sus roles</p>
                </div>
                <Button
                    onClick={() => { setEditingUser(null); setDialogOpen(true) }}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                >
                    ➕ Nuevo usuario
                </Button>
            </div>

            {/* Search */}
            <Input
                placeholder="Buscar por nombre, email u organización..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-md bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />

            {/* Table */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-zinc-400">Nombre</TableHead>
                            <TableHead className="text-zinc-400">Email</TableHead>
                            <TableHead className="text-zinc-400">Organización</TableHead>
                            <TableHead className="text-zinc-400">Rol</TableHead>
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
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-zinc-500 py-10">
                                    No se encontraron usuarios
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map(user => (
                                <TableRow key={user.id} className="border-zinc-800 hover:bg-zinc-800/30">
                                    <TableCell className="font-medium text-zinc-200">{user.full_name}</TableCell>
                                    <TableCell className="text-zinc-400">{user.email}</TableCell>
                                    <TableCell className="text-zinc-300">
                                        {user.organizations?.name || '—'}
                                        {user.organizations?.type && (
                                            <span className="ml-1.5 text-xs text-zinc-500">
                                                ({getOrgTypeLabel(user.organizations.type)})
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={roleColors[user.role]}>
                                            {getRoleLabel(user.role)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={user.active
                                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                        }>
                                            {user.active ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setEditingUser(user); setDialogOpen(true) }}
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
                            {editingUser ? 'Editar usuario' : 'Nuevo usuario'}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            {editingUser
                                ? 'Modificá los datos del usuario'
                                : 'Completá los datos para registrar un nuevo usuario'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Nombre completo *</Label>
                            <Input
                                name="full_name"
                                required
                                defaultValue={editingUser?.full_name}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Email *</Label>
                            <Input
                                name="email"
                                type="email"
                                required
                                defaultValue={editingUser?.email}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Organización *</Label>
                                <Select name="org_id" defaultValue={editingUser?.organizations?.id}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {orgs.map(org => (
                                            <SelectItem key={org.id} value={org.id}>
                                                {org.name} ({getOrgTypeLabel(org.type)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Rol *</Label>
                                <Select name="role" defaultValue={editingUser?.role || 'operador'}>
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        <SelectItem value="super_admin">🔑 Super Admin</SelectItem>
                                        <SelectItem value="org_admin">👑 Administrador</SelectItem>
                                        <SelectItem value="operador">🧑‍💻 Operador</SelectItem>
                                        <SelectItem value="cadete">🏍️ Cadete</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Teléfono</Label>
                            <Input
                                name="phone"
                                defaultValue={editingUser?.phone || ''}
                                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                name="active"
                                defaultChecked={editingUser ? editingUser.active : true}
                            />
                            <Label className="text-zinc-300">Usuario activo</Label>
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
                                {saving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
