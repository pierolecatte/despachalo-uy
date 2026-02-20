import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import React from "react";

export function CourierContextHeader({
    courierName,
    icon: Icon,
    subtitle
}: {
    courierName: string,
    icon?: LucideIcon,
    subtitle?: React.ReactNode
}) {
    return (
        <Card className="bg-muted/30 border-dashed mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm font-medium">Cadetería seleccionada:</span>
                    <span className="font-semibold text-sm">{courierName}</span>
                </div>
                {subtitle && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span>{subtitle}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
