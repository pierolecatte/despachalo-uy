'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw, Lock, Save, Plus } from 'lucide-react';
import { formatPriceUYU } from '@/lib/utils';
import { repriceShipment, overridePricingLine, upsertReimbursable, assignZone } from '@/lib/pricing/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

interface PricingPanelProps {
    shipment: any; // Using any for now to avoid strict typing issues with new fields
    currUserRole?: string;
    onUpdate: () => void;
}

export default function PricingPanel({ shipment, currUserRole, onUpdate }: PricingPanelProps) {
    const [isPending, startTransition] = useTransition();
    const [lines, setLines] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [editingLine, setEditingLine] = useState<string | null>(null);
    const [overrideAmount, setOverrideAmount] = useState<string>('');
    const [selectedZone, setSelectedZone] = useState<string>(shipment.zone_id || '');
    const [showReimbursableInput, setShowReimbursableInput] = useState(false);
    const [reimbursableAmount, setReimbursableAmount] = useState('');
    const [reimbursableDesc, setReimbursableDesc] = useState('Gasto / Flete');

    const supabase = createClient();
    const isCourier = currUserRole === 'admin' || currUserRole === 'courier'; // Adjust based on actual roles
    const isLocked = shipment.pricing_locked;
    const isIncomplete = shipment.pricing_incomplete;

    // Fetch Lines
    useEffect(() => {
        if (shipment.pricing_snapshot_id) {
            // We need to fetch lines from `pricing.shipment_pricing_lines`
            // Since we can't access `pricing` schema directly from client usually, 
            // we rely on the implementation where `pricing` is in search path OR we use a view.
            // Let's assume we can fetch from `shipment_pricing_lines` if exposed, or use a workaround.
            // Workaround: We'll assume a public view `public.shipment_pricing_lines_view` exists OR use an RPC.
            // For now, let's try direct select assuming user grants access.
            const fetchLines = async () => {
                const { data, error } = await supabase
                    .from('shipment_pricing_lines_view' as any) // Use view if possible, or try direct
                    .select('*')
                    .eq('snapshot_id', shipment.pricing_snapshot_id)
                    .order('created_at', { ascending: true });

                if (!error && data) {
                    setLines(data);
                } else {
                    // Fallback: try selecting from table directly (hoping for permissions)
                    const { data: directData } = await supabase
                        .from('shipment_pricing_lines' as any)
                        .select('*')
                        .eq('snapshot_id', shipment.pricing_snapshot_id);
                    if (directData) setLines(directData);
                }
            };
            fetchLines();
        }
    }, [shipment.pricing_snapshot_id]);

    // Fetch Zones if needed
    useEffect(() => {
        if (isCourier && isIncomplete && shipment.missing_pricing_reasons?.includes('MISSING_ZONE')) {
            const fetchZones = async () => {
                let query = supabase.from('zones').select('id, name');
                // Filter: Generic OR matching sender
                // Logic: (sender_org_id is null) OR (sender_org_id = shipment.remitente_org_id)
                // Supabase `.or` syntax:
                query = query.eq('courier_org_id', shipment.cadeteria_org_id)
                    .or(`sender_org_id.is.null,sender_org_id.eq.${shipment.remitente_org_id}`);

                const { data } = await query;
                if (data) setZones(data);
            };
            fetchZones();
        }
    }, [isCourier, isIncomplete, shipment]);

    const handleReprice = (mode: 'REGENERATE_ALL' | 'FILL_MISSING') => {
        startTransition(async () => {
            const res = await repriceShipment(shipment.id, mode);
            if (res.success) {
                toast.success('Precios actualizados');
                onUpdate();
            } else {
                toast.error(res.message);
            }
        });
    };

    const handleSaveLine = (lineId: string) => {
        startTransition(async () => {
            const res = await overridePricingLine(lineId, parseFloat(overrideAmount), shipment.id);
            if (res.success) {
                setEditingLine(null);
                onUpdate();
            } else {
                toast.error(res.message);
            }
        });
    };

    const handleAddReimbursable = () => {
        startTransition(async () => {
            const res = await upsertReimbursable(shipment.id, parseFloat(reimbursableAmount), reimbursableDesc);
            if (res.success) {
                setShowReimbursableInput(false);
                setReimbursableAmount('');
                onUpdate();
            } else {
                toast.error(res.message);
            }
        });
    };

    const handleAssignZone = () => {
        if (!selectedZone) return;
        startTransition(async () => {
            const res = await assignZone(shipment.id, selectedZone);
            if (res.success) {
                onUpdate();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base text-zinc-200">💲 Desglose de Precios</CardTitle>
                <div className="flex gap-2">
                    {isLocked && <Badge variant="destructive" className="flex items-center gap-1"><Lock className="w-3 h-3" /> Bloqueado</Badge>}
                    {isIncomplete && <Badge variant="outline" className="text-yellow-500 border-yellow-500">Incompleto</Badge>}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Alerts */}
                {isIncomplete && shipment.missing_pricing_reasons && (
                    <Alert variant="destructive" className="bg-yellow-900/20 border-yellow-700 text-yellow-200">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Precio Incompleto</AlertTitle>
                        <AlertDescription>
                            Razones: {shipment.missing_pricing_reasons.join(', ')}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Zone Selector (Conditional) */}
                {isCourier && isIncomplete && shipment.missing_pricing_reasons?.includes('MISSING_ZONE') && (
                    <div className="bg-zinc-800/50 p-4 rounded-md flex items-end gap-4 border border-zinc-700">
                        <div className="flex-1 space-y-2">
                            <Label>Asignar Zona (Requerido)</Label>
                            <Select value={selectedZone} onValueChange={setSelectedZone} disabled={isPending}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar Zona..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAssignZone} disabled={isPending || !selectedZone}>
                            Guardar y Recalcular
                        </Button>
                    </div>
                )}

                {/* Lines Table */}
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Concepto</TableHead>
                            <TableHead>Cant.</TableHead>
                            <TableHead>Unitario</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            {isCourier && !isLocked && <TableHead className="w-[50px]"></TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lines.map((line) => (
                            <TableRow key={line.id}>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span>{line.description}</span>
                                        <div className="flex gap-2">
                                            {line.is_manual && <Badge variant="secondary" className="text-[10px] h-4">Manual</Badge>}
                                            {line.line_type === 'REIMBURSABLE' && <Badge variant="outline" className="text-[10px] h-4">Reintegrable</Badge>}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>{line.quantity}</TableCell>
                                <TableCell>
                                    {editingLine === line.id ? (
                                        <Input
                                            type="number"
                                            className="h-7 w-20"
                                            value={overrideAmount}
                                            onChange={(e) => setOverrideAmount(e.target.value)}
                                        />
                                    ) : (
                                        formatPriceUYU(line.unit_amount)
                                    )}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {formatPriceUYU(line.line_amount)}
                                </TableCell>
                                {isCourier && !isLocked && (
                                    <TableCell>
                                        {editingLine === line.id ? (
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSaveLine(line.id)}>
                                                <Save className="h-3 w-3" />
                                            </Button>
                                        ) : (
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => {
                                                setEditingLine(line.id);
                                                setOverrideAmount(line.unit_amount.toString());
                                            }}>
                                                <span className="text-xs">✏️</span>
                                            </Button>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                        {/* New Reimbursable Input Row */}
                        {showReimbursableInput && (
                            <TableRow className="bg-zinc-800/30">
                                <TableCell>
                                    <Input
                                        placeholder="Descripción (ej. Peaje)"
                                        className="h-8"
                                        value={reimbursableDesc}
                                        onChange={e => setReimbursableDesc(e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>1</TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        placeholder="Monto"
                                        className="h-8 w-24"
                                        value={reimbursableAmount}
                                        onChange={e => setReimbursableAmount(e.target.value)}
                                    />
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={handleAddReimbursable} disabled={!reimbursableAmount}>Guardar</Button>
                                </TableCell>
                                <TableCell>
                                    <Button size="icon" variant="ghost" onClick={() => setShowReimbursableInput(false)}>x</Button>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Subtotals */}
                <div className="flex flex-col gap-1 items-end pt-4 text-sm">
                    <div className="flex justify-between w-48 text-zinc-400">
                        <span>Servicios:</span>
                        <span>{formatPriceUYU(shipment.service_subtotal || 0)}</span>
                    </div>
                    <div className="flex justify-between w-48 text-zinc-400">
                        <span>Reintegrables:</span>
                        <span>{formatPriceUYU(shipment.reimbursable_subtotal || 0)}</span>
                    </div>
                    <div className="flex justify-between w-48 font-bold text-lg text-emerald-400 border-t border-zinc-700 pt-1 mt-1">
                        <span>Total:</span>
                        <span>{formatPriceUYU(shipment.total_to_charge || 0)}</span>
                    </div>
                </div>

                {/* Actions */}
                {isCourier && !isLocked && (
                    <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-800 mt-4">
                        <Button variant="outline" size="sm" onClick={() => handleReprice('REGENERATE_ALL')} disabled={isPending}>
                            <RefreshCw className={`mr-2 h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
                            Regenerar Todo
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleReprice('FILL_MISSING')} disabled={isPending}>
                            Completar Faltantes
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowReimbursableInput(true)} disabled={isPending}>
                            <Plus className="mr-2 h-3 w-3" />
                            Agregar Gasto
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Helper fetcher for lines if needed?
// Actually easier if parent passes lines?
// No, component fetches lines on mount based on snapshot ID is fine for Client Component logic.
// We used `shipment_pricing_lines_view` above. We need to Create that view or assume `pricing.shipment_pricing_lines` is readable.
// Let's create the view in migration 023 or 027 to be safe.
