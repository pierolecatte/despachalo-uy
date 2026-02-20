'use client';

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { deleteZoneAction } from "../actions";

export function DeleteZoneButton({
    zoneId,
    zoneName,
    courierOrgId
}: {
    zoneId: string;
    zoneName: string;
    courierOrgId: string;
}) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [open, setOpen] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteZoneAction(zoneId, courierOrgId);
            toast.success("Zona eliminada");
            setOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("No se pudo eliminar la zona");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" type="button" disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="z-[9999]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar zona</AlertDialogTitle>
                    <AlertDialogDescription>
                        ¿Seguro que deseas eliminar la zona <strong>{zoneName}</strong>?<br />
                        Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleDelete(); }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeleting}
                    >
                        {isDeleting ? "Eliminando..." : "Eliminar"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
