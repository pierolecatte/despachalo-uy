'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getStatusLabel, formatDateUY } from '@/lib/utils'
import Link from 'next/link'

interface TrackingResult {
    id: string
    tracking_code: string
    status: string
    recipient_name: string
    recipient_address: string | null
    recipient_department: string | null
    recipient_city: string | null
    delivery_type: string
    package_size: string
    package_count: number
    description: string | null
    created_at: string
    pickup_at: string | null
    dispatched_at: string | null
    delivered_at: string | null
    remitente_org_id: string
    qr_code_url: string | null
}

interface TrackingEvent {
    id: string
    event_type: string
    description: string | null
    created_at: string
}

const STATUS_FLOW = ['pendiente', 'levantado', 'despachado', 'en_transito', 'entregado']

const statusConfig: Record<string, { icon: string; label: string; color: string; bgColor: string }> = {
    pendiente: { icon: '⏳', label: 'Pendiente', color: 'text-amber-400', bgColor: 'bg-amber-500' },
    levantado: { icon: '📥', label: 'Levantado', color: 'text-blue-400', bgColor: 'bg-blue-500' },
    despachado: { icon: '🚚', label: 'Despachado', color: 'text-indigo-400', bgColor: 'bg-indigo-500' },
    en_transito: { icon: '🛣️', label: 'En tránsito', color: 'text-purple-400', bgColor: 'bg-purple-500' },
    entregado: { icon: '✅', label: 'Entregado', color: 'text-emerald-400', bgColor: 'bg-emerald-500' },
    con_problema: { icon: '⚠️', label: 'Con problema', color: 'text-red-400', bgColor: 'bg-red-500' },
}

const sizeLabels: Record<string, string> = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' }

