import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function TariffsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return <div>Access Denied</div>;

    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

    if (!orgMember) return <div>No organization found</div>;

    // Fetch Tariff Sets
    const { data: tariffSets } = await supabase
        .from('tariff_sets' as any)
        .select('*, sender_org:sender_org_id(name)')
        .eq('courier_org_id', orgMember.organization_id)
        .order('created_at', { ascending: false });

    // Fetch Senders (for "Create New" modal later, but maybe just a link for now)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Tarifarios</h2>
                    <p className="text-muted-foreground">
                        Gestiona los conjuntos de tarifas (General y por Cliente).
                    </p>
                </div>
                <Link href="/admin/courier/tariffs/new">
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
                                    <Link href={`/admin/courier/tariffs/${set.id}`}>
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
