import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";
import { updateZoneAction } from "../actions";
import { ZoneForm } from "../_components/zone-form";
import { notFound } from "next/navigation";

export default async function EditZonePage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;
    const zoneId = params.id;

    // Resolve context
    const courierOrgId = await requireCourierOrg(orgParam);
    const supabase = await createClient();

    // Fetch Zone using the exposed public.zones view
    const { data: zoneData } = await supabase
        .from('zones' as any)
        .select('*, geojson')
        .eq('id', zoneId)
        .eq('courier_org_id', courierOrgId)
        .single();

    if (!zoneData) {
        notFound();
    }

    // Fetch Senders
    const { data: senders } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('type', 'remitente')
        .order('name');

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Editar Zona</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Modificar Zona</CardTitle>
                    <CardDescription>
                        Edita el nombre, opciones y geometría de la zona.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ZoneForm
                        initialData={zoneData}
                        action={updateZoneAction}
                        senders={senders || []}
                        courierOrgId={courierOrgId}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