function TrackingContent() {
    const searchParams = useSearchParams()
    const initialCode = searchParams.get('code') || ''

    const [trackingCode, setTrackingCode] = useState(initialCode)
    const [result, setResult] = useState<TrackingResult | null>(null)
    const [events, setEvents] = useState<TrackingEvent[]>([])
    const [remitenteName, setRemitenteName] = useState('')
    const [searching, setSearching] = useState(false)
    const [error, setError] = useState('')
    const [searched, setSearched] = useState(false)

    const supabase = createClient()

    async function handleSearch(e?: React.FormEvent) {
        e?.preventDefault()
        if (!trackingCode.trim()) return

        setSearching(true)
        setError('')
        setResult(null)
        setSearched(true)

        const { data: shipment } = await supabase
            .from('shipments')
            .select('id, tracking_code, status, recipient_name, recipient_address, recipient_department, recipient_city, delivery_type, package_size, package_count, description, created_at, pickup_at, dispatched_at, delivered_at, remitente_org_id, qr_code_url')
            .eq('tracking_code', trackingCode.trim().toUpperCase())
            .single()

        if (!shipment) {
            setError('No se encontró ningún envío con ese código de seguimiento.')
            setSearching(false)
            return
        }

        setResult(shipment as TrackingResult)

        // Fetch remitente name
        const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', shipment.remitente_org_id)
            .single()
        setRemitenteName(org?.name || '')

        // Fetch events
        const { data: eventsData } = await supabase
            .from('shipment_events')
            .select('id, event_type, description, created_at')
            .eq('shipment_id', shipment.id)
            .order('created_at', { ascending: false })

        setEvents((eventsData as TrackingEvent[]) || [])
        setSearching(false)
    }

    function getShareUrl() {
        if (typeof window === 'undefined' || !result) return ''
        return `${window.location.origin}/tracking?code=${result.tracking_code}`
    }

    function copyToClipboard() {
        navigator.clipboard.writeText(getShareUrl())
    }

    const currentStatusIndex = result ? STATUS_FLOW.indexOf(result.status) : -1
    const isProblema = result?.status === 'con_problema'

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Hero / Search */}
            {!result && (
                <div className="text-center max-w-2xl mx-auto pt-12 pb-8">
                    <div className="text-6xl mb-6">📦</div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-zinc-50 mb-4">
                        Seguimiento de envío
                    </h1>
                    <p className="text-zinc-400 text-lg mb-8">
                        Ingresá el código de seguimiento para verificar el estado de tu paquete
                    </p>
                </div>
            )}

            {/* Search Form */}
            <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-8">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={trackingCode}
                            onChange={e => setTrackingCode(e.target.value.toUpperCase())}
                            placeholder="Ej: DUY-XXXXXX"
                            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono text-lg tracking-wider"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={searching || !trackingCode.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {searching ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            '🔍 Buscar'
                        )}
                    </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2 text-center">
                    Ingresá el código que te proporcionó el remitente
                </p>
            </form>

            {/* Error */}
            {error && searched && (
                <div className="max-w-xl mx-auto mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
                    ⚠️ {error}
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Status Header */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
                        <div className={`px-6 py-4 ${isProblema ? 'bg-red-500/10' : 'bg-emerald-500/5'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">Código de seguimiento</p>
                                    <p className="text-2xl font-mono font-bold text-emerald-400 tracking-wider">
                                        {result.tracking_code}
                                    </p>
                                </div>
                                <div className={`px-4 py-2 rounded-full text-sm font-semibold ${statusConfig[result.status]?.bgColor || 'bg-zinc-700'} text-white`}>
                                    {statusConfig[result.status]?.icon} {getStatusLabel(result.status)}
                                </div>
                            </div>
                        </div>

                        {/* Status Progress */}
                        {!isProblema && (
                            <div className="px-6 py-6">
                                <div className="flex items-center justify-between">
                                    {STATUS_FLOW.map((status, i) => {
                                        const isCompleted = i <= currentStatusIndex
                                        const isCurrent = i === currentStatusIndex
                                        const cfg = statusConfig[status]
                                        return (
                                            <div key={status} className="flex items-center flex-1">
                                                <div className="flex flex-col items-center">
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${isCurrent
                                                        ? `${cfg.bgColor} shadow-lg ring-2 ring-offset-2 ring-offset-zinc-900 ring-${cfg.bgColor.replace('bg-', '')}/40`
                                                        : isCompleted
                                                            ? `${cfg.bgColor}/20 ${cfg.color}`
                                                            : 'bg-zinc-800 text-zinc-600'
                                                        }`}>
                                                        {cfg.icon}
                                                    </div>
                                                    <span className={`text-xs mt-2 font-medium hidden sm:block ${isCurrent ? cfg.color : isCompleted ? 'text-zinc-400' : 'text-zinc-600'
                                                        }`}>
                                                        {cfg.label}
                                                    </span>
                                                </div>
                                                {i < STATUS_FLOW.length - 1 && (
                                                    <div className={`flex-1 h-1 mx-1 sm:mx-3 rounded-full mt-[-16px] sm:mt-[-24px] ${isCompleted && i < currentStatusIndex ? `${cfg.bgColor}/30` : 'bg-zinc-800'
                                                        }`} />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Info Column */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Shipment Info */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
                                <h3 className="text-lg font-semibold text-zinc-200 mb-4">📋 Información del envío</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <InfoItem label="Remitente" value={remitenteName} />
                                    <InfoItem label="Destinatario" value={result.recipient_name} />
                                    <InfoItem label="Dirección" value={result.recipient_address} />
                                    <InfoItem label="Departamento" value={result.recipient_department} />
                                    <InfoItem label="Ciudad" value={result.recipient_city} />
                                    <InfoItem label="Entrega" value={result.delivery_type === 'domicilio' ? '🏠 A domicilio' : '🏪 En sucursal'} />
                                    <InfoItem label="Tamaño" value={`📦 ${sizeLabels[result.package_size] || result.package_size}`} />
                                    <InfoItem label="Bultos" value={String(result.package_count)} />
                                </div>
                                {result.description && (
                                    <div className="mt-4 pt-4 border-t border-zinc-800">
                                        <p className="text-xs text-zinc-500 mb-1">Descripción</p>
                                        <p className="text-sm text-zinc-300">{result.description}</p>
                                    </div>
                                )}
                            </div>

                            {/* Timeline */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
                                <h3 className="text-lg font-semibold text-zinc-200 mb-4">📋 Historial</h3>
                                {events.length === 0 ? (
                                    <p className="text-zinc-500 text-sm text-center py-6">
                                        Sin eventos registrados aún
                                    </p>
                                ) : (
                                    <div className="space-y-0">
                                        {events.map((event, i) => (
                                            <div key={event.id} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className={`w-3 h-3 rounded-full mt-1.5 ${i === 0 ? 'bg-emerald-400 ring-4 ring-emerald-400/10' : 'bg-zinc-600'
                                                        }`} />
                                                    {i < events.length - 1 && <div className="w-px flex-1 bg-zinc-800" />}
                                                </div>
                                                <div className="pb-5">
                                                    <p className="text-sm text-zinc-200">
                                                        {event.description || event.event_type}
                                                    </p>
                                                    <p className="text-xs text-zinc-500 mt-0.5">{formatDateUY(event.created_at)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            {/* Dates */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
                                <h3 className="text-lg font-semibold text-zinc-200 mb-4">📅 Fechas</h3>
                                <div className="space-y-3">
                                    <DateItem label="Registrado" date={result.created_at} />
                                    <DateItem label="Levantado" date={result.pickup_at} />
                                    <DateItem label="Despachado" date={result.dispatched_at} />
                                    <DateItem label="Entregado" date={result.delivered_at} />
                                </div>
                            </div>

                            {/* QR Code */}
                            {result.qr_code_url && (
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 flex flex-col items-center">
                                    <h3 className="text-lg font-semibold text-zinc-200 mb-4 self-start">📱 Código QR</h3>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={result.qr_code_url}
                                        alt={`QR ${result.tracking_code}`}
                                        className="w-36 h-36 rounded-lg bg-white p-1"
                                    />
                                    <p className="text-xs text-zinc-500 mt-2">Escaneá para compartir</p>
                                </div>
                            )}

                            {/* Share */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
                                <h3 className="text-lg font-semibold text-zinc-200 mb-4">🔗 Compartir</h3>
                                <p className="text-sm text-zinc-400 mb-4">Compartí esta información de seguimiento</p>
                                <div className="space-y-2">
                                    <button
                                        onClick={copyToClipboard}
                                        className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        📋 Copiar enlace
                                    </button>
                                    <a
                                        href={`https://wa.me/?text=${encodeURIComponent(`Seguimiento de envío: ${getShareUrl()}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        💬 Enviar por WhatsApp
                                    </a>
                                    <a
                                        href={`mailto:?subject=Seguimiento de envío&body=${encodeURIComponent(`Podés seguir tu envío aquí: ${getShareUrl()}`)}`}
                                        className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        ✉️ Enviar por Email
                                    </a>
                                </div>
                            </div>

                            {/* Search again */}
                            <button
                                onClick={() => {
                                    setResult(null)
                                    setTrackingCode('')
                                    setSearched(false)
                                }}
                                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all text-sm"
                            >
                                🔍 Nueva búsqueda
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function TrackingPage() {
    return (
        <div className="min-h-screen bg-zinc-950">
            {/* Navigation */}
            <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-lg sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <span className="text-2xl">📦</span>
                        <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-500 bg-clip-text text-transparent">
                            despachalo.uy
                        </span>
                    </Link>
                    <Link
                        href="/login"
                        className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        Iniciar Sesión →
                    </Link>
                </div>
            </nav>

            <Suspense fallback={
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            }>
                <TrackingContent />
            </Suspense>

            {/* Footer */}
            <footer className="border-t border-zinc-800 mt-16 py-8">
                <div className="max-w-5xl mx-auto px-4 text-center">
                    <p className="text-zinc-500 text-sm">
                        © {new Date().getFullYear()} despachalo.uy — La mejor plataforma de seguimiento de envíos en Uruguay
                    </p>
                </div>
            </footer>
        </div>
    )
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
    return (
        <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-sm text-zinc-200 font-medium">{value || '—'}</p>
        </div>
    )
}

function DateItem({ label, date }: { label: string; date: string | null }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">{label}</span>
            {date ? (
                <span className="text-sm text-zinc-300">{formatDateUY(date)}</span>
            ) : (
                <span className="text-xs text-zinc-600">Pendiente</span>
            )}
        </div>
    )
}
