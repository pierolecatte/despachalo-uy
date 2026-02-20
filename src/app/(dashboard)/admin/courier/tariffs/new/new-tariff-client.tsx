'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { createTariffSetAction } from "./actions";

export function NewTariffClient({ courierOrgId, senders }: { courierOrgId: string, senders: any[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErrorMsg(null);
        const formData = new FormData(e.currentTarget);

        startTransition(async () => {
            const result = await createTariffSetAction(formData);

            if (result?.error) {
                setErrorMsg(result.error);
            } else if (result?.redirectUrl) {
                router.push(result.redirectUrl);
            } else {
                router.push(`/admin/courier/tariffs?org=${courierOrgId}`);
            }
        });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Nuevo Tarifario</h2>
            </div>

            {errorMsg && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error al crear el tarifario</AlertTitle>
                    <AlertDescription className="font-mono text-xs whitespace-pre-wrap mt-2">
                        {errorMsg}
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Detalles del Tarifario</CardTitle>
                    <CardDescription>Define el nombre y el alcance de estas tarifas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input type="hidden" name="courier_org_id" value={courierOrgId} />
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre</Label>
                            <Input id="name" name="name" placeholder="Ej. Tarifas 2024, Especial Cliente X" required />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="scope">Alcance</Label>
                            <Select name="scope" required defaultValue="GENERIC">
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona alcance" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="GENERIC">General (Por defecto)</SelectItem>
                                    <SelectItem value="BY_SENDER">Específico por Cliente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sender_org_id">Cliente (Solo si es específico)</Label>
                            <Select name="sender_org_id">
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un cliente (Opcional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {senders?.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <Link href={`/admin/courier/tariffs?org=${courierOrgId}`}>
                                <Button variant="outline" disabled={isPending}>Cancelar</Button>
                            </Link>
                            <Button type="submit" disabled={isPending}>Crear Tarifario</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
