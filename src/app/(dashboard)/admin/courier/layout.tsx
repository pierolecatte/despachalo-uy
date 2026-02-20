import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export default function CourierAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Administración Cadetería</h1>
                <p className="text-muted-foreground">
                    Configuración de servicios, tarifas, zonas y facturación.
                </p>
            </div>

            <div className="w-full overflow-x-auto">
                <Tabs defaultValue="services" className="w-full">
                    <TabsList className="w-auto inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                        <Link href="/admin/courier/services">
                            <TabsTrigger value="services" className="px-4">Servicios</TabsTrigger>
                        </Link>
                        <Link href="/admin/courier/tariffs">
                            <TabsTrigger value="tariffs" className="px-4">Tarifas</TabsTrigger>
                        </Link>
                        <Link href="/admin/courier/zones">
                            <TabsTrigger value="zones" className="px-4">Zonas</TabsTrigger>
                        </Link>
                        <Link href="/admin/courier/billing">
                            <TabsTrigger value="billing" className="px-4">Facturación</TabsTrigger>
                        </Link>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex-1 rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                {children}
            </div>
        </div>
    );
}
