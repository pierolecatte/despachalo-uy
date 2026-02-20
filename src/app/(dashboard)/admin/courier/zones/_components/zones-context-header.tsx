import { Card, CardContent } from "@/components/ui/card";
import { Map } from "lucide-react";

export function ZonesContextHeader({
    courierName,
    zonesCount
}: {
    courierName: string,
    zonesCount: number
}) {
    return (
        <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm font-medium">Cadetería seleccionada:</span>
                        <span className="font-semibold text-sm">{courierName}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Map className="h-4 w-4" />
                        <span>{zonesCount} zona{zonesCount !== 1 ? 's' : ''} visible{zonesCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
