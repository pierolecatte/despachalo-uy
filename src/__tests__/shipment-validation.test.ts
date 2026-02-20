import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAndNormalizeShipment } from '../lib/shipments/validate-and-normalize';

// Mock Supabase Client
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSupabase = {
    from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                single: mockSingle,
            }),
        }),
    }),
};

describe('validateAndNormalizeShipment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should pass for valid manual locality', async () => {
        const input = {
            locality_manual: ' Montevideo ',
            department_id: 10, // Assuming 10 is valid
            // other fields...
        };

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.locality_manual).toBe('Montevideo');
            expect(result.data.department_id).toBe(10);
            expect(result.data.locality_id).toBeNull();
        }
    });

    it('should fail if locality_manual is missing department_id', async () => {
        const input = {
            locality_manual: 'Montevideo',
            department_id: null,
        };

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.fieldErrors.department_id).toBeDefined();
        }
    });

    it('should fail if neither locality is provided', async () => {
        const input = {
            department_id: 10,
        };

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.fieldErrors.locality).toBeDefined();
        }
    });

    it('should fail if both locality_id and locality_manual are provided', async () => {
        const input = {
            locality_id: 123,
            locality_manual: 'Montevideo',
            department_id: 10,
        };

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.fieldErrors.locality).toBeDefined();
        }
    });

    it('should pass for valid locality_id and auto-fill department', async () => {
        const input = {
            locality_id: 123,
            // department_id missing
        };

        // Mock DB response
        mockSingle.mockResolvedValue({
            data: { departamento_id: 55 },
            error: null
        });

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.locality_id).toBe(123);
            expect(result.data.department_id).toBe(55);
        }
    });

    it('should fail for locality_id mismatch with department_id', async () => {
        const input = {
            locality_id: 123,
            department_id: 99, // Wrong department
        };

        // Mock DB response says department is 55
        mockSingle.mockResolvedValue({
            data: { departamento_id: 55 },
            error: null
        });

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.fieldErrors.department_id).toContain('Mismatch');
        }
    });

    it('should fail for invalid locality_id (not found in DB)', async () => {
        const input = {
            locality_id: 999,
        };

        // Mock DB error
        mockSingle.mockResolvedValue({
            data: null,
            error: { message: 'Not found' }
        });

        const result = await validateAndNormalizeShipment(input, mockSupabase as any);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.fieldErrors.locality_id).toContain('Invalid');
        }
    });
});
