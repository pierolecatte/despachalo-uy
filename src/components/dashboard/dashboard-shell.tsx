'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/(auth)/actions'
import { getRoleLabel, getOrgTypeLabel } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

interface NavItem {
    label: string
    href: string
    icon: string
}

const navByRole: Record<string, NavItem[]> = {
    super_admin: [
        { label: 'Dashboard', href: '/admin', icon: '📊' },
        { label: 'Organizaciones', href: '/admin/organizations', icon: '🏢' },
        { label: 'Usuarios', href: '/admin/users', icon: '👥' },
        { label: 'Envíos', href: '/admin/shipments', icon: '📦' },
        { label: 'Departamentos', href: '/admin/departments', icon: '🗺️' },
    ],
    org_admin: [
        { label: 'Dashboard', href: '/remitente', icon: '📊' },
        { label: 'Envíos', href: '/remitente/shipments', icon: '📦' },
        { label: 'Nuevo envío', href: '/remitente/shipments/new', icon: '➕' },
    ],
    operador: [
        { label: 'Dashboard', href: '/remitente', icon: '📊' },
        { label: 'Envíos', href: '/remitente/shipments', icon: '📦' },
    ],
    cadete: [
        { label: 'Mis tareas', href: '/cadete', icon: '📋' },
        { label: 'Historial', href: '/cadete/history', icon: '📜' },
    ],
}

// Items adicionales para cadeterías
const cadeteriaNav: NavItem[] = [
    { label: 'Dashboard', href: '/cadeteria', icon: '📊' },
    { label: 'Cadetes', href: '/cadeteria/cadetes', icon: '🏍️' },
    { label: 'Tarifas', href: '/cadeteria/tariffs', icon: '💰' },
    { label: 'Envíos', href: '/cadeteria/shipments', icon: '📦' },
]

const agenciaNav: NavItem[] = [
    { label: 'Dashboard', href: '/agencia', icon: '📊' },
    { label: 'Recepción', href: '/agencia/reception', icon: '📥' },
    { label: 'Búsqueda', href: '/agencia/search', icon: '🔍' },
]

function getNavItems(role: string, orgType: string): NavItem[] {
    if (role === 'super_admin') return navByRole.super_admin
    if (orgType === 'cadeteria') return cadeteriaNav
    if (orgType === 'agencia') return agenciaNav
    if (role === 'cadete') return navByRole.cadete
    return navByRole[role] || navByRole.operador
}

interface DashboardShellProps {
    user: {
        id: string
        full_name: string
        email: string
        role: string
        organizations: {
            id: string
            name: string
            type: string
        }
    }
    children: React.ReactNode
}

export function DashboardShell({ user, children }: DashboardShellProps) {
    const pathname = usePathname()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const navItems = getNavItems(user.role, user.organizations.type)

    const initials = user.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6">
                <Link href="/admin" className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <span className="text-lg">📦</span>
                    </div>
                    <div>
                        <span className="text-lg font-bold text-zinc-50 tracking-tight">despachalo</span>
                        <span className="text-emerald-400">.uy</span>
                    </div>
                </Link>
            </div>

            {/* Organization badge */}
            <div className="px-4 mb-4">
                <div className="px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Organización</p>
                    <p className="text-sm text-zinc-200 font-medium truncate">{user.organizations.name}</p>
                    <p className="text-xs text-zinc-400">{getOrgTypeLabel(user.organizations.type)}</p>
                </div>
            </div>

            <Separator className="bg-zinc-800 mx-4" />

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
                {navItems.map(item => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                                }`}
                        >
                            <span className="text-base">{item.icon}</span>
                            {item.label}
                        </Link>
                    )
                })}
            </nav>

            {/* User section at bottom */}
            <div className="p-4 border-t border-zinc-800">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition-colors">
                            <Avatar className="h-8 w-8 bg-gradient-to-br from-emerald-400 to-emerald-600">
                                <AvatarFallback className="bg-transparent text-white text-xs font-bold">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-sm text-zinc-200 font-medium truncate">{user.full_name}</p>
                                <p className="text-xs text-zinc-500 truncate">{getRoleLabel(user.role)}</p>
                            </div>
                            <span className="text-zinc-500 text-xs">⋮</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
                        <DropdownMenuLabel className="text-zinc-400 text-xs">
                            {user.email}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem
                            onClick={() => logout()}
                            className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
                        >
                            🚪 Cerrar sesión
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-zinc-950">
            {/* Desktop sidebar */}
            <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-zinc-900/80 backdrop-blur-xl border-r border-zinc-800">
                <SidebarContent />
            </aside>

            {/* Mobile header */}
            <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-xl px-4">
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
                            <span className="text-xl">☰</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-64 p-0 bg-zinc-900 border-zinc-800">
                        <SidebarContent />
                    </SheetContent>
                </Sheet>
                <div className="flex items-center gap-2">
                    <span className="text-lg">📦</span>
                    <span className="font-bold text-zinc-50">despachalo</span>
                    <span className="text-emerald-400">.uy</span>
                </div>
            </div>

            {/* Main content */}
            <main className="lg:pl-64">
                <div className="p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
