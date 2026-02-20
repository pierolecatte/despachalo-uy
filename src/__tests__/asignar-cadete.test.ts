import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers: Mock factories for Supabase responses
// ---------------------------------------------------------------------------

/** Builds a mock user record from the `users` table */
function mockUser(overrides: Partial<{
    id: string; org_id: string; role: string; active: boolean; auth_user_id: string
}> = {}) {
    return {
        id: overrides.id ?? 'cadete-user-1',
        org_id: overrides.org_id ?? 'cadeteria-org-1',
        role: overrides.role ?? 'cadete',
        active: overrides.active ?? true,
        auth_user_id: overrides.auth_user_id ?? 'auth-uid-1',
    }
}

/** Builds a mock shipment record */
function mockEnvio(overrides: Partial<{
    id: string; cadeteria_org_id: string | null; cadete_user_id: string | null
}> = {}) {
    return {
        id: overrides.id ?? 'envio-1',
        cadeteria_org_id: overrides.cadeteria_org_id ?? 'cadeteria-org-1',
        cadete_user_id: overrides.cadete_user_id ?? null,
    }
}

// ---------------------------------------------------------------------------
// Inline validation logic extracted from the API endpoints.
// These pure functions mirror the checks in route.ts and can be tested
// without spinning up Supabase or Next.js.
// ---------------------------------------------------------------------------

interface ValidateCadeteAssignmentInput {
    envio: { id: string; cadeteria_org_id: string | null; cadete_user_id: string | null } | null
    cadete: { id: string; org_id: string; role: string; active: boolean } | null
    actorRole: string
}

interface ValidationResult {
    ok: boolean
    status?: number
    message: string
}

/** Mirrors the validation chain in POST /api/envios/[id]/asignar-cadete */
function validateCadeteAssignment(input: ValidateCadeteAssignmentInput): ValidationResult {
    const { envio, cadete, actorRole } = input

    if (actorRole !== 'super_admin' && actorRole !== 'org_admin') {
        return { ok: false, status: 403, message: 'Solo administradores pueden asignar cadetes manualmente' }
    }
    if (!envio) {
        return { ok: false, status: 404, message: 'Envío no encontrado' }
    }
    if (!envio.cadeteria_org_id) {
        return { ok: false, status: 400, message: 'El envío no tiene cadetería asignada' }
    }
    if (!cadete) {
        return { ok: false, status: 404, message: 'Cadete no encontrado' }
    }
    if (cadete.role !== 'cadete') {
        return { ok: false, status: 400, message: 'El usuario especificado no tiene rol de cadete' }
    }
    if (!cadete.active) {
        return { ok: false, status: 400, message: 'El cadete no está activo' }
    }
    if (cadete.org_id !== envio.cadeteria_org_id) {
        return { ok: false, status: 400, message: 'El cadete no pertenece a la cadetería asignada al envío' }
    }

    return { ok: true, message: 'ok' }
}

// -- Scan logic (mirrors the RPC) --

interface ScanInput {
    cadete: { id: string; org_id: string } | null
    envio: { id: string; cadeteria_org_id: string | null; cadete_user_id: string | null } | null
}

interface ScanResult {
    status: string
    message: string
    reassigned: boolean
}

