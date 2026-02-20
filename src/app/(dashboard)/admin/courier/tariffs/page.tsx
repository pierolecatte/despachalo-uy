import { createClient, getPricingClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";

export default async function TariffsPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;

    // Resolve context & enforce selection
    const courierOrgId = await requireCourierOrg(orgParam);
    const pricingDb = await getPricingClient();

    const { data: tariffSetsRaw, error } = await pricingDb
        .from('tariff_sets' as any)
        .select('*')
        .eq('courier_org_id', courierOrgId)
        .order('created_at', { ascending: false });

    // Manually fetch sender organizations to bypass PostgREST cross-schema relation issues (PGRST200)
    let tariffSets = tariffSetsRaw || [];
    if (tariffSets.length > 0) {
        const senderIds = Array.from(new Set(tariffSets.map(ts => ts.sender_org_id).filter(Boolean)));

        if (senderIds.length > 0) {
            const supabase = await createClient(); // Need public schema for organizations
            const { data: senders } = await supabase
                .from('organizations')
                .select('id, name')
                .in('id', senderIds);

            const senderMap = new Map(senders?.map(s => [s.id, s]) || []);
            tariffSets = tariffSets.map(ts => ({
                ...ts,
                sender_org: ts.sender_org_id ? senderMap.get(ts.sender_org_id) : null
            }));
        }
    }

    // Fetch Senders (for "Create New" modal later, but maybe just a link for now)

    return (
        <div className="space-y-6">
            <div className="flex justify-end items-center">
                <Link href={`/admin/courier/tariffs/new${orgParam ? `?org=${orgParam}` : ''}`}>
                    <Button>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Tarifario
                    </Button>
                </Link>
            </div>


            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Alcance</TableHead>
                            <TableHead>Cliente Específico</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tariffSets?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No hay tarifarios creados.
                                </TableCell>
                            </TableRow>
                        )}
                        {tariffSets?.map((set: any) => (
                            <TableRow key={set.id}>
                                <TableCell className="font-medium">{set.name}</TableCell>
                                <TableCell>
                                    <Badge variant={set.scope === 'GENERIC' ? "secondary" : "outline"}>
                                        {set.scope === 'GENERIC' ? 'General' : 'Por Cliente'}
                                    </Badge>
                                </TableCell>
                                <TableCell>{set.sender_org?.name || '-'}</TableCell>
                                <TableCell>
                                    <Badge variant={set.is_active ? "default" : "destructive"}>
                                        {set.is_active ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Link href={`/admin/courier/tariffs/${set.id}${orgParam ? `?org=${orgParam}` : ''}`}>
                                        <Button variant="ghost" size="sm">
                                            Editar Reglas
                                        </Button>
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
