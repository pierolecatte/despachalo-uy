import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { generateSettlement } from "@/lib/pricing/api";
import { revalidatePath } from "next/cache";
import { requireCourierOrg, validateCourierAction } from "@/lib/auth/get-courier-org";

async function generateSettlementAction(formData: FormData) {
    'use server';
    const senderId = formData.get('sender_id') as string;
    const courierId = formData.get('courier_id') as string;

    const validatedCourierId = await validateCourierAction(courierId);

    // Default period: Last month? Or just "All Pending"?
    // The RPC takes specific dates. 
    // For MVP, lets assume we settle "Everything up to today".
    const today = new Date().toISOString().split('T')[0];
    const start = '2024-01-01'; // Arbitrary start, or fetch earliest pending.

    const result = await generateSettlement(validatedCourierId, senderId, start, today);
    if (!result.success) {
        console.error(result.message);
    }
    revalidatePath('/admin/courier/billing');
}

export default async function BillingPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;

    // Resolve context & enforce selection
    const courierOrgId = await requireCourierOrg(orgParam);
    const supabase = await createClient();

    // 1. Fetch Pending Summary by Sender
    // Direct query on view is easier than RPC for now.
    const { data: pendingShipments } = await supabase
        .from('v_shipments_pending_charge' as any)
        .select('*')
        .eq('cadeteria_org_id', courierOrgId);

    // Aggregate by Sender manually
    interface SenderSummary { count: number; total: number; name: string; sender_id: string; }
    const pendingBySender: Record<string, SenderSummary> = {};

    // Get unique sender names
    const senderIds = Array.from(new Set(pendingShipments?.map(s => s.remitente_org_id) || []));
    let senderMap = new Map<string, string>();

    if (senderIds.length > 0) {
        const { data: senders } = await supabase
            .from('organizations')
            .select('id, name')
            .in('id', senderIds);
        senderMap = new Map(senders?.map(s => [s.id, s.name]) || []);
    }

    pendingShipments?.forEach((s: any) => {
        const sid = s.remitente_org_id;
        if (!pendingBySender[sid]) {
            pendingBySender[sid] = {
                count: 0,
                total: 0,
                sender_id: sid,
                name: senderMap.get(sid) || 'Desconocido'
            };
        }
        pendingBySender[sid].count++;
        pendingBySender[sid].total += (s.total_to_charge || 0);
    });

    // 2. Fetch Past Settlements
    const { data: settlements } = await supabase
        .from('settlements' as any)
        .select('*, sender_org:sender_org_id(name)')
        .eq('courier_org_id', courierOrgId)
        .order('created_at', { ascending: false });

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Pendiente de Cobro</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-right">Envíos</TableHead>
                                <TableHead className="text-right">Total Pendiente</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.keys(pendingBySender).length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">No hay envíos pendientes de liquidar.</TableCell>
                                </TableRow>
                            )}
                            {Object.values(pendingBySender).map((item) => (
                                <TableRow key={item.sender_id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-right">{item.count}</TableCell>
                                    <TableCell className="text-right font-bold text-green-600">
                                        {new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(item.total)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <form action={generateSettlementAction}>
                                            <input type="hidden" name="sender_id" value={item.sender_id} />
                                            <input type="hidden" name="courier_id" value={courierOrgId} />
                                            <Button size="sm">Generar Liquidación</Button>
                                        </form>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Liquidaciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Periodo</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Fecha Emisión</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {settlements?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground">No hay liquidaciones generadas.</TableCell>
                                </TableRow>
                            )}
                            {settlements?.map((s: any) => (
                                <TableRow key={s.id}>
                                    <TableCell>{s.sender_org?.name}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {s.period_start} - {s.period_end}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={s.status === 'PAID' ? 'default' : (s.status === 'ISSUED' ? 'secondary' : 'outline')}>
                                            {s.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(s.total_to_charge)}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                        {s.issued_at ? format(new Date(s.issued_at), 'dd/MM/yyyy') : '-'}
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
