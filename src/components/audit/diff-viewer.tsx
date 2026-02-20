'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

interface AuditDiffViewerProps {
    log: any
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function AuditDiffViewer({ log, open, onOpenChange }: AuditDiffViewerProps) {
    if (!log) return null

    const changes = log.changes || {}
    const oldRecord = log.old_record || {}
    const newRecord = log.new_record || {}
    const hasChanges = Object.keys(changes).length > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-zinc-900 border-zinc-800 text-zinc-100 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span>Detalle de Auditoría</span>
                        <Badge variant="outline">{log.action}</Badge>
                        <span className="text-zinc-500 text-sm font-normal">
                            {log.table_name} / {log.record_id}
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Cambios registrados el {new Date(log.occurred_at).toLocaleString()}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Actor Info */}
                    <div className="bg-zinc-800/30 p-4 rounded-lg border border-zinc-800">
                        <h4 className="text-sm font-medium text-zinc-300 mb-2">Actor</h4>
                        {log.actor_type === 'system' ? (
                            <div className="flex items-center gap-2">
                                <span className="text-purple-400 font-medium">Sistema</span>
                                {log.system_source && <span className="text-zinc-500 text-sm">({log.system_source})</span>}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-zinc-500 block text-xs">Usuario</span>
                                    <span className="text-zinc-200">{log.actor?.full_name || log.actor_user_id || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-zinc-500 block text-xs">Organización</span>
                                    <span className="text-zinc-200">{log.actor?.org?.name || log.actor_org_id || 'N/A'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meta Info */}
                    {(log.meta && Object.keys(log.meta).length > 0) && (
                        <div className="bg-zinc-800/30 p-4 rounded-lg border border-zinc-800">
                            <h4 className="text-sm font-medium text-zinc-300 mb-2">Metadatos</h4>
                            <pre className="text-xs text-zinc-400 overflow-x-auto">
                                {JSON.stringify(log.meta, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Diff View */}
                    <div>
                        <h4 className="text-sm font-medium text-zinc-300 mb-3">Cambios</h4>
                        {log.action === 'INSERT' ? (
                            <div className="space-y-2">
                                <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-md">
                                    <pre className="text-xs text-emerald-300 whitespace-pre-wrap font-mono">
                                        {JSON.stringify(newRecord, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        ) : log.action === 'DELETE' ? (
                            <div className="space-y-2">
                                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-md">
                                    <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
                                        {JSON.stringify(oldRecord, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-zinc-800 rounded-md overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-2 border-b border-zinc-800 w-1/4">Campo</th>
                                            <th className="px-4 py-2 border-b border-zinc-800 w-1/3 text-red-400/80">Valor Anterior</th>
                                            <th className="px-4 py-2 border-b border-zinc-800 w-1/3 text-emerald-400/80">Valor Nuevo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {hasChanges ? (
                                            Object.entries(changes).map(([key, value]) => {
                                                const oldVal = (oldRecord as any)?.[key]
                                                const newVal = (newRecord as any)?.[key]
                                                return (
                                                    <tr key={key} className="hover:bg-zinc-800/30">
                                                        <td className="px-4 py-3 font-medium text-zinc-300 font-mono text-xs">{key}</td>
                                                        <td className="px-4 py-3 text-red-300/90 font-mono text-xs break-all bg-red-900/5">
                                                            {JSON.stringify(oldVal)}
                                                        </td>
                                                        <td className="px-4 py-3 text-emerald-300/90 font-mono text-xs break-all bg-emerald-900/5">
                                                            {JSON.stringify(newVal)}
                                                        </td>
                                                    </tr>
                                                )
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500 italic">
                                                    No se detectaron cambios en campos monitoreados
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
