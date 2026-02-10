import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function getStats() {
    const supabase = await createClient()

    const [orgsResult, usersResult, shipmentsResult] = await Promise.all([
        supabase.from('organizations').select('id, type, active', { count: 'exact' }),
        supabase.from('users').select('id, role, active', { count: 'exact' }),
        supabase.from('shipments').select('id, status', { count: 'exact' }),
    ])

    const orgs = orgsResult.data || []
    const users = usersResult.data || []
    const shipments = shipmentsResult.data || []

    return {
        totalOrgs: orgs.length,
        activeOrgs: orgs.filter(o => o.active).length,
        remitentes: orgs.filter(o => o.type === 'remitente').length,
        cadeterias: orgs.filter(o => o.type === 'cadeteria').length,
        agencias: orgs.filter(o => o.type === 'agencia').length,
        totalUsers: users.length,
        activeUsers: users.filter(u => u.active).length,
        totalShipments: shipments.length,
        pendientes: shipments.filter(s => s.status === 'pendiente').length,
        enTransito: shipments.filter(s => s.status === 'en_transito' || s.status === 'despachado').length,
        entregados: shipments.filter(s => s.status === 'entregado').length,
        conProblema: shipments.filter(s => s.status === 'con_problema').length,
    }
}

export default async function AdminDashboard() {
    const stats = await getStats()

    const cards = [
        { title: 'Organizaciones', value: stats.totalOrgs, detail: `${stats.activeOrgs} activas`, icon: '🏢', color: 'from-blue-500 to-blue-600' },
        { title: 'Remitentes', value: stats.remitentes, icon: '📦', color: 'from-emerald-500 to-emerald-600' },
        { title: 'Cadeterías', value: stats.cadeterias, icon: '🏍️', color: 'from-amber-500 to-amber-600' },
        { title: 'Agencias', value: stats.agencias, icon: '🚛', color: 'from-purple-500 to-purple-600' },
        { title: 'Usuarios', value: stats.totalUsers, detail: `${stats.activeUsers} activos`, icon: '👥', color: 'from-cyan-500 to-cyan-600' },
        { title: 'Total envíos', value: stats.totalShipments, icon: '📊', color: 'from-indigo-500 to-indigo-600' },
        { title: 'Pendientes', value: stats.pendientes, icon: '⏳', color: 'from-yellow-500 to-yellow-600' },
        { title: 'En tránsito', value: stats.enTransito, icon: '🚚', color: 'from-sky-500 to-sky-600' },
        { title: 'Entregados', value: stats.entregados, icon: '✅', color: 'from-green-500 to-green-600' },
        { title: 'Con problema', value: stats.conProblema, icon: '⚠️', color: 'from-red-500 to-red-600' },
    ]

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-zinc-50">Panel de Administración</h1>
                <p className="text-zinc-400 mt-1">Vista general del sistema despachalo.uy</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {cards.map((card) => (
                    <Card key={card.title} className="bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-zinc-400">
                                {card.title}
                            </CardTitle>
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                                <span className="text-sm">{card.icon}</span>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-zinc-50">{card.value}</div>
                            {card.detail && (
                                <p className="text-xs text-zinc-500 mt-1">{card.detail}</p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-semibold text-zinc-200 mb-4">Acciones rápidas</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <a href="/admin/organizations" className="group">
                        <Card className="bg-zinc-900/80 border-zinc-800 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all cursor-pointer">
                            <CardContent className="flex items-center gap-4 p-5">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                                    <span className="text-2xl">🏢</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-zinc-200">Gestionar organizaciones</p>
                                    <p className="text-xs text-zinc-500">Crear, editar o desactivar</p>
                                </div>
                            </CardContent>
                        </Card>
                    </a>
                    <a href="/admin/users" className="group">
                        <Card className="bg-zinc-900/80 border-zinc-800 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all cursor-pointer">
                            <CardContent className="flex items-center gap-4 p-5">
                                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                    <span className="text-2xl">👥</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-zinc-200">Gestionar usuarios</p>
                                    <p className="text-xs text-zinc-500">Roles y permisos</p>
                                </div>
                            </CardContent>
                        </Card>
                    </a>
                    <a href="/admin/shipments" className="group">
                        <Card className="bg-zinc-900/80 border-zinc-800 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all cursor-pointer">
                            <CardContent className="flex items-center gap-4 p-5">
                                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                                    <span className="text-2xl">📦</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-zinc-200">Ver envíos</p>
                                    <p className="text-xs text-zinc-500">Todos los envíos del sistema</p>
                                </div>
                            </CardContent>
                        </Card>
                    </a>
                </div>
            </div>
        </div>
    )
}
