import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { notFound } from "next/navigation";

interface PageProps {
    params: { id: string };
}

export default async function TariffDetailsPage({ params }: PageProps) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return <div>Access Denied</div>;

    const { id } = params;

    // Fetch Tariff Set details
    const { data: tariffSet } = await supabase
        .from('tariff_sets' as any)
        .select('*, sender_org:sender_org_id(name)')
        .eq('id', id)
        .single();

    if (!tariffSet) return notFound();

    // Fetch Rules
    const { data: rules } = await supabase
        .from('tariff_rules' as any)
        .select('*, zone:zone_id(name)')
        .eq('tariff_set_id', id)
        .order('service_type')
        .order('rule_kind');

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/courier/tariffs">
                    <Button variant="outline" size="icon">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{tariffSet.name}</h2>
                    <div className="flex gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{tariffSet.scope === 'GENERIC' ? 'General' : 'Por Cliente'}</Badge>
                        {tariffSet.sender_org && <Badge variant="secondary">{tariffSet.sender_org.name}</Badge>}
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                {/* TODO: Add Rule Modal/Page */}
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar Regla
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Reglas de Precio</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Servicio</TableHead>
                                <TableHead>Tipo de Regla</TableHead>
                                <TableHead>Condición (Zona/Tamaño)</TableHead>
                                <TableHead>Importe</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rules?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">
                                        No hay reglas configuradas.
                                    </TableCell>
                                </TableRow>
                            )}
                            {rules?.map((rule: any) => (
                                <TableRow key={rule.id}>
                                    <TableCell className="font-mono text-xs">{rule.service_type}</TableCell>
                                    <TableCell>{rule.rule_kind}</TableCell>
                                    <TableCell>
                                        {rule.zone?.name && <Badge variant="outline" className="mr-1">Zona: {rule.zone.name}</Badge>}
                                        {rule.package_size && <Badge variant="outline" className="mr-1">Tamaño: {rule.package_size}</Badge>}
                                    </TableCell>
                                    <TableCell className="font-bold">
                                        {new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(rule.amount)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm">Editar</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
