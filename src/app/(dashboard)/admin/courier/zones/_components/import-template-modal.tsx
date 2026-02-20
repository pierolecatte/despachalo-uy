'use client'

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DownloadCloud, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getActiveTemplates, importZoneTemplateAction } from "../actions"

export function ImportTemplateModal({ courierOrgId }: { courierOrgId: string }) {
    const [open, setOpen] = useState(false)
    const [templates, setTemplates] = useState<{ id: string, name: string, description: string, region: string }[]>([])
    const [selectedTemplate, setSelectedTemplate] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (open) {
            setIsFetching(true)
            getActiveTemplates()
                .then(data => setTemplates(data || []))
                .catch(err => toast.error("Error cargando plantillas"))
                .finally(() => setIsFetching(false))
        } else {
            setSelectedTemplate('')
        }
    }, [open])

    async function handleImport() {
        if (!selectedTemplate) return

        setIsLoading(true)
        try {
            const result = await importZoneTemplateAction(selectedTemplate, courierOrgId)
            toast.success(`Se importaron ${result.count} zonas correctamente`)
            setOpen(false)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || "Error al importar plantilla")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <DownloadCloud className="mr-2 h-4 w-4" />
                    Importar Plantilla
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Importar Zonas</DialogTitle>
                    <DialogDescription>
                        Selecciona una plantilla base para importar sus zonas a tu operativa. Podrás editarlas luego sin afectar la plantilla original.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Select value={selectedTemplate} onValueChange={setSelectedTemplate} disabled={isFetching || isLoading}>
                            <SelectTrigger>
                                <SelectValue placeholder={isFetching ? "Cargando..." : "Seleccionar plantilla..."} />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.length === 0 && !isFetching && (
                                    <div className="p-2 text-sm text-muted-foreground text-center">No hay plantillas disponibles</div>
                                )}
                                {templates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>
                                        {t.name} {t.region ? `(${t.region})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedTemplate && (
                            <p className="text-xs text-muted-foreground">
                                {templates.find(t => t.id === selectedTemplate)?.description}
                            </p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleImport} disabled={!selectedTemplate || isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Importar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
