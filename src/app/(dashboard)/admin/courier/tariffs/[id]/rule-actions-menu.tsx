'use client';

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Edit, MoreHorizontal, Trash } from "lucide-react";
import { useTransition, useState } from "react";
import { deleteTariffRuleAction, duplicateTariffRuleAction } from "./actions";
import { AddRuleModal } from "./add-rule-modal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RuleActionsMenuProps {
    rule: any;
    tariffSetId: string;
    serviceTypes: any[];
    zones: any[];
}

export function RuleActionsMenu({ rule, tariffSetId, serviceTypes, zones }: RuleActionsMenuProps) {
    const [isPending, startTransition] = useTransition();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const handleDelete = () => {
        startTransition(async () => {
            await deleteTariffRuleAction(rule.id, tariffSetId);
            setIsDeleteDialogOpen(false);
        });
    };

    const handleDuplicate = () => {
        startTransition(async () => {
            await duplicateTariffRuleAction(rule.id, tariffSetId);
        });
    };

    return (
        <div className="flex items-center justify-end gap-2 text-right">
            {/* Direct Edit Button wrapped in the AddRuleModal (Edit Mode) */}
            <AddRuleModal
                tariffSetId={tariffSetId}
                serviceTypes={serviceTypes}
                zones={zones}
                rule={rule}
                trigger={
                    <Button variant="ghost" size="sm" className="hidden sm:flex">
                        <Edit className="mr-2 h-4 w-4" /> Editar
                    </Button>
                }
            />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={isPending}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Acciones</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDuplicate} disabled={isPending}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={isPending}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                        <Trash className="mr-2 h-4 w-4" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Confirmation Dialog for Deletion */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar Regla</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro que deseas eliminar esta regla? Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                            {isPending ? 'Eliminando...' : 'Sí, eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
