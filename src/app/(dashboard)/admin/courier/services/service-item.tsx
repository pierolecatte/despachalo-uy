'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useState, useTransition } from "react";
import { toggleServiceAction } from "./actions";
import { ServiceTypeCode } from "@/types/pricing";

interface ServiceItemProps {
    serviceCode: string;
    serviceName: string;
    description: string;
    initialEnabled: boolean;
}

export function ServiceItem({ serviceCode, serviceName, description, initialEnabled }: ServiceItemProps) {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [isPending, startTransition] = useTransition();

    const handleToggle = (checked: boolean) => {
        setEnabled(checked);
        startTransition(async () => {
            try {
                await toggleServiceAction(serviceCode as ServiceTypeCode, checked);
            } catch (error) {
                setEnabled(!checked);
                console.error("Failed to toggle service", error);
                alert("Error al actualizar el servicio");
            }
        });
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{serviceName}</CardTitle>
                <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isPending} />
            </CardHeader>
            <CardContent>
                <CardDescription>{description || "Sin descripción"}</CardDescription>
                <div className="text-xs text-muted-foreground mt-2 font-mono">{serviceCode}</div>
            </CardContent>
        </Card>
    );
}
