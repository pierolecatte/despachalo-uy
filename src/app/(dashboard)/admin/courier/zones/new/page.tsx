import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";

async function createZone(formData: FormData) {
    'use server';
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

    if (!orgMember) throw new Error("No organization found");

    const name = formData.get('name') as string;
    const senderId = formData.get('sender_org_id') as string;
    const geojsonStr = formData.get('geojson') as string;

    if (!name || !geojsonStr) {
        throw new Error("Missing name or geojson");
    }

    let geojson;
    try {
        geojson = JSON.parse(geojsonStr);
    } catch (e) {
        throw new Error("Invalid GeoJSON format");
    }

    // 1. Create Zone
    const payload: any = {
        courier_org_id: orgMember.organization_id,
        name,
        sender_org_id: senderId || null
    };

    const { data: zoneData, error: zoneError } = await supabase
        .from('zones' as any)
        .insert(payload)
        .select()
        .single();

    if (zoneError || !zoneData) {
        console.error(zoneError);
        throw new Error("Failed to create zone");
    }

    // 2. Insert Geometry
    const { error: geomError } = await supabase
        .from('zone_geoms' as any)
        .insert({
            zone_id: zoneData.id,
            geojson: geojson
        });

    if (geomError) {
        console.error(geomError);
        // cleanup?
        await supabase.from('zones' as any).delete().eq('id', zoneData.id);
        throw new Error("Failed to save geometry");
    }

    revalidatePath('/admin/courier/zones');
    redirect('/admin/courier/zones');
}

export default async function NewZonePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch Senders
    const { data: senders } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('type', 'remitente')
        .order('name');

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Nueva Zona</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Definición de Zona</CardTitle>
                    <CardDescription>
                        Ingresa el nombre y la geometría (GeoJSON) de la zona.
                        Puedes usar herramientas como <a href="https://geojson.io" target="_blank" className="underline text-blue-500">geojson.io</a> para dibujar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={createZone} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre de Zona</Label>
                            <Input id="name" name="name" placeholder="Ej. Centro, Zona 1, Montevideo" required />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sender_org_id">Cliente Específico (Opcional)</Label>
                            <Select name="sender_org_id">
                                <SelectTrigger>
                                    <SelectValue placeholder="General (Para todos)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">General (Para todos)</SelectItem>
                                    {senders?.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="geojson">Geometría (GeoJSON)</Label>
                            <Textarea
                                id="geojson"
                                name="geojson"
                                placeholder='{"type": "Polygon", "coordinates": [...] }'
                                className="font-mono text-xs h-[200px]"
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <Link href="/admin/courier/zones">
                                <Button variant="outline">Cancelar</Button>
                            </Link>
                            <Button type="submit">Crear Zona</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
