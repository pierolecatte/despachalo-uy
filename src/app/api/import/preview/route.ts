import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyMappingToRow, type ColumnMapping } from '@/lib/import/import-schema';
import { inferLocation } from '@/lib/import/location-inference';
import { checkDuplicate } from '@/lib/import/deduplication';

// ── Types ──────────────────────────────────────────────────────────────

interface PreviewRowResult {
    rowIndex: number;
    normalized: Record<string, unknown>;
    errors: Record<string, string>;
    warnings: Array<{ field: string; message: string }>;
}

interface PreviewResponse {
    previewRows: PreviewRowResult[];
    summary: {
        total: number;
        ok: number;
        withWarnings: number;
        withErrors: number;
    };
}

// ── Route handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { mappings, defaultsChosen, rows } = body as {
            mappings: ColumnMapping[];
            defaultsChosen?: Record<string, string>;
            rows: Record<string, string>[];
        };

        if (!mappings?.length || !rows?.length) {
            return NextResponse.json(
                { code: 'INVALID_INPUT', message: 'Se requieren mappings y rows.' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Pre-fetch department and locality lookup tables
        const { data: departamentos } = await supabase
            .from('departamentos' as string)
            .select('id, name');
        const { data: localidades } = await supabase
            .from('localidades' as string)
            .select('id, name, departamento_id');
        const { data: agencias } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('type', 'agencia')
            .eq('active', true);
        const { data: serviceTypes } = await supabase
            .from('service_types')
            .select('id, code')
            .eq('active', true);

        const deptList = (departamentos || []) as Array<{ id: number; name: string }>;
        const locList = (localidades || []) as Array<{ id: number; name: string; departamento_id: number }>;
        const agencyList = (agencias || []) as Array<{ id: string; name: string }>;
        const svcList = (serviceTypes || []) as Array<{ id: string; code: string }>;

        // Build lookup maps (case-insensitive)
        const deptByName = new Map<string, { id: number; name: string }>();
        deptList.forEach(d => deptByName.set(d.name.toUpperCase(), d));

        const localitiesByDept: Record<number, Array<{ id: number; name: string }>> = {};
        const locByName = new Map<string, Array<{ id: number; name: string; departamento_id: number }>>();
        locList.forEach(l => {
            const key = l.name.toUpperCase();
            if (!locByName.has(key)) locByName.set(key, []);
            locByName.get(key)!.push(l);

            if (!localitiesByDept[l.departamento_id]) localitiesByDept[l.departamento_id] = [];
            localitiesByDept[l.departamento_id].push(l);
        });

        const agenciesByName = new Map<string, string>();
        agencyList.forEach(a => agenciesByName.set(a.name.toUpperCase(), a.id));

        const svcByCode = new Map<string, string>();
        svcList.forEach(s => svcByCode.set(s.code, s.id));

        // Process each row
        const previewRows: PreviewRowResult[] = [];
        let okCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const mapped = applyMappingToRow(rows[i], mappings);
            const errors: Record<string, string> = {};
            const warnings: Array<{ field: string; message: string }> = [];

            // Apply defaults
            if (defaultsChosen) {
                for (const [key, val] of Object.entries(defaultsChosen)) {
                    if (!mapped[key] && val) {
                        mapped[key] = val;
                    }
                }
            }

            // ── Validate required fields ────────────────────────────────────

            if (!mapped.recipient_name) {
                errors['recipient_name'] = 'Nombre del destinatario requerido';
            }

            // ── Resolve department & locality ───────────────────────────────

            let departmentId: number | null = null;
            const deptNameRaw = mapped.department_name as string | null;
            let localityId: number | null = null;
            let localityManual: string | null = null;
            const locNameRaw = mapped.locality_name as string | null;
            let deliveryTypeInferred: 'domicilio' | 'sucursal' | undefined;

            // 1. Inference from Address (if columns missing)
            if (!deptNameRaw && !locNameRaw && mapped.recipient_address && typeof mapped.recipient_address === 'string') {
                const inferred = inferLocation(mapped.recipient_address, { departments: deptList, localitiesByDept });
                if (inferred.departmentId) departmentId = inferred.departmentId;
                if (inferred.localityId) localityId = inferred.localityId;
                if (inferred.localityManual) localityManual = inferred.localityManual;
                if (inferred.deliveryType) deliveryTypeInferred = inferred.deliveryType;

                if (inferred.warnings) {
                    inferred.warnings.forEach(w => warnings.push({ field: 'recipient_address', message: `Inferencia: ${w}` }));
                }
            }

            // 2. Resolve Department (from column)
            if (deptNameRaw) {
                const deptMatch = deptByName.get(deptNameRaw.toUpperCase());
                if (deptMatch) {
                    departmentId = deptMatch.id;
                } else {
                    // Try partial match
                    const partial = deptList.find(d =>
                        d.name.toUpperCase().includes(deptNameRaw.toUpperCase()) ||
                        deptNameRaw.toUpperCase().includes(d.name.toUpperCase())
                    );
                    if (partial) {
                        departmentId = partial.id;
                        warnings.push({
                            field: 'department_name',
                            message: `"${deptNameRaw}" → "${partial.name}" (match parcial)`,
                        });
                    } else {
                        warnings.push({
                            field: 'department_name',
                            message: `Departamento "${deptNameRaw}" no encontrado`,
                        });
                    }
                }
            }

            // 3. Resolve Locality (from column)
            // Skip existing resolution if inferred locality is present AND we didn't have a column value
            // But if we have locNameRaw, we MUST resolve it (overriding inference if any).
            if (locNameRaw) {
                // If we had inference, we might overwrite it, which is correct (explicit column > inference)
                localityId = null;
                localityManual = null; // Clear manual if explicit column provided

                const locMatches = locByName.get(locNameRaw.toUpperCase());

                if (locMatches && locMatches.length === 1) {
                    // Exact single match
                    localityId = locMatches[0].id;
                    // Auto-resolve department if not provided
                    if (!departmentId) {
                        departmentId = locMatches[0].departamento_id;
                    } else if (departmentId !== locMatches[0].departamento_id) {
                        warnings.push({
                            field: 'locality_name',
                            message: `Localidad "${locNameRaw}" no pertenece al departamento indicado`,
                        });
                    }
                } else if (locMatches && locMatches.length > 1) {
                    // Multiple matches — try to filter by department
                    if (departmentId) {
                        const filtered = locMatches.filter(l => l.departamento_id === departmentId);
                        if (filtered.length === 1) {
                            localityId = filtered[0].id;
                        } else {
                            localityManual = locNameRaw;
                            warnings.push({
                                field: 'locality_name',
                                message: `Localidad "${locNameRaw}" ambigua (${locMatches.length} resultados). Se usará como manual.`,
                            });
                        }
                    } else {
                        localityManual = locNameRaw;
                        warnings.push({
                            field: 'locality_name',
                            message: `Localidad "${locNameRaw}" ambigua sin departamento. Se usará como manual.`,
                        });
                    }
                } else {
                    // No match — try partial
                    const partialLoc = locList.find(l =>
                        l.name.toUpperCase().includes(locNameRaw.toUpperCase()) ||
                        locNameRaw.toUpperCase().includes(l.name.toUpperCase())
                    );
                    if (partialLoc) {
                        localityId = partialLoc.id;
                        if (!departmentId) departmentId = partialLoc.departamento_id;
                        warnings.push({
                            field: 'locality_name',
                            message: `"${locNameRaw}" → "${partialLoc.name}" (match parcial)`,
                        });
                    } else {
                        localityManual = locNameRaw;
                        warnings.push({
                            field: 'locality_name',
                            message: `Localidad "${locNameRaw}" no encontrada en el sistema. Se usará como manual.`,
                        });
                    }
                }
            }

            // ── XOR: need locality_id OR locality_manual ────────────────────
            // IMPORTANT: If neither exists, this is an ERROR (prevents DB constraint violation)

            if (!localityId && !localityManual) {
                errors['locality_required'] = 'Se requiere una localidad válida o manual.';
            }

            if (localityId && localityManual) {
                // Should not happen with current logic, but clear manual if we have ID
                localityManual = null;
            }

            if (!departmentId && !localityId) {
                warnings.push({ field: 'department_name', message: 'Sin departamento' });
            }

            // ── freight_paid: null → warning ────────────────────────────────

            if (mapped.is_freight_paid === null && mappings.some(m => m.targetField === 'is_freight_paid')) {
                warnings.push({
                    field: 'is_freight_paid',
                    message: 'Valor de flete no reconocido',
                });
            }

            // ── Build normalized row (shipment-like shape) ──────────────────

            // Resolve delivery type logic
            let deliveryType = defaultsChosen?.delivery_type || 'domicilio';
            // Infer if default is not explicit or overriding?
            // Usually explicit > inferred > default. 
            // Here mapped.delivery_type doesn't exist in schema usually, but let's say we use inference if provided.
            if (deliveryTypeInferred) {
                deliveryType = deliveryTypeInferred;
            }

            const normalized: Record<string, unknown> = {
                recipient_name: mapped.recipient_name || null,
                recipient_phone: mapped.recipient_phone || null,
                recipient_email: mapped.recipient_email || null,
                recipient_address: mapped.recipient_address || null,
                department_id: departmentId,
                department_name: departmentId
                    ? deptList.find(d => d.id === departmentId)?.name || null
                    : deptNameRaw || null,
                locality_id: localityId,
                locality_name: localityId
                    ? locList.find(l => l.id === localityId)?.name || null
                    : null,
                locality_manual: localityManual,
                observations: mapped.observations || null,
                is_freight_paid: mapped.is_freight_paid ?? false,
                freight_amount: mapped.freight_amount || null,
                agency_name: mapped.agency_name || null,
                service_type: mapped.service_type || defaultsChosen?.service_type || null,
                package_size: mapped.package_size || defaultsChosen?.package_size || 'mediano',
                weight_kg: mapped.weight_kg || null,
                shipping_cost: mapped.shipping_cost || null,
                content_description: mapped.content_description || null,
                notes: mapped.notes || null,
                delivery_type: deliveryType,
            };

            // ── Resolve Agency & Service Type (for dedupe) ──────────────────
            let agencyId: string | null = null;
            if (mapped.agency_name) {
                const name = (mapped.agency_name as string).toUpperCase();
                if (agenciesByName.has(name)) {
                    agencyId = agenciesByName.get(name)!;
                }
            }

            let serviceTypeId: string | null = null;
            const svcRaw = (mapped.service_type || defaultsChosen?.service_type) as string | null;
            if (svcRaw) {
                serviceTypeId = svcByCode.get(svcRaw) || null;
                if (!serviceTypeId) {
                    // try case insensitive
                    for (const [k, v] of svcByCode) {
                        if (k.toUpperCase() === svcRaw.toUpperCase()) {
                            serviceTypeId = v;
                            break;
                        }
                    }
                }
            }

            // ── Deduplication Check ─────────────────────────────────────────
            // Only check if we have a remitente
            if (defaultsChosen?.remitente_org_id) {
                try {
                    const { isDuplicate, reason } = await checkDuplicate(
                        supabase,
                        defaultsChosen.remitente_org_id,
                        normalized,
                        serviceTypeId,
                        agencyId,
                        deliveryType as 'domicilio' | 'sucursal'
                    );
                    if (isDuplicate) {
                        warnings.push({ field: '_general', message: `Posible duplicado: ${reason}` });
                    }
                } catch (e) { console.error('Dedup check error', e); }
            }

            const hasErrors = Object.keys(errors).length > 0;
            const hasWarnings = warnings.length > 0;

            if (hasErrors) errorCount++;
            else if (hasWarnings) warningCount++;
            else okCount++;

            previewRows.push({
                rowIndex: i + 1,
                normalized,
                errors,
                warnings,
            });
        }

        const result: PreviewResponse = {
            previewRows,
            summary: {
                total: rows.length,
                ok: okCount,
                withWarnings: warningCount,
                withErrors: errorCount,
            },
        };

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[import/preview] Error:', err);
        return NextResponse.json(
            { code: 'INTERNAL_ERROR', message: 'Error interno al generar el preview.' },
            { status: 500 }
        );
    }
}
