'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useLocalities, useLocalitySearch, LocalitySearchResult } from '@/hooks/use-locations'
import { Switch } from '@/components/ui/switch'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────
interface RecipientSuggestion {
    recipient_id: string
    recipient_address_id: string | null
    full_name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    department: string | null
    locality_id?: number | null
    locality_manual?: string | null
    last_used_at: string | null
    score: number
}

export interface RecipientData {
    recipientName: string
    recipientPhone: string
    recipientEmail: string
    recipientAddress: string
    recipientCity: string
    recipientDepartment: string
    recipientObservations: string
    recipientId: string | null
    recipientAddressId: string | null
    departmentId: string | number | null
    localityId: string | number | null
    localityManual: string | null
}

interface Department {
    id: number
    name: string
}

interface RecipientAutocompleteProps {
    departments: Department[]
    initialData?: Partial<RecipientData>
    onChange?: (data: RecipientData) => void
    /** Ref to expose current values for form submission */
    dataRef?: React.MutableRefObject<RecipientData | null>
    /** Org ID to scope the search (e.g. selected remitente's org) */
    orgId?: string
}

type SearchField = 'name' | 'email' | 'phone' | 'address'

// ─── Helper: relative time ──────────────────────────────────────
function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `hace ${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `hace ${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 30) return `hace ${days}d`
    return `hace ${Math.floor(days / 30)}m`
}

