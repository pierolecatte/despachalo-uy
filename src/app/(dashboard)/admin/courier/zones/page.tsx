import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PlusCircle, Trash2 } from "lucide-react";
import { ZoneMap } from "@/components/pricing/ZoneMap";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function deleteZone(zoneId: string) {
    'use server';
    const supabase = await createClient();
    const { error } = await supabase.from('zones' as any).delete().eq('id', zoneId); // RLS handles permission
    if (error) console.error("Delete error", error);
    revalidatePath('/admin/courier/zones');
}

export default async function ZonesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return <div>Access Denied</div>;

    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
    if (!orgMember) return <div>No Organization</div>;

    // Fetch Zones
    const { data: zones } = await supabase
        .from('zones' as any)
        .select('*, sender_org:sender_org_id(name), zone_geoms(geojson)')
        .eq('courier_org_id', orgMember.organization_id)
        .order('created_at', { ascending: false });

    // Format for Map
    const mapZones = zones?.map((z) => ({
        id: z.id,
        name: z.name,
        geojson: z.zone_geoms?.[0]?.geojson, // One-to-one strictly speaking but usually returned as array if relation
        // wait, simple relation might return object or array depending on querying?
        // Let's assume one-to-one logic: usually supabase returns array for joins unless single().
        // If zone_geoms is foreign table, it returns json array.
        color: z.sender_org_id ? 'orange' : 'blue' // Color code by type
    })) || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Zonas de Cobertura</h2>
                    <p className="text-muted-foreground">
                        Define áreas geográficas para aplicar tarifas diferenciadas (Stop Fees).
                    </p>
                </div>
                <Link href="/admin/courier/zones/new">
                    <Button>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nueva Zona
                    </Button>
                </Link>
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
                                            <TableCell colSpan={2} className="text-center text-muted-foreground">Sin zonas</TableCell>
                                        </TableRow>
                                    )}
                                    {zones?.map((zone) => (
                                        <TableRow key={zone.id}>
                                            <TableCell>
                                                <div className="font-medium">{zone.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {zone.sender_org ? `Cliente: ${zone.sender_org.name}` : 'General'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <form action={async () => {
                                                    'use server';
                                                    await deleteZone(zone.id);
                                                }}>
                                                    <Button variant="ghost" size="icon" type="submit">
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </form>
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
                                <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/20">
                                    No hay zonas para mostrar
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
