import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";

async function createTariffSet(formData: FormData) {
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
    const scope = formData.get('scope') as string;
    const senderId = formData.get('sender_org_id') as string;

    if (!name || !scope) {
        throw new Error("Missing fields");
    }

    const payload: any = {
        courier_org_id: orgMember.organization_id,
        name,
        scope,
        is_active: true
    };

    if (scope === 'BY_SENDER') {
        if (!senderId) throw new Error("Sender required for Customer Specific tariff");
        payload.sender_org_id = senderId;
    }

    const { error } = await supabase.from('tariff_sets' as any).insert(payload);

    if (error) {
        console.error(error);
        throw new Error("Failed to create tariff set");
    }

    revalidatePath('/admin/courier/tariffs');
    redirect('/admin/courier/tariffs');
}

export default async function NewTariffPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

    if (!orgMember) return null;

    // Fetch Senders for the select
    // We need to know which organizations are 'remitentes' linked to this courier?
    // Or just all remitentes? Usually there is a relationship or we list all.
    // For now, list all organizations of type 'remitente'.
    // Ideally, we should filter by those who have a relationship, but let's assume all available.
    const { data: senders } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('type', 'remitente')
        .order('name');

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Nuevo Tarifario</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detalles del Tarifario</CardTitle>
                    <CardDescription>Define el nombre y el alcance de estas tarifas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={createTariffSet} className="space-y-4">
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
                            <Link href="/admin/courier/tariffs">
                                <Button variant="outline">Cancelar</Button>
                            </Link>
                            <Button type="submit">Crear Tarifario</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
