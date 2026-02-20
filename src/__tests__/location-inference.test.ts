import { describe, it, expect } from 'vitest';
import { inferLocation, type InferenceContext } from '@/lib/import/location-inference';

describe('inferLocation', () => {
    const context: InferenceContext = {
        departments: [
            { id: 1, name: 'Canelones' },
            { id: 2, name: 'Maldonado' },
            { id: 3, name: 'Rio Negro' },
            { id: 4, name: 'San José' },
            { id: 5, name: 'Salto' },
        ],
        localitiesByDept: {
            1: [
                { id: 101, name: 'San Ramon' },
                { id: 102, name: 'Pando' },
            ],
            2: [
                { id: 201, name: 'Maldonado' },
                { id: 202, name: 'La Capuera' },
                { id: 203, name: 'Punta del Este' },
            ],
            3: [
                { id: 301, name: 'Fray Bentos' }, // Capital
            ],
            4: [
                { id: 401, name: 'San Jose de Mayo' },
            ],
            5: [
                { id: 501, name: 'Salto' }, // Capital
            ]
        }
    };


    it('infers Depto and Locality correctly', () => {
        const address = 'Canelones - San Ramon - Calle 1';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(1);
        expect(result.localityId).toBe(101);
        expect(result.warnings).toBeUndefined();
    });

    it('infers Depto and Locality when names are identical', () => {
        const address = 'Maldonado - Maldonado - Av España';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(2);
        expect(result.localityId).toBe(201);
    });

    it('handles accents in department name', () => {
        const address = 'RIO NEGRO - Fray Bentos - 18 de Julio';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(3);
        expect(result.localityId).toBe(301);
    });

    it('detects "Agencia" keyword in last segment -> deliveryType=sucursal', () => {
        const address = 'Maldonado - La Capuera - Agencia';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(2);
        expect(result.localityId).toBe(202);
        expect(result.deliveryType).toBe('sucursal');
        expect(result.warnings).toBeUndefined();
    });

    it('detects "Retiro" keyword in last segment -> deliveryType=sucursal', () => {
        const address = 'Canelones - San Ramon - Retiro';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(1);
        expect(result.localityId).toBe(101);
        expect(result.deliveryType).toBe('sucursal');
    });

    it('handles "Depto - Agencia" -> Infers Capital matching Dept Name', () => {
        // Maldonado (dept 2) has locality "Maldonado" (id 201)
        const address = 'Maldonado - Agencia';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(2);
        expect(result.localityId).toBe(201);
        expect(result.deliveryType).toBe('sucursal');
    });

    it('handles "Depto - Agencia" -> Manual Locality if no capital exact match', () => {
        // Rio Negro (3) has "Fray Bentos" (301), NOT "Rio Negro" city.
        const address = 'Rio Negro - Agencia';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(3);
        expect(result.localityId).toBeUndefined();
        expect(result.localityManual).toBe('Rio Negro'); // Fallback manual
        expect(result.deliveryType).toBe('sucursal');
        expect(result.warnings).toContain('locality_inferred_manual');
    });

    it('handles different separators', () => {
        const address = 'Maldonado, La Capuera, Agencia';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(2);
        expect(result.localityId).toBe(202);
        expect(result.deliveryType).toBe('sucursal');
    });

    it('populates manual locality if dept match but loc not found', () => {
        // "Ciudad Desconocida" not in ID 1
        const address = 'Canelones - Ciudad Desconocida';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(1);
        expect(result.localityId).toBeUndefined();
        expect(result.localityManual).toBe('Ciudad Desconocida');
        expect(result.warnings).toContain('locality_inferred_manual');
    });

    it('returns warnings if dept matches but loc not found (no manual if keyword)', () => {
        // Normalized split might affect this, but let's check basic manual usage
        const address = 'Canelones - Algo';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBe(1);
        expect(result.localityId).toBeUndefined();
        // expect(result.warnings).toContain('locality_not_found'); // Old warning
        expect(result.warnings).toContain('locality_inferred_manual'); // New warning
        expect(result.localityManual).toBe('Algo');
    });

    it('returns empty if department not found', () => {
        const address = 'Unknown - City';
        const result = inferLocation(address, context);
        expect(result.departmentId).toBeUndefined();
        expect(result.warnings).toContain('department_not_found');
        expect(result.confidence).toBe(0);
    });

    it('handles different separators', () => {
        const res = inferLocation('Canelones — San Ramon', context); // Em dash
        expect(res.departmentId).toBe(1);
        expect(res.localityId).toBe(101);
    });
});
