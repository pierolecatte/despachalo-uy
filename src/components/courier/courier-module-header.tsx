'use client';

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { withOrgQuery } from "@/lib/courier/url-helpers";

export function CourierModuleHeader({ organizations }: { organizations: { id: string; name: string }[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentOrgId = searchParams.get('org') || undefined;

    // Fallback UI
    if (!organizations || organizations.length === 0) {
        return (
            <div className="p-4 bg-muted rounded-md text-center text-muted-foreground">
                No tienes cadeterías asignadas.
            </div>
        );
    }

    const handleSelect = (orgId: string) => {
        router.push(withOrgQuery(pathname, orgId));
    };

    let activeTab = "services";
    if (pathname.includes("/tariffs")) activeTab = "tariffs";
    if (pathname.includes("/zones")) activeTab = "zones";
    if (pathname.includes("/billing")) activeTab = "billing";

    return (
        <div className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800 pb-0 pt-4 -mx-6 px-6 sm:-mx-8 sm:px-8 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Administración de Cadetería</h1>
                    <p className="text-sm text-zinc-400 mt-1">Gestiona servicios, tarifas, zonas y facturación.</p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">Cadetería seleccionada</span>
                    <Select onValueChange={handleSelect} value={currentOrgId || ""}>
                        <SelectTrigger className="w-[260px] bg-zinc-900 border-zinc-700">
                            <SelectValue placeholder="Seleccionar cadetería..." />
                        </SelectTrigger>
                        <SelectContent className="z-50">
                            {organizations.map((org) => (
                                <SelectItem key={org.id} value={org.id}>
                                    {org.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs value={activeTab} className="w-full">
                <TabsList className="w-full justify-start h-12 bg-transparent border-none rounded-none p-0 inline-flex gap-6 overflow-x-auto overflow-y-hidden hide-scrollbar">
                    <Link href={withOrgQuery("/admin/courier/services", currentOrgId)} className="h-full">
                        <TabsTrigger
                            value="services"
                            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400 data-[state=active]:bg-transparent px-1 font-medium text-zinc-400 hover:text-zinc-200"
                        >
                            Servicios
                        </TabsTrigger>
                    </Link>
                    <Link href={withOrgQuery("/admin/courier/tariffs", currentOrgId)} className="h-full">
                        <TabsTrigger
                            value="tariffs"
                            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400 data-[state=active]:bg-transparent px-1 font-medium text-zinc-400 hover:text-zinc-200"
                        >
                            Tarifas
                        </TabsTrigger>
                    </Link>
                    <Link href={withOrgQuery("/admin/courier/zones", currentOrgId)} className="h-full">
                        <TabsTrigger
                            value="zones"
                            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400 data-[state=active]:bg-transparent px-1 font-medium text-zinc-400 hover:text-zinc-200"
                        >
                            Zonas
                        </TabsTrigger>
                    </Link>
                    <Link href={withOrgQuery("/admin/courier/billing", currentOrgId)} className="h-full">
                        <TabsTrigger
                            value="billing"
                            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400 data-[state=active]:bg-transparent px-1 font-medium text-zinc-400 hover:text-zinc-200"
                        >
                            Facturación
                        </TabsTrigger>
                    </Link>
                </TabsList>
            </Tabs>
        </div>
    );
}
