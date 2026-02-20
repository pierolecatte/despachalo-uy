import { createClient, getPricingClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AddRuleModal } from "./add-rule-modal";
import { RuleActionsMenu } from "./rule-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";
import { withOrgQuery } from "@/lib/courier/url-helpers";

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function TariffDetailsPage(props: PageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;
    const courierOrgId = await requireCourierOrg(orgParam);

    const supabase = await createClient();
    const pricingDb = await getPricingClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return <div>Access Denied</div>;

    const { id } = params;

    let { data: tariffSetRaw } = await pricingDb
        .from('tariff_sets' as any)
        .select('*')
        .eq('id', id)
        .single();

    if (!tariffSetRaw) return notFound();

    // Manually fetch sender org
    let senderOrg = null;
    if (tariffSetRaw.sender_org_id) {
        const { data: sender } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('id', tariffSetRaw.sender_org_id)
            .single();
        senderOrg = sender;
    }

    const tariffSet = { ...tariffSetRaw, sender_org: senderOrg };

    // Fetch Rules
    const { data: rules } = await pricingDb
        .from('tariff_rules' as any)
        .select('*, zone:zone_id(name)')
        .eq('tariff_set_id', id)
        .order('service_type')
        .order('rule_kind');

    // Fetch dependencies for the modal
    const { data: serviceTypes } = await supabase.from('service_types').select('*').order('name');
    const { data: zones } = await pricingDb
        .from('zones' as any)
        .select('id, name')
        .eq('courier_org_id', tariffSet.courier_org_id)
        .is('is_active', true)
        .order('name');

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href={withOrgQuery("/admin/courier/tariffs", courierOrgId)}>
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
                <AddRuleModal
                    tariffSetId={tariffSet.id}
                    serviceTypes={serviceTypes || []}
                    zones={zones || []}
                />
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
                                        <RuleActionsMenu
                                            rule={rule}
                                            tariffSetId={tariffSet.id}
                                            serviceTypes={serviceTypes || []}
                                            zones={zones || []}
                                        />
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
