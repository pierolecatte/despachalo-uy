'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// ── Types ──────────────────────────────────────────────────────────────

interface ParseWarning { row: number; column: string; message: string }
interface ImportSignals {
    hasAgencyColumn: boolean; hasFreightPaidColumn: boolean; addressHasAgenciaKeyword: boolean
    suggestedServiceType: string | null; confidence: number; reasons: string[]
}
interface ParseResponse {
    sheetNames: string[]; selectedSheet: string; headers: string[]
    sampleRows: Record<string, string>[]; totalRows: number
    warnings: ParseWarning[]; requiredCandidates: string[]; relevantCandidates: string[]
    signals: ImportSignals
}
interface ColumnMapping { sourceHeader: string; targetField: string; transform?: string; confidence: number }
interface MappingResult { mappings: ColumnMapping[]; defaultsSuggested: Record<string, string>; questions: string[]; notes: string[] }
interface PreviewRowResult {
    rowIndex: number; normalized: Record<string, unknown>
    errors: Record<string, string>; warnings: Array<{ field: string; message: string }>
}
interface PreviewResponse { previewRows: PreviewRowResult[]; summary: { total: number; ok: number; withWarnings: number; withErrors: number } }
interface CommitRowResult { rowIndex: number; shipmentId?: string; trackingCode?: string; status?: 'INSERTED' | 'FAILED' | 'SKIPPED_DUPLICATE'; reason?: string; warnings?: Array<{ field: string; message: string }>; errors?: Record<string, string> }
interface CommitResponse { summary: { total: number; inserted: number; withWarnings: number; failed: number; skipped: number }; results: CommitRowResult[] }
interface Org { id: string; name: string; type: string }
interface TemplateResolveResult {
    found: boolean
    template?: { id: string; name: string; mapping_json: ColumnMapping[]; defaults_json: Record<string, string>; entity_resolutions_json: Record<string, string | null> | null }
    matchType?: 'exact' | 'sorted_fallback'
    note?: string
    suggestions?: Array<{ id: string; name: string; score: number; mapping_json: ColumnMapping[]; defaults_json: Record<string, string> }>
}

const TARGET_FIELDS = [
    { value: 'recipient_name', label: '👤 Nombre destinatario' },
    { value: 'recipient_phone', label: '📱 Teléfono' },
    { value: 'recipient_email', label: '📧 Email' },
    { value: 'recipient_address', label: '📍 Dirección' },
    { value: 'department_name', label: '🗺️ Departamento' },
    { value: 'locality_name', label: '🏘️ Localidad' },
    { value: 'observations', label: '📝 Observaciones' },
    { value: 'is_freight_paid', label: '💰 Flete pago' },
    { value: 'freight_amount', label: '💵 Monto flete' },
    { value: 'agency_name', label: '🚛 Agencia' },
    { value: 'service_type', label: '⚙️ Tipo servicio' },
    { value: 'package_size', label: '📦 Tamaño paquete' },
    { value: 'delivery_type', label: '🚚 Tipo entrega' },
    { value: 'cadeteria_org_id', label: '🏍️ Cadetería' },
    { value: 'agencia_org_id', label: '🚛 Agencia' },
    { value: 'weight_kg', label: '⚖️ Peso (kg)' },
    { value: 'shipping_cost', label: '💲 Costo envío' },
    { value: 'content_description', label: '📋 Descripción contenido' },
    { value: 'notes', label: '🗒️ Notas' },
    { value: '_ignore', label: '🚫 Ignorar' },
]

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

