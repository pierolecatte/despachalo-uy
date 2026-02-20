'use client';

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrgSelectorClientProps {
    organizations: { id: string; name: string }[];
    currentOrgId?: string;
    message?: string;
}

export function OrgSelectorClient({ organizations, currentOrgId, message }: OrgSelectorClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleSelect = (orgId: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('org', orgId);
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex flex-col gap-4 items-center justify-center p-8 border rounded-lg bg-muted/20 text-center relative z-10 w-full max-w-xl mx-auto mt-10">
            {message ? (
                <div className="text-destructive font-medium mb-2">{message}</div>
            ) : (
                <div className="text-muted-foreground mb-2">Seleccioná la cadetería a administrar</div>
            )}

            <Select onValueChange={handleSelect} defaultValue={currentOrgId}>
                <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Elegir Cadetería..." />
                </SelectTrigger>
                <SelectContent>
                    {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                            {org.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
