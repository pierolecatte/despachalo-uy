'use client';

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function CourierTabs() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Determine active tab based on pathname
    let activeTab = "services";
    if (pathname.includes("/tariffs")) activeTab = "tariffs";
    if (pathname.includes("/zones")) activeTab = "zones";
    if (pathname.includes("/billing")) activeTab = "billing";

    const createHref = (path: string) => {
        const query = searchParams.toString();
        return query ? `${path}?${query}` : path;
    };

    return (
        <Tabs value={activeTab} className="w-full">
            <TabsList className="w-auto inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                <Link href={createHref("/admin/courier/services")}>
                    <TabsTrigger value="services" className="px-4">Servicios</TabsTrigger>
                </Link>
                <Link href={createHref("/admin/courier/tariffs")}>
                    <TabsTrigger value="tariffs" className="px-4">Tarifas</TabsTrigger>
                </Link>
                <Link href={createHref("/admin/courier/zones")}>
                    <TabsTrigger value="zones" className="px-4">Zonas</TabsTrigger>
                </Link>
                <Link href={createHref("/admin/courier/billing")}>
                    <TabsTrigger value="billing" className="px-4">Facturación</TabsTrigger>
                </Link>
            </TabsList>
        </Tabs>
    );
}