export default function ImportPage() {
    const [step, setStep] = useState<WizardStep>(1)
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<ParseResponse | null>(null)
    const [dragActive, setDragActive] = useState(false)

    // Mapping
    const [mappings, setMappings] = useState<ColumnMapping[]>([])
    const [mappingResult, setMappingResult] = useState<MappingResult | null>(null)
    const [mappingLoading, setMappingLoading] = useState(false)

    // Preview
    const [preview, setPreview] = useState<PreviewResponse | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    // Defaults & entity resolution
    const [defaults, setDefaults] = useState<Record<string, string>>({})
    const [entityResolutions, setEntityResolutions] = useState<Record<string, string | null>>({})
    const [orgs, setOrgs] = useState<Org[]>([])
    const [unresolvedAgencies, setUnresolvedAgencies] = useState<string[]>([])

    // Commit
    const [commitResult, setCommitResult] = useState<CommitResponse | null>(null)
    const [commitLoading, setCommitLoading] = useState(false)
    const [commitProgress, setCommitProgress] = useState(0)
    const [dedupeCheck, setDedupeCheck] = useState(true)
    const [force, setForce] = useState(false)

    // Templates
    const [templateResult, setTemplateResult] = useState<TemplateResolveResult | null>(null)
    const [templateApplied, setTemplateApplied] = useState(false)
    const [templateSaving, setTemplateSaving] = useState(false)
    const [templateSaved, setTemplateSaved] = useState(false)
    const [saveTemplateName, setSaveTemplateName] = useState('')
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
    const [aiStatus, setAiStatus] = useState<{ aiConfigured: boolean; provider: 'gemini' | 'heuristics' }>({ aiConfigured: false, provider: 'heuristics' })

    // Fetch organizations and check AI status on mount
    useEffect(() => {
        fetchOrgs()
        fetch('/api/import/status').then(r => r.json()).then(j => setAiStatus(j)).catch(() => { })
    }, [])

    async function fetchOrgs() {
        try {
            const res = await fetch('/api/import/orgs')
            if (res.ok) {
                const data = await res.json()
                setOrgs(data.organizations || [])
            }
        } catch { /* non-critical */ }
    }

    const remitentes = orgs.filter(o => o.type === 'remitente')
    const cadeterias = orgs.filter(o => o.type === 'cadeteria')
    const agencias = orgs.filter(o => o.type === 'agencia')

    // ── Template resolution ────────────────────────────────────────────

    const resolveTemplate = useCallback(async (orgId: string, headers: string[]) => {
        setTemplateResult(null)
        try {
            const res = await fetch('/api/import/templates/match', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgId, headers }),
            })
            if (!res.ok) return
            const json = await res.json()

            // Transform API response to internal state format
            // API returns: { exact: Template?, suggestions: [], ... }
            if (json.exact) {
                setTemplateResult({
                    found: true,
                    template: {
                        id: json.exact.id,
                        name: json.exact.name,
                        mapping_json: json.exact.mapping_json,
                        defaults_json: json.exact.defaults_json,
                        entity_resolutions_json: null // Not currently stored in template, maybe in future
                    },
                    matchType: 'exact'
                })
            } else if (json.suggestions?.length > 0) {
                // For now, we only automatically suggest/show if there's a strong match or we want to show a list
                // The requirement says: suggestions list or banner.
                // We'll treat the top suggestion as a candidate if confidence matches, or just store suggestions
                // For simplicity in this iteration, we'll store the top suggestion as "found" but maybe adds a flag "isSuggestion"
                // Or we can just adapt the UI to show suggestions. 
                // Let's stick to the exact match banner for now to "not break flow", and maybe a small "Suggestions available" 
                // But the prompt says: "Mostrar lista corta de sugerencias".

                // Let's modify TemplateResolveResult to support suggestions
                setTemplateResult({
                    found: false,
                    suggestions: json.suggestions.map((s: any) => ({
                        id: s.template?.id ?? s.id, // Handle potential structure diff
                        name: s.template?.name ?? s.name,
                        score: s.score,
                        mapping_json: s.template?.mapping_json ?? s.mapping_json,
                        defaults_json: s.template?.defaults_json ?? s.defaults_json
                    }))
                })
            }
        } catch { /* non-critical */ }
    }, [])

    const applyTemplate = useCallback((t: any = templateResult?.template) => {
        if (!t) return
        setMappings(t.mapping_json)
        setDefaults(prev => ({ ...prev, ...t.defaults_json }))
        // if (t.entity_resolutions_json) setEntityResolutions(t.entity_resolutions_json)
        setTemplateApplied(true)
    }, [templateResult])

    const saveTemplate = useCallback(async (forceUpdateId?: string) => {
        if (!data || !mappings.length || !defaults.remitente_org_id) return
        setTemplateSaving(true)
        setError(null)
        try {
            const payload = {
                orgId: defaults.remitente_org_id,
                name: saveTemplateName || `Plantilla - ${new Date().toLocaleDateString()}`,
                headers: data.headers,
                mapping: mappings,
                defaults: defaults,
            }

            let url = '/api/import/templates'
            let method = 'POST'

            if (forceUpdateId) {
                url = `/api/import/templates/${forceUpdateId}`
                method = 'PATCH'
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = await res.json().catch(() => null)

            if (!res.ok) {
                console.error("saveTemplate failed", res.status, json)
                const errorMsg = json?.message || json?.error || JSON.stringify(json) || 'Error desconocido'
                if (res.status === 409) {
                    setError(`Conflicto: ${errorMsg}`)
                } else {
                    setError(`Error al guardar: ${errorMsg} (${res.status})`)
                }
            } else {
                setTemplateSaved(true)
                setShowSaveTemplateModal(false)
            }
        } catch (err: any) {
            console.error("saveTemplate exception", err)
            setError(`Excepción al guardar: ${err.message}`)
        }
        finally { setTemplateSaving(false) }
    }, [data, mappings, defaults, saveTemplateName])

    // ── Upload & Parse ─────────────────────────────────────────────────

    const uploadAndParse = useCallback(async (selectedFile: File, sheetName?: string) => {
        setLoading(true); setError(null)
        const formData = new FormData()
        formData.append('file', selectedFile)
        if (sheetName) formData.append('sheet_name', sheetName)
        try {
            const res = await fetch('/api/import/parse', { method: 'POST', body: formData })
            const json = await res.json()
            if (!res.ok) { setError(`${json.code}: ${json.message}`); return }
            const parsed = json as ParseResponse
            setData(parsed)
            // Pre-fill service_type from signals
            if (parsed.signals?.suggestedServiceType) {
                setDefaults(prev => ({ ...prev, service_type: prev.service_type || parsed.signals.suggestedServiceType! }))
            }

            // Try match template if org selected
            if (defaults.remitente_org_id) {
                resolveTemplate(defaults.remitente_org_id, parsed.headers)
            }

            setStep(2)
        } catch { setError('Error de red.') }
        finally { setLoading(false) }
    }, [defaults.remitente_org_id, resolveTemplate])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) { setFile(f); setData(null); setMappings([]); setMappingResult(null); setPreview(null); setCommitResult(null); uploadAndParse(f) }
    }
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragActive(false)
        const f = e.dataTransfer.files?.[0]
        if (f) { setFile(f); setData(null); setMappings([]); setMappingResult(null); setPreview(null); setCommitResult(null); uploadAndParse(f) }
    }
    const handleSheetChange = (sheetName: string) => { if (file) { setMappings([]); setMappingResult(null); setPreview(null); uploadAndParse(file, sheetName) } }
    const reset = () => { setStep(1); setFile(null); setData(null); setError(null); setMappings([]); setMappingResult(null); setPreview(null); setCommitResult(null); setDefaults({}); setEntityResolutions({}); setTemplateResult(null); setTemplateApplied(false); setTemplateSaved(false) }

    // ── AI Mapping ─────────────────────────────────────────────────────

    const requestAIMapping = useCallback(async () => {
        if (!data) return
        setMappingLoading(true)
        setError(null) // Clear previous errors
        try {
            const remitente = remitentes.find(r => r.id === defaults.remitente_org_id)
            const res = await fetch('/api/import/mapping', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    headers: data.headers,
                    sampleObjects: data.sampleRows,
                    requiredCandidates: data.requiredCandidates,
                    orgContext: { remitenteName: remitente?.name }
                })
            })
            const json = await res.json()
            if (!res.ok) { setError(`${json.code}: ${json.message}`); setMappingLoading(false); return }

            // Handle new response format { providerUsed, mapping, warnings }
            const result = json.mapping ? json.mapping : json; // fallback for backward compat if needed

            setMappingResult(result)
            setMappings(result.mappings)
            if (result.defaultsSuggested) setDefaults(prev => ({ ...prev, ...result.defaultsSuggested }))

            // Show warnings if any
            if (json.warnings?.length) {
                // You could add a specialized warning state/toast here, for now we just log or could append to notes
                console.warn('Import warnings:', json.warnings)
            }

            setStep(3)
        } catch (e) {
            setError('Error de conexión al generar mapping')
        } finally {
            setMappingLoading(false)
        }
    }, [data, defaults.remitente_org_id, remitentes])

    const updateMapping = (sourceHeader: string, targetField: string) => {
        setMappings(prev => prev.map(m => m.sourceHeader === sourceHeader ? { ...m, targetField, confidence: 1.0 } : m))
    }

    // ── Preview ────────────────────────────────────────────────────────

    const generatePreview = useCallback(async () => {
        if (!data || !mappings.length) return
        setPreviewLoading(true); setError(null)
        try {
            const res = await fetch('/api/import/preview', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings, defaultsChosen: defaults, rows: data.sampleRows }),
            })
            const json = await res.json()
            if (!res.ok) { setError(`${json.code}: ${json.message}`); return }
            const previewData = json as PreviewResponse
            setPreview(previewData)

            // Detect unresolved agencies
            const agencySet = new Set<string>()
            previewData.previewRows.forEach(row => {
                row.warnings?.forEach(w => {
                    if (w.field === 'agency_name' && w.message.includes('no encontrada')) {
                        const match = w.message.match(/"([^"]+)"/)
                        if (match) agencySet.add(match[1])
                    }
                })
            })
            setUnresolvedAgencies(Array.from(agencySet))

            setStep(4)
        } catch { setError('Error de red.') }
        finally { setPreviewLoading(false) }
    }, [data, mappings, defaults])

    // ── Agency fuzzy match ─────────────────────────────────────────────

    function fuzzyMatchAgency(name: string): Org[] {
        const upper = name.toUpperCase()
        return agencias.filter(a =>
            a.name.toUpperCase().includes(upper) ||
            upper.includes(a.name.toUpperCase()) ||
            levenshtein(a.name.toUpperCase(), upper) <= 3
        ).slice(0, 3)
    }

    function levenshtein(a: string, b: string): number {
        const m = a.length, n = b.length
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
        for (let i = 0; i <= m; i++) dp[i][0] = i
        for (let j = 0; j <= n; j++) dp[0][j] = j
        for (let i = 1; i <= m; i++)
            for (let j = 1; j <= n; j++)
                dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        return dp[m][n]
    }

    // ── Commit ─────────────────────────────────────────────────────────
    const doCommit = useCallback(async (rowSubset?: Record<string, string>[], forceOverride?: boolean) => {
        if (!data || !mappings.length) return
        setCommitLoading(true); setError(null); setCommitProgress(0)
        const rowsToCommit = rowSubset || data.sampleRows
        try {
            // Use a simulated progress (actual batch runs server-side)
            const progressInterval = setInterval(() => {
                setCommitProgress(prev => Math.min(prev + 5, 90))
            }, 200)

            const res = await fetch('/api/import/commit', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rows: rowsToCommit,
                    mappingFinal: mappings,
                    defaultsChosen: defaults,
                    entityResolutions: { agencies: entityResolutions },
                    dedupeCheck,
                    force: forceOverride ?? force,
                }),
            })

            clearInterval(progressInterval)
            setCommitProgress(100)

            const json = await res.json()
            if (!res.ok) { setError(`${json.code}: ${json.message}`); return }
            setCommitResult(json as CommitResponse); setStep(6)
        } catch { setError('Error de red.') }
        finally { setCommitLoading(false) }
    }, [data, mappings, defaults, entityResolutions])

    const retryFailed = useCallback(() => {
        if (!commitResult || !data) return
        const failedIndices = new Set(commitResult.results.filter(r => !r.shipmentId).map(r => r.rowIndex - 1))
        const failedRows = data.sampleRows.filter((_, i) => failedIndices.has(i))
        if (failedRows.length > 0) doCommit(failedRows)
    }, [commitResult, data, doCommit])

    const retrySkipped = useCallback(() => {
        if (!commitResult || !data) return
        const skippedIndices = new Set(commitResult.results.filter(r => r.status === 'SKIPPED_DUPLICATE').map(r => r.rowIndex - 1))
        const skippedRows = data.sampleRows.filter((_, i) => skippedIndices.has(i))
        if (skippedRows.length > 0) doCommit(skippedRows, true)
    }, [commitResult, data, doCommit])

    // ── Helpers ────────────────────────────────────────────────────────

    const parseWarningsByCell = new Map<string, ParseWarning>()
    data?.warnings.forEach(w => parseWarningsByCell.set(`${w.row}:${w.column}`, w))
    const getParseWarning = (i: number, col: string) => parseWarningsByCell.get(`${i + 2}:${col}`)
    const getConfidenceColor = (c: number) => c >= 0.9 ? 'text-emerald-400' : c >= 0.7 ? 'text-amber-400' : 'text-red-400'
    const getRowStatus = (row: PreviewRowResult) => {
        if (Object.keys(row.errors).length > 0) return { emoji: '❌', color: 'bg-red-500/5 border-l-2 border-red-500', label: 'Error' }
        if (row.warnings.length > 0) return { emoji: '⚠️', color: 'bg-amber-500/5 border-l-2 border-amber-500/40', label: 'Warning' }
        return { emoji: '✅', color: '', label: 'OK' }
    }

    const steps = [
        { num: 1, label: 'Subir' }, { num: 2, label: 'Preview' }, { num: 3, label: 'Mapeo IA' },
        { num: 4, label: 'Resolver' }, { num: 5, label: 'Confirmar' }, { num: 6, label: 'Resultado' },
    ]

    // ── Render ─────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50">Importar Envíos</h1>
                    <p className="text-zinc-400 mt-1">Subí un archivo Excel o CSV para importar envíos</p>
                </div>
                <Link href="/admin/shipments">
                    <Button variant="outline" className="border-zinc-700 text-zinc-400 hover:text-zinc-200">← Volver</Button>
                </Link>
            </div>

            {/* Steps */}
            <div className="flex items-center gap-1 flex-wrap">
                {steps.map((s, i) => (
                    <div key={s.num} className="flex items-center gap-1">
                        {i > 0 && <div className={`w-4 h-px ${step >= s.num ? 'bg-emerald-500' : 'bg-zinc-700'}`} />}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${step === s.num ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : step > s.num ? 'bg-emerald-500/10 text-emerald-500/70' : 'bg-zinc-800/50 text-zinc-500'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s.num ? 'bg-emerald-500/30 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                                {step > s.num ? '✓' : s.num}
                            </span>
                            <span className="hidden sm:inline">{s.label}</span>
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">❌ {error}</div>
            )}

            {/* ═══ Step 1: Upload ═══ */}
            {step === 1 && (
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader><CardTitle className="text-zinc-200">📂 Subir archivo</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-zinc-400">Remitente (Obligatorio para detectar plantillas)</Label>
                            <Select value={defaults.remitente_org_id || ''} onValueChange={v => {
                                setDefaults(d => ({ ...d, remitente_org_id: v }))
                            }}>
                                <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100"><SelectValue placeholder="Seleccionar remitente..." /></SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700">
                                    {remitentes.map(r => <SelectItem key={r.id} value={r.id}>📦 {r.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div
                            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${dragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-500'}`}
                            onDragOver={e => { e.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)}
                            onDrop={handleDrop} onClick={() => document.getElementById('file-input')?.click()}
                        >
                            <input id="file-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                            <div className="space-y-3">
                                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center"><span className="text-3xl">📄</span></div>
                                {loading ? (
                                    <div className="flex items-center justify-center gap-2 text-emerald-400">
                                        <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /> Procesando...
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-zinc-300 font-medium">Arrastrá un archivo aquí o hacé click</p>
                                        <p className="text-zinc-500 text-sm">.xlsx, .csv — Máximo 10MB</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══ Step 2: Raw Preview ═══ */}
            {step === 2 && data && (
                <div className="space-y-4">
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardContent className="flex flex-wrap items-center gap-4 py-4">
                            <span className="text-sm text-zinc-200 font-medium">📄 {file?.name}</span>
                            {data.sheetNames.length > 1 && (
                                <Select value={data.selectedSheet} onValueChange={handleSheetChange}>
                                    <SelectTrigger className="w-48 bg-zinc-800/50 border-zinc-700 text-zinc-100 h-8 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {data.sheetNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            <div className="flex items-center gap-3 ml-auto">
                                <Badge variant="outline" className="bg-zinc-800/50 text-zinc-300 border-zinc-700">{data.totalRows} filas</Badge>
                                <Badge variant="outline" className="bg-zinc-800/50 text-zinc-300 border-zinc-700">{data.headers.length} cols</Badge>
                                {data.warnings.length > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">⚠ {data.warnings.length}</Badge>}
                            </div>
                        </CardContent>
                    </Card>
                    {/* Detected fields: required + relevant */}
                    <div className="space-y-2 px-1">
                        {data.requiredCandidates.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-zinc-500 font-medium">Obligatorios:</span>
                                {data.requiredCandidates.map(c => <Badge key={c} variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">{c}</Badge>)}
                            </div>
                        )}
                        {data.relevantCandidates?.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-zinc-500 font-medium">Relevantes:</span>
                                {data.relevantCandidates.map(c => <Badge key={c} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">{c}</Badge>)}
                            </div>
                        )}
                        {data.signals?.suggestedServiceType && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                <span className="text-sm">🚛</span>
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-purple-400">Servicio sugerido: Despacho Agencia ({Math.round(data.signals.confidence * 100)}%)</p>
                                    <p className="text-xs text-purple-300/70">{data.signals.reasons.join(' · ')}</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <Card className="bg-zinc-900/80 border-zinc-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800 hover:bg-transparent">
                                        <TableHead className="text-zinc-500 text-xs w-[50px]">#</TableHead>
                                        {data.headers.map(h => (
                                            <TableHead key={h} className={`text-xs ${data.requiredCandidates.includes(h) ? 'text-emerald-400 font-semibold' : data.relevantCandidates?.includes(h) ? 'text-blue-400 font-medium' : 'text-zinc-400'}`}>{h}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.sampleRows.slice(0, 20).map((row, i) => (
                                        <TableRow key={i} className="border-zinc-800">
                                            <TableCell className="text-zinc-600 text-xs font-mono">{i + 1}</TableCell>
                                            {data.headers.map(h => {
                                                const w = getParseWarning(i, h)
                                                return <TableCell key={h} className={`text-sm ${w ? 'bg-amber-500/5 border-l-2 border-amber-500/40 text-amber-300' : 'text-zinc-300'}`} title={w?.message}>
                                                    {row[h] || <span className="text-zinc-600 italic text-xs">vacío</span>}
                                                </TableCell>
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {data.totalRows > 20 && <div className="px-4 py-3 border-t border-zinc-800 text-center text-xs text-zinc-500">Mostrando 20 de {data.totalRows}</div>}
                    </Card>
                    <div className="flex items-center justify-between">
                        <Button variant="outline" onClick={reset} className="border-zinc-700 text-zinc-400">← Cambiar archivo</Button>
                        <div className="flex items-center gap-2">
                            {aiStatus.provider === 'heuristics' && (
                                <span className="text-xs text-amber-400/80 max-w-[250px] text-right">
                                    {!aiStatus.aiConfigured ? "IA no configurada. Usando detección automática básica." : "Usando detección heurística fallback."}
                                </span>
                            )}
                            <Button onClick={requestAIMapping} disabled={mappingLoading}
                                className={`text-white shadow-lg transition-all ${aiStatus.provider === 'gemini'
                                    ? "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 shadow-purple-500/20"
                                    : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20"
                                    }`}>
                                {mappingLoading ? (
                                    <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analizando...</span>
                                ) : (
                                    aiStatus.provider === 'gemini' ? '🤖 Mapeo IA (Gemini) →' : '⚡ Mapeo Heurístico →'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Step 3: Mapping Editor ═══ */}
            {step === 3 && data && (
                <div className="space-y-4">
                    {mappingResult?.questions && mappingResult.questions.length > 0 && (
                        <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="py-3">
                            <p className="text-sm font-medium text-amber-400 mb-1">🤔 Preguntas:</p>
                            {mappingResult.questions.map((q, i) => <p key={i} className="text-sm text-amber-300/80">• {q}</p>)}
                        </CardContent></Card>
                    )}
                    {mappingResult?.notes && mappingResult.notes.length > 0 && (
                        <Card className="bg-blue-500/5 border-blue-500/20"><CardContent className="py-3">
                            <p className="text-sm font-medium text-blue-400 mb-1">💡 Notas:</p>
                            {mappingResult.notes.map((n, i) => <p key={i} className="text-sm text-blue-300/80">• {n}</p>)}
                        </CardContent></Card>
                    )}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader><CardTitle className="text-zinc-200">🔗 Mapeo de columnas</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            {mappings.map(m => (
                                <div key={m.sourceHeader} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-zinc-200 font-medium truncate">{m.sourceHeader}</p>
                                        <p className="text-xs text-zinc-500 truncate">Ej: {data.sampleRows[0]?.[m.sourceHeader] || '(vacío)'}</p>
                                    </div>
                                    <span className="text-zinc-600">→</span>
                                    <Select value={m.targetField} onValueChange={val => updateMapping(m.sourceHeader, val)}>
                                        <SelectTrigger className="w-64 bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {TARGET_FIELDS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <span className={`text-xs font-mono ${getConfidenceColor(m.confidence)}`}>{Math.round(m.confidence * 100)}%</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <div className="flex items-center justify-between">
                        <Button variant="outline" onClick={() => setStep(2)} className="border-zinc-700 text-zinc-400">← Preview</Button>
                        <Button onClick={generatePreview} disabled={previewLoading}
                            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                            {previewLoading ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</span> : '📊 Preview →'}
                        </Button>
                    </div>
                </div>
            )}

            {/* ═══ Step 4: Validated Preview + Entity Resolution + Defaults ═══ */}
            {step === 4 && preview && (
                <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: 'Total', value: preview.summary.total, color: 'from-zinc-500 to-zinc-600', icon: '📊' },
                            { label: 'OK', value: preview.summary.ok, color: 'from-emerald-500 to-emerald-600', icon: '✅' },
                            { label: 'Warnings', value: preview.summary.withWarnings, color: 'from-amber-500 to-amber-600', icon: '⚠️' },
                            { label: 'Errores', value: preview.summary.withErrors, color: 'from-red-500 to-red-600', icon: '❌' },
                        ].map(s => (
                            <Card key={s.label} className="bg-zinc-900/80 border-zinc-800">
                                <CardContent className="flex items-center gap-3 py-3 px-4">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg text-sm`}>{s.icon}</div>
                                    <div><p className="text-xl font-bold text-zinc-50">{s.value}</p><p className="text-xs text-zinc-500">{s.label}</p></div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Template found banner */}
                    {templateResult?.found && !templateApplied && (
                        <Card className="bg-indigo-500/10 border-indigo-500/30">
                            <CardContent className="py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">💾</span>
                                        <div>
                                            <p className="text-sm font-medium text-indigo-400">
                                                Plantilla detectada: "{templateResult.template?.name}"
                                                {templateResult.matchType === 'sorted_fallback' && <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">orden diferente</Badge>}
                                            </p>
                                            <p className="text-xs text-indigo-300/60">Aplicar plantilla para usar mapeos y configuraciones guardadas.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-400 text-xs h-7" onClick={() => setTemplateResult(null)}>Ignorar</Button>
                                        <Button size="sm" className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs h-7" onClick={() => applyTemplate(templateResult.template)}>✨ Aplicar</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {/* Template Suggestions */}
                    {templateResult?.suggestions && templateResult.suggestions.length > 0 && !templateApplied && !templateResult.found && (
                        <Card className="bg-indigo-500/5 border-indigo-500/20">
                            <CardHeader className="py-3"><CardTitle className="text-sm text-indigo-400">Plantillas sugeridas</CardTitle></CardHeader>
                            <CardContent className="py-0 pb-3 space-y-2">
                                {templateResult.suggestions.map((s: any) => (
                                    <div key={s.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/40 border border-zinc-700/40">
                                        <div className="text-xs">
                                            <p className="text-zinc-300 font-medium">{s.name}</p>
                                            <p className="text-zinc-500">Coincidencia: {Math.round(s.score * 100)}%</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-6 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                                            onClick={() => applyTemplate(s)}>
                                            Aplicar
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {templateApplied && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <span className="text-sm">✅</span>
                            <p className="text-xs text-indigo-400">Plantilla aplicada correctamente.</p>
                        </div>
                    )}

                    {/* Entity resolution: unresolved agencies */}
                    {unresolvedAgencies.length > 0 && (
                        <Card className="bg-amber-500/5 border-amber-500/20">
                            <CardHeader><CardTitle className="text-amber-400 text-base">🔍 Agencias no encontradas</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                {unresolvedAgencies.map(name => {
                                    const suggestions = fuzzyMatchAgency(name)
                                    const currentResolution = entityResolutions[name]
                                    return (
                                        <div key={name} className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30 space-y-2">
                                            <p className="text-sm text-zinc-200 font-medium">"{name}"</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {suggestions.length > 0 && suggestions.map(s => (
                                                    <Button key={s.id} size="sm" variant="outline"
                                                        className={`text-xs h-7 ${currentResolution === s.id ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-300'}`}
                                                        onClick={() => setEntityResolutions(prev => ({ ...prev, [name]: s.id }))}>
                                                        🚛 {s.name}
                                                    </Button>
                                                ))}
                                                <Button size="sm" variant="outline"
                                                    className={`text-xs h-7 ${currentResolution === null ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'border-zinc-700 text-zinc-400'}`}
                                                    onClick={() => setEntityResolutions(prev => ({ ...prev, [name]: null }))}>
                                                    🚫 Dejar vacío
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </CardContent>
                        </Card>
                    )}

                    {/* Signal suggestion */}
                    {data?.signals?.suggestedServiceType === 'despacho_agencia' && (
                        <Card className="bg-purple-500/5 border-purple-500/20">
                            <CardContent className="py-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">🚛</span>
                                    <div>
                                        <p className="text-sm font-medium text-purple-400">Servicio sugerido: Despacho Agencia <span className="text-xs text-purple-300/60">({Math.round(data.signals.confidence * 100)}% confianza)</span></p>
                                        <p className="text-xs text-purple-300/70 mt-0.5">{data.signals.reasons.join(' · ')}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Global defaults */}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader><CardTitle className="text-zinc-200 text-base">⚙️ Configuración global</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Remitente *</Label>
                                    <Select value={defaults.remitente_org_id || ''} onValueChange={v => {
                                        setDefaults(d => ({ ...d, remitente_org_id: v }))
                                        if (data) resolveTemplate(v, data.headers)
                                    }}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {remitentes.map(r => <SelectItem key={r.id} value={r.id}>📦 {r.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Cadetería</Label>
                                    <Select value={defaults.cadeteria_org_id || ''} onValueChange={v => setDefaults(d => ({ ...d, cadeteria_org_id: v }))}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {cadeterias.map(c => <SelectItem key={c.id} value={c.id}>🏍️ {c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Agencia default</Label>
                                    <Select value={defaults.agencia_org_id || ''} onValueChange={v => setDefaults(d => ({ ...d, agencia_org_id: v }))}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue placeholder="Ninguna" /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            {agencias.map(a => <SelectItem key={a.id} value={a.id}>🚛 {a.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Tipo servicio</Label>
                                    <Select value={defaults.service_type || ''} onValueChange={v => setDefaults(d => ({ ...d, service_type: v }))}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue placeholder="No definido" /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            <SelectItem value="express_24h">⚡ Express 24hs</SelectItem>
                                            <SelectItem value="comun_48h">📦 Común 48hs</SelectItem>
                                            <SelectItem value="despacho_agencia">🚛 Despacho Agencia</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Tamaño paquete</Label>
                                    <Select value={defaults.package_size || 'mediano'} onValueChange={v => setDefaults(d => ({ ...d, package_size: v }))}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            <SelectItem value="chico">📦 Chico</SelectItem>
                                            <SelectItem value="mediano">📦 Mediano</SelectItem>
                                            <SelectItem value="grande">📦 Grande</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400">Tipo entrega</Label>
                                    <Select value={defaults.delivery_type || 'domicilio'} onValueChange={v => setDefaults(d => ({ ...d, delivery_type: v }))}>
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-9 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700">
                                            <SelectItem value="domicilio">🏠 Domicilio</SelectItem>
                                            <SelectItem value="sucursal">🏪 Sucursal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                    <Switch id="dedupe" checked={dedupeCheck} onCheckedChange={setDedupeCheck} />
                                    <Label htmlFor="dedupe" className="text-sm cursor-pointer text-zinc-300">Evitar duplicados (últimas 72h)</Label>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Preview table */}
                    <Card className="bg-zinc-900/80 border-zinc-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800">
                                        <TableHead className="text-zinc-500 text-xs w-[40px]">#</TableHead>
                                        <TableHead className="text-zinc-500 text-xs w-[40px]"></TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Nombre</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Teléfono</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Dirección</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Depto</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Localidad</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Flete</TableHead>
                                        <TableHead className="text-zinc-400 text-xs">Issues</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.previewRows.map(row => {
                                        const st = getRowStatus(row); const n = row.normalized
                                        const issues = [...Object.entries(row.errors).map(([k, v]) => `❌ ${k}: ${v}`), ...row.warnings.map(w => `⚠️ ${w.field}: ${w.message}`)]
                                        return (
                                            <TableRow key={row.rowIndex} className={`border-zinc-800 ${st.color}`}>
                                                <TableCell className="text-zinc-600 text-xs font-mono">{row.rowIndex}</TableCell>
                                                <TableCell title={st.label}>{st.emoji}</TableCell>
                                                <TableCell className="text-sm text-zinc-200">{String(n.recipient_name || '—')}</TableCell>
                                                <TableCell className="text-xs text-zinc-300 font-mono">{String(n.recipient_phone || '—')}</TableCell>
                                                <TableCell className="text-sm text-zinc-300 max-w-[180px] truncate">{String(n.recipient_address || '—')}</TableCell>
                                                <TableCell className="text-sm text-zinc-300">{String(n.department_name || '—')}</TableCell>
                                                <TableCell className="text-sm text-zinc-300">{String(n.locality_name || n.locality_manual || '—')}</TableCell>
                                                <TableCell>{n.is_freight_paid === true ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">Pago</Badge> : '—'}</TableCell>
                                                <TableCell>
                                                    {issues.length > 0 ? (
                                                        <div className="text-xs space-y-0.5 max-w-[220px]">
                                                            {issues.slice(0, 2).map((issue, idx) => <p key={idx} className={issue.startsWith('❌') ? 'text-red-400' : 'text-amber-400'}>{issue}</p>)}
                                                            {issues.length > 2 && <p className="text-zinc-500">+{issues.length - 2}</p>}
                                                        </div>
                                                    ) : <span className="text-emerald-500/50 text-xs">OK</span>}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>

                    <div className="flex items-center justify-between">
                        <Button variant="outline" onClick={() => setStep(3)} className="border-zinc-700 text-zinc-400">← Mapeo</Button>
                        <Button onClick={() => setStep(5)} disabled={!defaults.remitente_org_id}
                            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                            {!defaults.remitente_org_id ? '⚠️ Seleccionar remitente' : 'Confirmar →'}
                        </Button>
                    </div>
                </div>
            )}

            {/* ═══ Step 5: Confirm & Commit ═══ */}
            {step === 5 && data && preview && (
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardHeader><CardTitle className="text-zinc-200">📋 Confirmar importación</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { label: 'Archivo', value: file?.name || '—', icon: '📄' },
                                { label: 'Total filas', value: String(data.totalRows), icon: '📊' },
                                { label: 'Remitente', value: remitentes.find(r => r.id === defaults.remitente_org_id)?.name || '—', icon: '📦' },
                                { label: 'Cadetería', value: cadeterias.find(c => c.id === defaults.cadeteria_org_id)?.name || 'Sin asignar', icon: '🏍️' },
                            ].map(item => (
                                <div key={item.label} className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                                    <p className="text-xs text-zinc-500">{item.icon} {item.label}</p>
                                    <p className="text-sm font-semibold text-zinc-200 mt-1 truncate">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {commitLoading && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-400">Importando...</span>
                                    <span className="text-emerald-400 font-mono">{commitProgress}%</span>
                                </div>
                                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 rounded-full" style={{ width: `${commitProgress}%` }} />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg mb-6">
                            <Switch id="force" checked={force} onCheckedChange={setForce} />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="force" className="text-amber-400 font-medium leading-none cursor-pointer">
                                    Forzar importación de duplicados
                                </Label>
                                <p className="text-xs text-amber-500/70">
                                    Atención: Si activas esto, se crearán envíos aunque ya existan en las últimas 72hs.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Button variant="outline" onClick={() => setStep(4)} disabled={commitLoading} className="border-zinc-700 text-zinc-400">← Volver</Button>
                            <Button onClick={() => doCommit()} disabled={commitLoading}
                                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 px-8">
                                {commitLoading ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importando...</span> : `🚀 Importar ${data.totalRows} envíos`}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══ Step 6: Results ═══ */}
            {step === 6 && commitResult && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: 'Total', value: commitResult.summary.total, color: 'from-zinc-500 to-zinc-600', icon: '📊' },
                            { label: 'Insertados', value: commitResult.summary.inserted, color: 'from-emerald-500 to-emerald-600', icon: '✅' },
                            { label: 'Duplicados', value: commitResult.summary.skipped, color: 'from-blue-500 to-blue-600', icon: '♻️' },
                            { label: 'Con warnings', value: commitResult.summary.withWarnings, color: 'from-amber-500 to-amber-600', icon: '⚠️' },
                            { label: 'Fallidos', value: commitResult.summary.failed, color: 'from-red-500 to-red-600', icon: '❌' },
                        ].map(s => (
                            <Card key={s.label} className="bg-zinc-900/80 border-zinc-800">
                                <CardContent className="flex items-center gap-3 py-3 px-4">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg text-sm`}>{s.icon}</div>
                                    <div><p className="text-xl font-bold text-zinc-50">{s.value}</p><p className="text-xs text-zinc-500">{s.label}</p></div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {commitResult.summary.inserted > 0 && (
                        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-sm text-emerald-400">✅ Se insertaron <strong>{commitResult.summary.inserted}</strong> envíos correctamente.</p>
                        </div>
                    )}
                    {commitResult.summary.skipped > 0 && (
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <p className="text-sm text-blue-400">♻️ Se omitieron <strong>{commitResult.summary.skipped}</strong> envíos duplicados.</p>
                        </div>
                    )}

                    {/* Skipped rows */}
                    {commitResult.summary.skipped > 0 && (
                        <Card className="bg-zinc-900/80 border-zinc-800 overflow-hidden mt-4">
                            <CardHeader><CardTitle className="text-blue-400 text-base">♻️ Duplicados Omitidos</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800">
                                            <TableHead className="text-zinc-500 text-xs w-[50px]">#</TableHead>
                                            <TableHead className="text-zinc-400 text-xs">Razón</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {commitResult.results.filter(r => r.status === 'SKIPPED_DUPLICATE').map(r => (
                                            <TableRow key={r.rowIndex} className="border-zinc-800 bg-blue-500/5">
                                                <TableCell className="text-zinc-600 text-xs font-mono">{r.rowIndex}</TableCell>
                                                <TableCell className="text-sm text-zinc-300">{r.reason}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {commitResult.summary.skipped > 0 && !force && (
                        <div className="flex justify-end mt-4">
                            <Button variant="outline" onClick={retrySkipped} disabled={commitLoading} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                                {commitLoading ? <span className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> Reintentando...</span> : '♻️ Reintentar duplicados (Forzar)'}
                            </Button>
                        </div>
                    )}

                    {/* Failed rows */}
                    {commitResult.summary.failed > 0 && (
                        <Card className="bg-zinc-900/80 border-zinc-800 overflow-hidden">
                            <CardHeader><CardTitle className="text-red-400 text-base">❌ Filas fallidas</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800">
                                            <TableHead className="text-zinc-500 text-xs w-[50px]">#</TableHead>
                                            <TableHead className="text-zinc-400 text-xs">Errores</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {commitResult.results.filter(r => !r.shipmentId).map(r => (
                                            <TableRow key={r.rowIndex} className="border-zinc-800 bg-red-500/5">
                                                <TableCell className="text-zinc-600 text-xs font-mono">{r.rowIndex}</TableCell>
                                                <TableCell className="text-sm">
                                                    {r.errors && Object.entries(r.errors).map(([k, v]) => (
                                                        <p key={k} className="text-red-400 text-xs">❌ {k}: {v}</p>
                                                    ))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex items-center justify-between">
                        <Button variant="outline" onClick={reset} className="border-zinc-700 text-zinc-400">📂 Nueva importación</Button>
                        <div className="flex gap-2">
                            {commitResult.summary.inserted > 0 && defaults.remitente_org_id && !templateSaved && (
                                <Button variant="outline" onClick={() => saveTemplate()} disabled={templateSaving}
                                    className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
                                    {templateSaving ? <span className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> Guardando...</span>
                                        : '💾 Guardar plantilla'}
                                </Button>
                            )}
                            {templateSaved && (
                                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 h-9 px-3">✅ Plantilla guardada</Badge>
                            )}
                            {commitResult.summary.failed > 0 && (
                                <Button variant="outline" onClick={retryFailed} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                                    🔄 Reintentar {commitResult.summary.failed} fallido{commitResult.summary.failed !== 1 ? 's' : ''}
                                </Button>
                            )}
                            <Link href="/admin/shipments">
                                <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                                    📦 Ver envíos
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
