import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyMappingToRow, type ColumnMapping, type TargetField } from '@/lib/import/import-schema';
import { generateTrackingCode } from '@/lib/utils';
import { checkDuplicate } from '@/lib/import/deduplication';
import { inferLocation } from '@/lib/import/location-inference';
import { createShipment, PackageInsert } from '@/lib/shipments/create';

// ── Types ──────────────────────────────────────────────────────────────

interface EntityResolutions {
    agencies?: Record<string, string | null>; // agency_name -> agency_id | null
}

interface CommitRowResult {
    rowIndex: number;
    status: 'INSERTED' | 'FAILED' | 'SKIPPED_DUPLICATE';
    reason?: string;
    shipmentId?: string;
    trackingCode?: string;
    warnings?: Array<{ field: string; message: string }>;
    errors?: Record<string, string>;
}

interface CommitResponse {
    summary: { total: number; inserted: number; withWarnings: number; failed: number; skipped: number };
    results: CommitRowResult[];
}

const BATCH_SIZE = 25;

// ── Route handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { rows, mappingFinal, defaultsChosen, entityResolutions, dedupeCheck = true, force = false } = body as {
            rows: Record<string, string>[];
            mappingFinal: ColumnMapping[];
            defaultsChosen?: Record<string, string>;
            entityResolutions?: EntityResolutions;
            dedupeCheck?: boolean;
            force?: boolean;
        };

        if (!rows?.length || !mappingFinal?.length) {
            return NextResponse.json(
                { code: 'INVALID_INPUT', message: 'Se requieren rows y mappingFinal.' },
                { status: 400 }
            );
        }

        if (rows.length > 500) {
            return NextResponse.json(
                { code: 'TOO_MANY_ROWS', message: 'Máximo 500 filas por importación.' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Pre-fetch lookup tables
        const [deptsRes, locsRes, orgsRes, svcRes] = await Promise.all([
            supabase.from('departamentos' as string).select('id, name'),
            supabase.from('localidades' as string).select('id, name, departamento_id'),
            supabase.from('organizations').select('id, name, type').eq('active', true),
            supabase.from('service_types').select('id, code').eq('active', true),
        ]);

        const deptList = (deptsRes.data || []) as Array<{ id: number; name: string }>;
        const locList = (locsRes.data || []) as Array<{ id: number; name: string; departamento_id: number }>;
        const orgList = (orgsRes.data || []) as Array<{ id: string; name: string; type: string }>;
        const svcList = (svcRes.data || []) as Array<{ id: string; code: string }>;

        // Build lookup maps
        const deptByName = new Map<string, { id: number; name: string }>();
        deptList.forEach(d => deptByName.set(d.name.toUpperCase(), d));

        const locByName = new Map<string, Array<{ id: number; name: string; departamento_id: number }>>();
        const localitiesByDept: Record<number, Array<{ id: number; name: string }>> = {};
        locList.forEach(l => {
            const key = l.name.toUpperCase();
            if (!locByName.has(key)) locByName.set(key, []);
            locByName.get(key)!.push(l);

            if (!localitiesByDept[l.departamento_id]) localitiesByDept[l.departamento_id] = [];
            localitiesByDept[l.departamento_id].push(l);
        });

        const agenciesByName = new Map<string, string>();
        orgList.filter(o => o.type === 'agencia').forEach(o => agenciesByName.set(o.name.toUpperCase(), o.id));

        const svcByCode = new Map<string, string>();
        svcList.forEach(s => svcByCode.set(s.code, s.id));

        // Get remitente_org_id from defaults
        const remitenteOrgId = defaultsChosen?.remitente_org_id;
        if (!remitenteOrgId) {
            return NextResponse.json(
                { code: 'MISSING_REMITENTE', message: 'remitente_org_id es requerido en defaultsChosen.' },
                { status: 400 }
            );
        }

        // ── Process in batches ─────────────────────────────────────────────

        const allResults: CommitRowResult[] = [];
        // let insertedCount = 0;
        // let warningCount = 0;
        // let failedCount = 0;

        for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
            const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
            const batchResults = await processBatch(
                batch,
                batchStart,
                mappingFinal,
                defaultsChosen || {},
                entityResolutions || {},
                remitenteOrgId,
                dedupeCheck,
                force || false,
                deptByName, deptList, locByName, locList, localitiesByDept,
                agenciesByName,
                svcByCode,
                supabase,
            );

            allResults.push(...batchResults);
        }

        // Adjust counts
        const actualInserted = allResults.filter(r => r.status === 'INSERTED').length;
        const actualSkipped = allResults.filter(r => r.status === 'SKIPPED_DUPLICATE').length;
        const actualWithWarnings = allResults.filter(r => r.status === 'INSERTED' && r.warnings && r.warnings.length > 0).length;
        const actualFailed = allResults.filter(r => r.status === 'FAILED').length;

        const result: CommitResponse = {
            summary: {
                total: rows.length,
                inserted: actualInserted,
                withWarnings: actualWithWarnings,
                failed: actualFailed,
                skipped: actualSkipped,
            },
            results: allResults,
        };

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[import/commit] Error:', err);
        return NextResponse.json(
            { code: 'INTERNAL_ERROR', message: 'Error interno al importar.' },
            { status: 500 }
        );
    }
}

