'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateUY } from '@/lib/utils'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import AuditDiffViewer from './diff-viewer'

interface AuditLogEntry {
    id: string
    occurred_at: string
    actor_type: 'human' | 'system'
    action: string
    table_name: string
    record_id: string
    actor_user_id: string | null
    system_source: string | null
    changes: any
    old_record: any
    new_record: any
    actor?: {
        full_name: string
        email: string
        role: string
        org?: {
            name: string
        }
    }
}

interface AuditTableProps {
    scope: 'global' | 'my_org'
}

export default function AuditLogTable({ scope }: AuditTableProps) {
    const supabase = createClient()
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

    useEffect(() => {
        fetchLogs()
    }, [scope])

    async function fetchLogs() {
        setLoading(true)

        // Query the public view instead of the schema directly to avoid configuration issues
        let query = supabase
            .from('audit_logs_view')
            .select('*')
            .order('occurred_at', { ascending: false })
            .limit(50)

        const { data, error } = await query

        if (error) {
            console.error('Error fetching audit logs:', error)
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            })
        } else {
            // Map the flat view structure back to our nested interface
            const mappedLogs: AuditLogEntry[] = (data || []).map((row: any) => ({
                id: row.id,
                occurred_at: row.occurred_at,
                actor_type: row.actor_type,
                action: row.action,
                table_name: row.table_name,
                record_id: row.record_id,
                actor_user_id: row.actor_user_id,
                system_source: row.system_source,
                changes: row.changes,
                old_record: row.old_record,
                new_record: row.new_record,
                // Reconstruct the actor object
                actor: row.actor_user_id ? {
                    full_name: row.actor_name,
                    email: row.actor_email,
                    role: row.actor_role,
                    org: row.actor_org_name ? { name: row.actor_org_name } : undefined
                } : undefined
            }))

            setLogs(mappedLogs)
        }
        setLoading(false)
    }

    function getActionColor(action: string) {
        switch (action) {
            case 'INSERT': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            case 'UPDATE': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            case 'DELETE': return 'bg-red-500/10 text-red-400 border-red-500/20'
            default: return 'bg-zinc-800 text-zinc-400'
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                    🔄 Refrescar
                </Button>
            </div>

            <div className="rounded-md border border-zinc-800">
                <Table>
                    <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                            <TableHead className="text-zinc-400">Fecha</TableHead>
                            <TableHead className="text-zinc-400">Actor</TableHead>
                            <TableHead className="text-zinc-400">Acción</TableHead>
                            <TableHead className="text-zinc-400">Entidad</TableHead>
                            <TableHead className="text-zinc-400">Cambios</TableHead>
                            <TableHead className="text-zinc-400 text-right">Detalle</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                                    Cargando auditoría...
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                                    No se encontraron registros.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-900/30">
                                    <TableCell className="font-mono text-xs text-zinc-400">
                                        {formatDateUY(log.occurred_at)}
                                    </TableCell>
                                    <TableCell>
                                        {log.actor_type === 'system' ? (
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="bg-purple-900/20 text-purple-400 border-purple-800/30">
                                                    🤖 System
                                                </Badge>
                                                {log.system_source && (
                                                    <span className="text-xs text-zinc-500">({log.system_source})</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <span className="text-sm text-zinc-200">
                                                    {log.actor?.full_name || 'Desconocido'}
                                                </span>
                                                <span className="text-xs text-zinc-500">
                                                    {log.actor?.org?.name} • {log.actor?.role}
                                                </span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getActionColor(log.action)}>
                                            {log.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-zinc-300">{log.table_name}</span>
                                            <span className="text-xs font-mono text-zinc-600 truncate max-w-[100px]" title={log.record_id}>
                                                {log.record_id}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-xs text-zinc-400 max-w-[200px] truncate">
                                            {log.changes ? Object.keys(log.changes).join(', ') : '-'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedLog(log)}
                                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                        >
                                            Ver
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {selectedLog && (
                <AuditDiffViewer
                    log={selectedLog}
                    open={!!selectedLog}
                    onOpenChange={(open) => !open && setSelectedLog(null)}
                />
            )}
        </div>
    )
}