// ─── Component ──────────────────────────────────────────────────
export default function RecipientAutocomplete({
    departments,
    initialData,
    onChange,
    dataRef,
    orgId,
}: RecipientAutocompleteProps) {
    // Controlled field state
    const [name, setName] = useState(initialData?.recipientName || '')
    const [phone, setPhone] = useState(initialData?.recipientPhone || '')
    const [email, setEmail] = useState(initialData?.recipientEmail || '')
    const [address, setAddress] = useState(initialData?.recipientAddress || '')
    const [observations, setObservations] = useState(initialData?.recipientObservations || '')

    // Location State
    const [knowsDepartment, setKnowsDepartment] = useState(true)
    const [selectedDeptId, setSelectedDeptId] = useState<string | number | null>(initialData?.departmentId || null)
    const [selectedLocalityId, setSelectedLocalityId] = useState<string | number | null>(initialData?.localityId || null)
    const [localityManual, setLocalityManual] = useState(initialData?.localityManual || '')
    const [isManualLocality, setIsManualLocality] = useState(!!initialData?.localityManual)

    // Global Search State
    const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
    const [globalSearchQuery, setGlobalSearchQuery] = useState('')
    const { results: globalSearchResults, loading: loadingGlobalSearch, search: searchGlobal, clearResults: clearGlobalResults } = useLocalitySearch()

    // Legacy support: We still expose recipientDepartment string, derived or manual
    // But we prioritize the ID.

    const [recipientId, setRecipientId] = useState<string | null>(initialData?.recipientId || null)
    const [recipientAddressId, setRecipientAddressId] = useState<string | null>(initialData?.recipientAddressId || null)

    // Suggestion dropdown state
    const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [activeField, setActiveField] = useState<SearchField | null>(null)

    // Hook for localities
    const { localities, loading: loadingLocalities } = useLocalities(selectedDeptId)

    // Refs
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // ─── Derived State ────────────────────────────────────────
    // Find department name for legacy compatibility
    const deptName = useMemo(() => {
        return departments.find(d => String(d.id) === String(selectedDeptId))?.name || ''
    }, [departments, selectedDeptId])

    const cityName = useMemo(() => {
        if (isManualLocality) return localityManual
        // Try to find name in loaded dependent localities
        const foundInDependent = localities.find(l => String(l.id) === String(selectedLocalityId))?.name
        if (foundInDependent) return foundInDependent

        // If not found (e.g. global search selected but dependent localities not loaded or mismatch?)
        // Actually, if we selected via global search, we auto-selected department, so `localities` should load.
        // But there is a race condition: setDept -> fetching -> localities not ready yet.
        // Use a ref or local state to store the "selected locality name" temporarily?
        // For simpler logic, we rely on `localities` or fallback to empty until loaded.
        return foundInDependent || ''
    }, [isManualLocality, localityManual, localities, selectedLocalityId])

    // ─── Sync data ref for parent form ────────────────────────
    const currentData = useCallback((): RecipientData => ({
        recipientName: name,
        recipientPhone: phone,
        recipientEmail: email,
        recipientAddress: address,
        recipientCity: cityName,
        recipientDepartment: deptName,
        recipientObservations: observations,
        recipientId,
        recipientAddressId,
        departmentId: selectedDeptId,
        localityId: isManualLocality ? null : selectedLocalityId,
        localityManual: isManualLocality ? localityManual : null
    }), [name, phone, email, address, cityName, deptName, observations, recipientId, recipientAddressId, selectedDeptId, selectedLocalityId, isManualLocality, localityManual])

    useEffect(() => {
        if (dataRef) dataRef.current = currentData()
    }, [dataRef, currentData])

    useEffect(() => {
        onChange?.(currentData())
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentData])

    // ─── Global Search Effect ───
    useEffect(() => {
        const timer = setTimeout(() => {
            if (globalSearchQuery.length >= 2) {
                searchGlobal(globalSearchQuery)
            } else {
                clearGlobalResults()
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [globalSearchQuery, searchGlobal, clearGlobalResults])

    // ─── Fetch suggestions ────────────────────────────────────
    const fetchSuggestions = useCallback(async (field: SearchField, query: string) => {
        if (query.trim().length < 2) {
            setSuggestions([])
            setShowDropdown(false)
            return
        }

        try {
            const params = new URLSearchParams({ field, q: query, limit: '8' })
            if (orgId) params.set('org_id', orgId)
            const res = await fetch(`/api/recipients/suggestions?${params}`)
            if (!res.ok) {
                setSuggestions([])
                return
            }
            const json = await res.json()
            setSuggestions(json.suggestions || [])
            setShowDropdown((json.suggestions || []).length > 0)
            setActiveIndex(-1)
        } catch {
            setSuggestions([])
        }
    }, [orgId])

    // ─── Debounced field change ───────────────────────────────
    const handleFieldChange = useCallback((field: SearchField, value: string) => {
        // Clear previous match when user types
        setRecipientId(null)
        setRecipientAddressId(null)
        setActiveField(field)

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            fetchSuggestions(field, value)
        }, 250)
    }, [fetchSuggestions])

    // ─── Select a suggestion ──────────────────────────────────
    const selectSuggestion = useCallback((s: RecipientSuggestion) => {
        setName(s.full_name || '')
        setEmail(s.email || '')
        setPhone(s.phone || '')
        setAddress(s.address || '')
        setObservations('') // Assuming suggestions don't have observations usually

        // Handle Location
        // Try to match department name to ID
        const matchedDept = departments.find(d =>
            d.name.toLowerCase() === (s.department || '').toLowerCase()
        )

        if (matchedDept) {
            setSelectedDeptId(matchedDept.id)
            setKnowsDepartment(true) // Switch to dependent mode on suggestion select
            // We can't immediately set locality ID because we need to wait for localities to fetch?
            // Or we relies on the fact that if we setDeptId, the hook will run.
            // But we don't have the locality ID in the suggestion unless we updated the suggestion API too.
            // The current suggestion API returns 'city' string.
            // We will try to match it later or just set manual if no match found?
            // Actually, if we want full automation, the suggestion API should return IDs.
            // For now, let's reset to manual if we can't match ID easily or if suggestion lacks ID.

            // If the suggestion has IDs (if we updated backend), use them.
            if (s.locality_id) {
                setSelectedLocalityId(s.locality_id)
                setIsManualLocality(false)
                setLocalityManual('')
            } else if (s.city) {
                // If we don't have ID, we might need to set manual with the city name
                // UNLESS we can match it against the loaded localities.
                // But localities are not loaded yet for this new department.
                // So reliable way is to default to manual with the city name.
                setIsManualLocality(true)
                setLocalityManual(s.city)
                setSelectedLocalityId(null)
            } else {
                setSelectedLocalityId(null)
                setIsManualLocality(false)
            }
        } else {
            // Department not found in our list?
            setSelectedDeptId(null)
            setSelectedLocalityId(null)
            setLocalityManual(s.city || '')
            setIsManualLocality(!!s.city)
        }

        setRecipientId(s.recipient_id)
        setRecipientAddressId(s.recipient_address_id)
        setShowDropdown(false)
        setSuggestions([])
        setActiveIndex(-1)
    }, [departments])

    // ─── Keyboard nav ─────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!showDropdown || suggestions.length === 0) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault()
            selectSuggestion(suggestions[activeIndex])
        } else if (e.key === 'Escape') {
            setShowDropdown(false)
            setActiveIndex(-1)
        }
    }, [showDropdown, suggestions, activeIndex, selectSuggestion])

    // ─── Click outside to close ───────────────────────────────
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // ─── Scroll active item into view ─────────────────────────
    useEffect(() => {
        if (activeIndex >= 0 && dropdownRef.current) {
            const item = dropdownRef.current.children[activeIndex] as HTMLElement
            item?.scrollIntoView({ block: 'nearest' })
        }
    }, [activeIndex])

    // ─── Render ───────────────────────────────────────────────
    return (
        <div ref={containerRef} className="relative space-y-4" onKeyDown={handleKeyDown}>
            {/* Row 1: name + phone */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-zinc-300">Nombre completo *</Label>
                    <Input
                        value={name}
                        onChange={e => {
                            setName(e.target.value)
                            handleFieldChange('name', e.target.value)
                        }}
                        required
                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                        placeholder="Nombre del destinatario"
                        autoComplete="off"
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-zinc-300">Teléfono</Label>
                    <Input
                        value={phone}
                        onChange={e => {
                            setPhone(e.target.value)
                            handleFieldChange('phone', e.target.value)
                        }}
                        className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                        placeholder="09X XXX XXX"
                        autoComplete="off"
                    />
                </div>
            </div>

            {/* Row 2: email */}
            <div className="space-y-2">
                <Label className="text-zinc-300">Email</Label>
                <Input
                    value={email}
                    onChange={e => {
                        setEmail(e.target.value)
                        handleFieldChange('email', e.target.value)
                    }}
                    type="email"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                    placeholder="destinatario@email.com"
                    autoComplete="off"
                />
            </div>

            {/* Row 3: address */}
            <div className="space-y-2">
                <Label className="text-zinc-300">Dirección *</Label>
                <Input
                    value={address}
                    onChange={e => {
                        setAddress(e.target.value)
                        handleFieldChange('address', e.target.value)
                    }}
                    required
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                    placeholder="Calle, número, apto..."
                    autoComplete="off"
                />
            </div>

            {/* ─── Location Section ─── */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="mode-toggle" className="text-zinc-400 text-sm">
                            ¿Sabés el departamento?
                        </Label>
                        <Switch
                            id="mode-toggle"
                            checked={!knowsDepartment}
                            onCheckedChange={(val) => {
                                setKnowsDepartment(!val)
                                // Reset fields to avoid invalid state
                                setSelectedLocalityId(null)
                                setLocalityManual('')
                                setIsManualLocality(false)
                                if (val) {
                                    // Switching to "Don't know" -> "Search by locality"
                                    // We keep department if needed? No, user requested: "reset relevant fields"
                                    setSelectedDeptId(null)
                                }
                            }}
                            className="scale-90 data-[state=checked]:bg-emerald-600"
                        />
                        <span className="text-xs font-medium text-emerald-400/90 min-w-[140px]">
                            {knowsDepartment ? "Sí (Elegí el depto)" : "No (Buscá localidad)"}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                    {/* Row 4a: Dependent Mode (Default) */}
                    {knowsDepartment ? (
                        <>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Departamento</Label>
                                <Select
                                    value={selectedDeptId ? String(selectedDeptId) : ''}
                                    onValueChange={(val) => {
                                        setSelectedDeptId(Number(val))
                                        setSelectedLocalityId(null)
                                        setLocalityManual('')
                                        setIsManualLocality(false)
                                    }}
                                >
                                    <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700 max-h-[300px]">
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-zinc-300">Localidad</Label>
                                {isManualLocality ? (
                                    <div className="relative">
                                        <Input
                                            value={localityManual}
                                            onChange={e => setLocalityManual(e.target.value)}
                                            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 pr-8"
                                            placeholder="Escribí la localidad..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsManualLocality(false)
                                                setLocalityManual('')
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                            title="Volver a lista"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <Select
                                        value={selectedLocalityId ? String(selectedLocalityId) : ''}
                                        onValueChange={(val) => {
                                            if (val === 'manual_option') {
                                                setIsManualLocality(true)
                                                setSelectedLocalityId(null)
                                            } else {
                                                setSelectedLocalityId(Number(val))
                                            }
                                        }}
                                        disabled={!selectedDeptId || loadingLocalities}
                                    >
                                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100">
                                            <SelectValue placeholder={!selectedDeptId ? "Selecciona depto" : "Seleccionar..."} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-800 border-zinc-700 max-h-[300px]">
                                            {localities.map(l => (
                                                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                                            ))}
                                            <SelectItem value="manual_option" className="text-amber-400 font-medium border-t border-zinc-700 mt-1 pt-2">
                                                -- No encuentro mi localidad --
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </>
                    ) : (
                        /* Row 4b: Global Search Mode */
                        <>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Buscar Localidad</Label>
                                <Popover open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={globalSearchOpen}
                                            className="w-full justify-between bg-zinc-800/50 border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
                                        >
                                            {selectedLocalityId
                                                ? cityName || "Localidad seleccionada" // Fallback name
                                                : isManualLocality
                                                    ? "Manual: " + localityManual
                                                    : "Buscar localidad..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0 bg-zinc-900 border-zinc-700" align="start">
                                        <Command shouldFilter={false}>
                                            <CommandInput
                                                placeholder="Escribe para buscar..."
                                                value={globalSearchQuery}
                                                onValueChange={setGlobalSearchQuery}
                                                className="text-zinc-100"
                                            />
                                            <CommandList>
                                                {loadingGlobalSearch ? (
                                                    <div className="flex items-center justify-center p-4">
                                                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        {globalSearchResults.length === 0 && globalSearchQuery.length >= 2 && (
                                                            <CommandEmpty className="py-2 px-4 text-sm text-zinc-500">
                                                                No encontrado.
                                                                <div className="mt-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 h-auto py-1"
                                                                        onClick={() => {
                                                                            setIsManualLocality(true)
                                                                            setSelectedLocalityId(null)
                                                                            setLocalityManual(globalSearchQuery)
                                                                            setGlobalSearchOpen(false)
                                                                            // Dept becomes required but user must select it now.
                                                                            // We can't auto-select.
                                                                        }}
                                                                    >
                                                                        Usar "{globalSearchQuery}" (Manual)
                                                                    </Button>
                                                                </div>
                                                            </CommandEmpty>
                                                        )}
                                                        <CommandGroup>
                                                            {globalSearchResults.map((result) => (
                                                                <CommandItem
                                                                    key={result.id}
                                                                    value={String(result.id)}
                                                                    onSelect={() => {
                                                                        setSelectedLocalityId(result.id)
                                                                        setSelectedDeptId(result.department_id) // Auto-select Dept
                                                                        setIsManualLocality(false)
                                                                        setLocalityManual('')
                                                                        setGlobalSearchOpen(false)
                                                                    }}
                                                                    className="text-zinc-100 aria-selected:bg-zinc-800"
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            selectedLocalityId === result.id ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span>{result.name}</span>
                                                                        <span className="text-xs text-zinc-500">{result.department_name}</span>
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Department Read-only or Selectable if Manual */}
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Departamento</Label>
                                <Select
                                    value={selectedDeptId ? String(selectedDeptId) : ''}
                                    onValueChange={(val) => setSelectedDeptId(Number(val))}
                                    disabled={!isManualLocality && !!selectedLocalityId} // Readonly if auto-selected
                                >
                                    <SelectTrigger className={cn(
                                        "bg-zinc-800/50 border-zinc-700 text-zinc-100",
                                        (!isManualLocality && !!selectedLocalityId) && "opacity-70 cursor-not-allowed bg-zinc-900"
                                    )}>
                                        <SelectValue placeholder={isManualLocality ? "Seleccioná el depto" : "Automático"} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700">
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Row 5: observations */}
            <div className="space-y-2">
                <Label className="text-zinc-300">Observaciones</Label>
                <Textarea
                    value={observations}
                    onChange={e => setObservations(e.target.value)}
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-100 min-h-[60px]"
                    placeholder="Ej: Timbre no funciona, golpear puerta, dejar en portería..."
                />
            </div>

            {/* ─── Suggestions dropdown ─────────────────────── */}
            {showDropdown && suggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 left-0 right-0 mt-1 max-h-[380px] overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-900/95 backdrop-blur-lg shadow-2xl shadow-black/40"
                    style={{ top: activeField === 'name' ? '72px' : activeField === 'email' ? '164px' : activeField === 'phone' ? '72px' : '216px' }}
                >
                    <div className="p-1.5">
                        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                            Sugerencias — {suggestions.length} resultado{suggestions.length > 1 ? 's' : ''}
                        </p>
                        {suggestions.map((s, idx) => (
                            <button
                                key={`${s.recipient_id}-${s.recipient_address_id || idx}`}
                                type="button"
                                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-100 ${idx === activeIndex
                                    ? 'bg-emerald-500/15 border border-emerald-500/30'
                                    : 'hover:bg-zinc-800/80 border border-transparent'
                                    }`}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onClick={() => selectSuggestion(s)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold">
                                            {(s.full_name || '?')[0].toUpperCase()}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-zinc-100 truncate">
                                                    {s.full_name}
                                                </span>
                                                {s.email && (
                                                    <span className="text-xs text-zinc-500 truncate hidden sm:inline">
                                                        {s.email}
                                                    </span>
                                                )}
                                            </div>
                                            {(s.address || s.phone) && (
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {s.phone && (
                                                        <span className="text-[11px] text-zinc-500">
                                                            📞 {s.phone}
                                                        </span>
                                                    )}
                                                    {s.address && (
                                                        <span className="text-[11px] text-zinc-500 truncate">
                                                            📍 {s.address}{s.city ? `, ${s.city}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {s.last_used_at && (
                                        <span className="flex-shrink-0 text-[10px] text-zinc-600">
                                            {timeAgo(s.last_used_at)}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