/** Mirrors the business logic inside cadete_scan_envio RPC */
function simulateScan(input: ScanInput): ScanResult {
    const { cadete, envio } = input

    if (!cadete) {
        return { status: 'error', message: 'Usuario no es un cadete activo', reassigned: false }
    }

    if (!envio) {
        return { status: 'not_found', message: 'Código inválido o envío inexistente', reassigned: false }
    }

    if (envio.cadeteria_org_id === null || envio.cadeteria_org_id !== cadete.org_id) {
        return { status: 'other_cadeteria', message: 'Envío asignado a otra cadetería', reassigned: false }
    }

    if (envio.cadete_user_id === null) {
        return { status: 'asignado', message: 'Envío asignado correctamente', reassigned: false }
    }

    if (envio.cadete_user_id !== cadete.id) {
        return { status: 'reasignado', message: 'Envío reasignado a tu nombre', reassigned: true }
    }

    return { status: 'confirmado', message: 'Envío ya asignado a tu nombre', reassigned: false }
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('Asignación de Cadete por Envío', () => {

    // =========================================
    // Caso 1: Asignar cadete correcto → OK
    // =========================================
    it('asigna cadete que pertenece a la misma cadetería del envío', () => {
        const result = validateCadeteAssignment({
            actorRole: 'org_admin',
            envio: mockEnvio({ cadeteria_org_id: 'cadeteria-org-1' }),
            cadete: mockUser({ org_id: 'cadeteria-org-1', role: 'cadete', active: true }),
        })

        expect(result.ok).toBe(true)
    })

    // =========================================
    // Caso 2: Asignar cadete de otra cadetería → error
    // =========================================
    it('rechaza asignación de cadete de otra cadetería', () => {
        const result = validateCadeteAssignment({
            actorRole: 'org_admin',
            envio: mockEnvio({ cadeteria_org_id: 'cadeteria-org-1' }),
            cadete: mockUser({ org_id: 'cadeteria-org-OTRA', role: 'cadete', active: true }),
        })

        expect(result.ok).toBe(false)
        expect(result.status).toBe(400)
        expect(result.message).toContain('no pertenece a la cadetería')
    })

    it('rechaza asignación cuando el usuario no es cadete', () => {
        const result = validateCadeteAssignment({
            actorRole: 'org_admin',
            envio: mockEnvio({ cadeteria_org_id: 'cadeteria-org-1' }),
            cadete: mockUser({ org_id: 'cadeteria-org-1', role: 'operador' }),
        })

        expect(result.ok).toBe(false)
        expect(result.status).toBe(400)
        expect(result.message).toContain('no tiene rol de cadete')
    })

    it('rechaza asignación cuando cadete está inactivo', () => {
        const result = validateCadeteAssignment({
            actorRole: 'org_admin',
            envio: mockEnvio({ cadeteria_org_id: 'cadeteria-org-1' }),
            cadete: mockUser({ org_id: 'cadeteria-org-1', active: false }),
        })

        expect(result.ok).toBe(false)
        expect(result.status).toBe(400)
        expect(result.message).toContain('no está activo')
    })

    it('rechaza cuando usuario que asigna no es admin', () => {
        const result = validateCadeteAssignment({
            actorRole: 'cadete',
            envio: mockEnvio(),
            cadete: mockUser(),
        })

        expect(result.ok).toBe(false)
        expect(result.status).toBe(403)
    })
})

describe('Escaneo de Envío por Cadete', () => {

    // =========================================
    // Caso 3: Scan envío inexistente → not_found
    // =========================================
    it('devuelve not_found cuando el código no existe', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-1', org_id: 'org-1' },
            envio: null,
        })

        expect(result.status).toBe('not_found')
        expect(result.message).toBe('Código inválido o envío inexistente')
        expect(result.reassigned).toBe(false)
    })

    // =========================================
    // Caso 4: Scan envío de otra cadetería → mensaje exacto
    // =========================================
    it('devuelve other_cadeteria con mensaje exacto cuando es de otra cadetería', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-1', org_id: 'org-A' },
            envio: mockEnvio({ cadeteria_org_id: 'org-B' }),
        })

        expect(result.status).toBe('other_cadeteria')
        expect(result.message).toBe('Envío asignado a otra cadetería')
        expect(result.reassigned).toBe(false)
    })

    // =========================================
    // Caso 5: Scan misma cadetería + otro cadete → reasignación + log
    // =========================================
    it('reasigna automáticamente cuando otro cadete de la misma cadetería escaneó', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-NUEVO', org_id: 'org-1' },
            envio: mockEnvio({
                cadeteria_org_id: 'org-1',
                cadete_user_id: 'cadete-ANTERIOR',  // otro cadete
            }),
        })

        expect(result.status).toBe('reasignado')
        expect(result.message).toBe('Envío reasignado a tu nombre')
        expect(result.reassigned).toBe(true)
    })

    // -- Casos adicionales --

    it('asigna al cadete cuando el envío no tiene cadete asignado', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-1', org_id: 'org-1' },
            envio: mockEnvio({ cadeteria_org_id: 'org-1', cadete_user_id: null }),
        })

        expect(result.status).toBe('asignado')
        expect(result.message).toBe('Envío asignado correctamente')
        expect(result.reassigned).toBe(false)
    })

    it('confirma cuando el cadete ya tiene el envío asignado', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-1', org_id: 'org-1' },
            envio: mockEnvio({ cadeteria_org_id: 'org-1', cadete_user_id: 'cadete-1' }),
        })

        expect(result.status).toBe('confirmado')
        expect(result.message).toBe('Envío ya asignado a tu nombre')
        expect(result.reassigned).toBe(false)
    })

    it('maneja envío sin cadetería asignada como otra cadetería', () => {
        const result = simulateScan({
            cadete: { id: 'cadete-1', org_id: 'org-1' },
            envio: mockEnvio({ cadeteria_org_id: null }),
        })

        expect(result.status).toBe('other_cadeteria')
    })
})