// ── Batch processor ────────────────────────────────────────────────────

async function processBatch(
    batch: Record<string, string>[],
    startIndex: number,
    mappings: ColumnMapping[],
    defaults: Record<string, string>,
    entityResolutions: EntityResolutions,
    remitenteOrgId: string,
    dedupeCheck: boolean,
    force: boolean,
    deptByName: Map<string, { id: number; name: string }>,
    deptList: Array<{ id: number; name: string }>,
    locByName: Map<string, Array<{ id: number; name: string; departamento_id: number }>>,
    locList: Array<{ id: number; name: string; departamento_id: number }>,
    localitiesByDept: Record<number, Array<{ id: number; name: string }>>,
    agenciesByName: Map<string, string>,
    svcByCode: Map<string, string>,
    supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CommitRowResult[]> {
    const results: CommitRowResult[] = [];

    // Pre-calculate dedupe candidates if enabled (optimization: potentially fetch relevant shipment fingerprints in batch?)
    // For now, doing it per-row is acceptable as batch is 25.

    for (let i = 0; i < batch.length; i++) {
        const rowIndex = startIndex + i + 1;
        const row = batch[i];

        try {
            const result = await processRow(
                row, rowIndex, mappings, defaults, entityResolutions,
                remitenteOrgId, dedupeCheck, force,
                deptByName, deptList, locByName, locList, localitiesByDept,
                agenciesByName, svcByCode, supabase,
            );
            results.push(result);
        } catch (err) {
            results.push({
                rowIndex,
                status: 'FAILED',
                errors: { _general: err instanceof Error ? err.message : 'Error desconocido' },
            });
        }
    }

    return results;
}

// ── Single row processor ───────────────────────────────────────────────

async function processRow(
    row: Record<string, string>,
    rowIndex: number,
    mappings: ColumnMapping[],
    defaults: Record<string, string>,
    entityResolutions: EntityResolutions,
    remitenteOrgId: string,
    dedupeCheck: boolean,
    force: boolean,
    deptByName: Map<string, { id: number; name: string }>,
    deptList: Array<{ id: number; name: string }>,
    locByName: Map<string, Array<{ id: number; name: string; departamento_id: number }>>,
    locList: Array<{ id: number; name: string; departamento_id: number }>,
    localitiesByDept: Record<number, Array<{ id: number; name: string }>>,
    agenciesByName: Map<string, string>,
    svcByCode: Map<string, string>,
    supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CommitRowResult> {
    const mapped = applyMappingToRow(row, mappings);
    const errors: Record<string, string> = {};
    const warnings: Array<{ field: string; message: string }> = [];

    // Apply defaults for missing fields
    for (const [key, val] of Object.entries(defaults)) {
        if (!mapped[key] && val && !['remitente_org_id'].includes(key)) {
            mapped[key] = val;
        }
    }

    // ── Validate required fields ────────────────────────────────────────

    const recipientName = mapped.recipient_name as string | null;
    if (!recipientName) {
        errors['recipient_name'] = 'Nombre del destinatario requerido';
    }

    // ── Resolve department & locality ───────────────────────────────────

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

    // 2. Resolve Department (from column, overrides inference if present)
    if (deptNameRaw) {
        const match = deptByName.get(deptNameRaw.toUpperCase());
        if (match) {
            departmentId = match.id;
        } else {
            const partial = deptList.find(d =>
                d.name.toUpperCase().includes(deptNameRaw.toUpperCase()) ||
                deptNameRaw.toUpperCase().includes(d.name.toUpperCase())
            );
            if (partial) {
                departmentId = partial.id;
                warnings.push({ field: 'department_name', message: `"${deptNameRaw}" → "${partial.name}" (match parcial)` });
            } else {
                warnings.push({ field: 'department_name', message: `Departamento "${deptNameRaw}" no encontrado` });
            }
        }
    }

    // 3. Resolve Locality (from column, overrides inference)
    if (locNameRaw) {
        // Explicit column overrides inference
        localityId = null;
        localityManual = null; // Clear inferred manual

        const locMatches = locByName.get(locNameRaw.toUpperCase());
        if (locMatches && locMatches.length === 1) {
            localityId = locMatches[0].id;
            // Auto-set department if missing
            if (!departmentId) departmentId = locMatches[0].departamento_id;
            else if (departmentId !== locMatches[0].departamento_id) {
                warnings.push({ field: 'locality_name', message: `Localidad "${locNameRaw}" no pertenece al departamento indicado` });
            }
        } else if (locMatches && locMatches.length > 1) {
            // Multiple matches
            if (departmentId) {
                const filtered = locMatches.filter(l => l.departamento_id === departmentId);
                if (filtered.length === 1) localityId = filtered[0].id;
                else {
                    localityManual = locNameRaw;
                    warnings.push({ field: 'locality_name', message: `Localidad "${locNameRaw}" ambigua (${locMatches.length} resultados). Se usará como manual.` });
                }
            } else {
                localityManual = locNameRaw;
                warnings.push({ field: 'locality_name', message: `Localidad "${locNameRaw}" ambigua sin departamento. Se usará como manual.` });
            }
        } else {
            // Try partial match
            const partialLoc = locList.find(l =>
                l.name.toUpperCase().includes(locNameRaw.toUpperCase()) ||
                locNameRaw.toUpperCase().includes(l.name.toUpperCase())
            );
            if (partialLoc) {
                localityId = partialLoc.id;
                if (!departmentId) departmentId = partialLoc.departamento_id;
                warnings.push({ field: 'locality_name', message: `"${locNameRaw}" → "${partialLoc.name}" (match parcial)` });
            } else {
                localityManual = locNameRaw;
                warnings.push({ field: 'locality_name', message: `Localidad "${locNameRaw}" no encontrada` });
            }
        }
    }

    // XOR fallback: if no locality_id and no locality_manual
    // ERROR in Commit: Do NOT try to insert if this is invalid.
    if (!localityId && !localityManual) {
        return {
            rowIndex,
            status: 'FAILED',
            // Return specific error so user knows why
            errors: { locality_xor_missing: 'Se requiere una localidad válida o manual (evita error de base de datos).' },
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    // Clear manual if we have ID (sanity check)
    if (localityId && localityManual) {
        localityManual = null;
    }

    // Department fallback: if still no department
    if (!departmentId && !localityId) {
        warnings.push({ field: 'department_name', message: 'Sin departamento' });
    }

    // ── Resolve agency ──────────────────────────────────────────────────

    let agenciaOrgId: string | null = defaults.agencia_org_id || null;
    const agencyNameRaw = mapped.agency_name as string | null;

    if (agencyNameRaw) {
        // Check entity resolutions first
        const resolution = entityResolutions?.agencies?.[agencyNameRaw];
        if (resolution) {
            agenciaOrgId = resolution; // resolved by user
        } else {
            // Try direct match
            const match = agenciesByName.get(agencyNameRaw.toUpperCase());
            if (match) agenciaOrgId = match;
            else warnings.push({ field: 'agency_name', message: `Agencia "${agencyNameRaw}" no encontrada` });
        }
    }

    // ── Resolve service_type ────────────────────────────────────────────

    let serviceTypeId: string | null = null;
    const svcRaw = (mapped.service_type || defaults.service_type) as string | null;
    if (svcRaw) {
        serviceTypeId = svcByCode.get(svcRaw) || null;
        if (!serviceTypeId) {
            // Try case-insensitive
            for (const [code, id] of svcByCode) {
                if (code.toLowerCase() === svcRaw.toLowerCase()) {
                    serviceTypeId = id;
                    break;
                }
            }
        }
    }

    // ── Stop if critical errors ─────────────────────────────────────────

    if (Object.keys(errors).length > 0) {
        return { rowIndex, status: 'FAILED', errors, warnings: warnings.length > 0 ? warnings : undefined };
    }

    // Resolve delivery type logic
    let deliveryType = defaults.delivery_type || 'domicilio';
    if (deliveryTypeInferred) {
        deliveryType = deliveryTypeInferred;
    }

    // ── Deduplication Check ─────────────────────────────────────────────

    if (dedupeCheck && !force) {
        try {
            const { isDuplicate, shipmentId, reason } = await checkDuplicate(
                supabase,
                remitenteOrgId,
                mapped,
                serviceTypeId,
                agenciaOrgId,
                deliveryType as 'domicilio' | 'sucursal'
            );
            if (isDuplicate) {
                return {
                    rowIndex,
                    status: 'SKIPPED_DUPLICATE',
                    reason: reason,
                    shipmentId: shipmentId,
                    warnings: warnings.length > 0 ? warnings : undefined,
                };
            }
        } catch (e) {
            console.error('Dedup check error', e);
        }
    }

    // ── Build shipment insert data ──────────────────────────────────────

    const trackingCode = generateTrackingCode();
    const isFreightPaid = mapped.is_freight_paid === true;

    const shipmentData: Record<string, unknown> = {
        tracking_code: trackingCode,
        remitente_org_id: remitenteOrgId,
        cadeteria_org_id: defaults.cadeteria_org_id || null,
        agencia_org_id: agenciaOrgId,
        service_type_id: serviceTypeId,
        status: 'pendiente',
        recipient_name: recipientName,
        recipient_phone: (mapped.recipient_phone as string) || null,
        recipient_email: (mapped.recipient_email as string) || null,
        recipient_address: (mapped.recipient_address as string) || null,
        department_id: departmentId,
        locality_id: localityId,
        locality_manual: localityId ? null : localityManual, // XOR: only one
        recipient_department: departmentId
            ? deptList.find(d => d.id === departmentId)?.name || null
            : (deptNameRaw || null),
        recipient_city: localityId
            ? locList.find(l => l.id === localityId)?.name || null
            : (localityManual || locNameRaw || null), // Use manual if no ID, then raw
        delivery_type: deliveryType,
        package_size: (mapped.package_size as string) || defaults.package_size || 'mediano',
        package_count: 1,
        weight_kg: (mapped.weight_kg as number) || null,
        description: (mapped.content_description as string) || null,
        notes: (mapped.notes as string) || null,
        shipping_cost: (mapped.shipping_cost as number) || null,
        is_freight_paid: isFreightPaid,
        freight_amount: (mapped.freight_amount as number) || null,
        recipient_observations: (mapped.observations as string) || null,
    };

    // ── Create via Service (Atomic) ─────────────────────────────────────

    // Construct package data from row (default 1 package)
    const packageInserts: PackageInsert[] = [{
        index: 1,
        size: (mapped.package_size as 'chico' | 'mediano' | 'grande') || 'mediano',
        weight_kg: (mapped.weight_kg as number) || null,
        shipping_cost: (mapped.shipping_cost as number) || null,
        content_description: (mapped.content_description as string) || null,
    }];

    // Call unified service
    const result = await createShipment(supabase, shipmentData, packageInserts);

    if (!result.ok) {
        return {
            rowIndex,
            status: 'FAILED',
            errors: { _db: result.error || 'Error creando envío' },
            warnings: warnings.length > 0 ? warnings : undefined,
            // fieldErrors currently returned by service might need mapping if we want specific cell highlights
        };
    }

    const inserted = result.data!;

    return {
        rowIndex,
        status: 'INSERTED',
        shipmentId: inserted.id,
        trackingCode: inserted.tracking_code,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}
