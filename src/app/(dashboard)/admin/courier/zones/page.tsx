import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PlusCircle, Pencil, Map as MapIcon } from "lucide-react";
import { ZoneMap } from "@/components/pricing/ZoneMap";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";
import { ImportTemplateModal } from "./_components/import-template-modal";
import { DeleteZoneButton } from "./_components/delete-zone-button";

export default async function ZonesPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;

    // Resolve context
    const courierOrgId = await requireCourierOrg(orgParam);
    const supabase = await createClient();

    // Fetch Courier Org Name for context
    const { data: courierOrg } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', courierOrgId)
        .single();

    const courierName = courierOrg?.name || 'Desconocida';

    // Fetch Zones using the public client because 'zones' is exposed via view and it makes joining 'organizations' trivial
    const { data: zones, error: fetchError } = await supabase
        .from('zones' as any)
        .select('*, sender_org:organizations!sender_org_id(name), geojson')
        .eq('courier_org_id', courierOrgId)
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error("Error fetching zones:", fetchError);
    }

    // Developer Logs
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Zonas] orgParam: ${orgParam}, resolvedCourierName: ${courierName}, totalZones: ${zones?.length || 0}`);
    }

    // Format for Map
    const mapZones = zones?.map((z) => ({
        id: z.id,
        name: z.name,
        geojson: z.geojson,
        color: z.sender_org_id ? 'orange' : 'blue' // Color code by type
    })) || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-end items-center mb-2">
                <div className="flex items-center gap-2">
                    <ImportTemplateModal courierOrgId={courierOrgId} />
                    <Link href={`/admin/courier/zones/new?org=${courierOrgId}`}>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Nueva Zona
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List */}
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Listado</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead className="w-[80px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {zones?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                                                No hay zonas cargadas para la cadetería <strong>{courierName}</strong>.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {zones?.map((zone) => (
                                        <TableRow key={zone.id}>
                                            <TableCell>
                                                <div className="font-medium">{zone.name}</div>
                                                <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-1">
                                                    <span>{zone.sender_org ? `Cliente: ${zone.sender_org.name}` : 'General (Para todos)'}</span>
                                                    {zone.source_template_id && (
                                                        <Badge variant="outline" className="w-fit text-[10px] h-4 px-1 py-0">Importada</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Link href={`/admin/courier/zones/${zone.id}?org=${courierOrgId}`}>
                                                        <Button variant="ghost" size="icon" type="button">
                                                            <Pencil className="h-4 w-4 text-muted-foreground" />
                                                        </Button>
                                                    </Link>
                                                    <DeleteZoneButton
                                                        zoneId={zone.id}
                                                        zoneName={zone.name}
                                                        courierOrgId={courierOrgId}
                                                    />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Map */}
                <div className="lg:col-span-2">
                    <Card className="h-full min-h-[500px] flex flex-col">
                        <CardHeader>
                            <CardTitle>Mapa de Cobertura</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 relative min-h-[400px]">
                            {mapZones.length > 0 ? (
                                <ZoneMap zones={mapZones} height="100%" />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/20 gap-2">
                                    <p>No hay zonas para mostrar en el mapa.</p>
                                    <Link href={`/admin/courier/zones/new?org=${courierOrgId}`}>
                                        <Button variant="outline" size="sm">Crear Primera Zona</Button>
                                    </Link>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
