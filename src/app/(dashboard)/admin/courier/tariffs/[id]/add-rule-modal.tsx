'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createTariffRuleAction, updateTariffRuleAction } from "./actions";

interface AddRuleModalProps {
    tariffSetId: string;
    serviceTypes: any[];
    zones: any[];
    rule?: any; // If passed, we're in Edit mode
    trigger?: React.ReactNode;
}

export function AddRuleModal({ tariffSetId, serviceTypes, zones, rule, trigger }: AddRuleModalProps) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const isEdit = !!rule;

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErrorMsg(null);
        const formData = new FormData(e.currentTarget);
        formData.append('tariff_set_id', tariffSetId);

        startTransition(async () => {
            let result;
            if (isEdit) {
                result = await updateTariffRuleAction(rule.id, formData);
            } else {
                result = await createTariffRuleAction(formData);
            }

            if (result?.error) {
                setErrorMsg(result.error);
            } else {
                setOpen(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? trigger : (
                    <Button type="button">
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar Regla
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Editar Regla de Precio' : 'Nueva Regla de Precio'}</DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Modifica los valores de esta regla de facturación.' : 'Agrega una nueva regla de facturación para este tarifario.'}
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription className="text-xs mt-1">
                            {errorMsg}
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="service_type">Servicio</Label>
                        <Select name="service_type" defaultValue={rule?.service_type} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar servicio" />
                            </SelectTrigger>
                            <SelectContent>
                                {serviceTypes?.map(st => (
                                    <SelectItem key={st.id || st.code} value={st.code}>{st.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="rule_kind">Tipo de Regla</Label>
                        <Select name="rule_kind" defaultValue={rule?.rule_kind} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo de regla" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="BASE_FEE">Costo Base Fijo (Base Fee)</SelectItem>
                                <SelectItem value="STOP_FEE_BY_ZONE">Costo por Entrega/Visita en Zona (Stop Fee)</SelectItem>
                                <SelectItem value="PACKAGE_FEE_BY_SIZE">Costo por Bulto según Tamaño</SelectItem>
                                <SelectItem value="VEHICLE_HOURLY_RATE">Hora Vehículo</SelectItem>
                                <SelectItem value="PEON_HOURLY_RATE">Hora Peón</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="zone_id">Zona (opcional)</Label>
                            <Select name="zone_id" defaultValue={rule?.zone_id || "none"}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Aplica a Zona..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Cualquier Zona</SelectItem>
                                    {zones?.map(z => (
                                        <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="package_size">Tamaño (opcional)</Label>
                            <Select name="package_size" defaultValue={rule?.package_size || "none"}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Aplica a Tamaño..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Cualquier Tamaño</SelectItem>
                                    <SelectItem value="chico">Pequeño</SelectItem>
                                    <SelectItem value="mediano">Mediano</SelectItem>
                                    <SelectItem value="grande">Grande</SelectItem>
                                    <SelectItem value="especial">Especial</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="amount">Importe en UYU</Label>
                        <Input id="amount" name="amount" type="number" step="0.01" min="0" defaultValue={rule?.amount} placeholder="Ej. 150.00" required />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? 'Guardando...' : (isEdit ? 'Actualizar Regla' : 'Guardar Regla')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
