'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { ZoneEditableMap } from "@/components/pricing/ZoneEditableMap";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ZoneForm({
    action,
    initialData,
    senders,
    courierOrgId
}: {
    action: (formData: FormData) => Promise<{ success: boolean; zoneId?: string; geojson?: any } | never>;
    initialData?: any;
    senders: any[];
    courierOrgId: string;
}) {
    const [geojsonStr, setGeojsonStr] = useState(initialData?.geojson ? JSON.stringify(initialData.geojson) : '');
    const [isAdvancedMode, setIsAdvancedMode] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsPending(true);
        const formData = new FormData(e.currentTarget);
        try {
            await action(formData);
            toast.success("Guardado. Se recortó automáticamente para evitar solapes con zonas existentes.");
            router.push(`/admin/courier/zones?org=${courierOrgId}`);
        } catch (error: any) {
            toast.error(error.message || "Ocurrió un error al guardar la zona");
            setIsPending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <input type="hidden" name="courier_org_id" value={courierOrgId} />
            <input type="hidden" name="id" value={initialData?.id || ''} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Nombre de Zona</Label>
                    <Input id="name" name="name" defaultValue={initialData?.name} placeholder="Ej. Centro, Zona 1, Montevideo" required />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="sender_org_id">Cliente Específico (Opcional)</Label>
                    <Select name="sender_org_id" defaultValue={initialData?.sender_org_id || "__none__"}>
                        <SelectTrigger>
                            <SelectValue placeholder="General (Para todos)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">General (Para todos)</SelectItem>
                            {senders?.filter(s => s.id).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {initialData && (
                    <div className="space-y-2 flex items-center justify-between col-span-1 md:col-span-2 p-4 border rounded-md">
                        <div className="space-y-0.5">
                            <Label htmlFor="is_active">Estado Activo</Label>
                            <div className="text-sm text-muted-foreground">Las zonas inactivas no se aplicarán en el cálculo de tarifas.</div>
                        </div>
                        <Switch id="is_active" name="is_active" defaultChecked={initialData.is_active} value="true" />
                    </div>
                )}
                {!initialData && (
                    <input type="hidden" name="is_active" value="true" />
                )}
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Geometría de la Zona (PostGIS)</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdvancedMode(!isAdvancedMode)}>
                        {isAdvancedMode ? 'Ocultar JSON' : 'Modo Avanzado (JSON)'}
                    </Button>
                </div>

                <div className="border rounded-md overflow-hidden bg-card">
                    <ZoneEditableMap
                        initialGeojson={initialData?.geojson}
                        onChange={(geo) => setGeojsonStr(geo || '')}
                        height="400px"
                    />
                </div>

                <input type="hidden" name="geojson" value={geojsonStr} />

                {isAdvancedMode && (
                    <Textarea
                        value={geojsonStr}
                        onChange={(e) => setGeojsonStr(e.target.value)}
                        placeholder='{"type": "MultiPolygon", "coordinates": [...] }'
                        className="font-mono text-xs h-[150px] mt-2"
                        required
                    />
                )}
                {!geojsonStr && (
                    <p className="text-sm text-destructive mt-1">Debes dibujar al menos un polígono en el mapa para poder guardar la zona.</p>
                )}
            </div>

            <div className="flex justify-end gap-4 pt-4">
                <Link href={`/admin/courier/zones?org=${courierOrgId}`}>
                    <Button type="button" variant="outline" disabled={isPending}>Cancelar</Button>
                </Link>
                <Button type="submit" disabled={!geojsonStr || isPending}>
                    {isPending ? 'Guardando...' : (initialData ? 'Guardar Cambios' : 'Crear Zona')}
                </Button>
            </div>
        </form>
    );
}
