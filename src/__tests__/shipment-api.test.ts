import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/shipments/route';
import { validateAndNormalizeShipment } from '../lib/shipments/validate-and-normalize';

// Mock dependencies
vi.mock('../lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

vi.mock('../lib/shipments/validate-and-normalize', () => ({
    validateAndNormalizeShipment: vi.fn(),
}));

// Mock Supabase Client inside route
const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(),
};

import { createClient } from '../lib/supabase/server';

describe('POST /api/shipments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as any).mockResolvedValue(mockSupabase);
    });

    it('should return 400 if validation fails', async () => {
        // Validation fails
        (validateAndNormalizeShipment as any).mockResolvedValue({
            ok: false,
            message: 'Validation failed',
            fieldErrors: { locality: 'Error' }
        });

        const req = {
            json: vi.fn().mockResolvedValue({ some: 'data' })
        } as any;

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.code).toBe('VALIDATION_ERROR');
        expect(body.fieldErrors.locality).toBe('Error');
    });

    it('should return 201 and data if validation succeeds and insert works', async () => {
        // Validation succeeds
        const normalizedData = { id: 'ship_123' };
        (validateAndNormalizeShipment as any).mockResolvedValue({
            ok: true,
            data: normalizedData
        });

        // Insert succeeds
        mockSupabase.single.mockResolvedValue({
            data: { id: 'ship_123', tracking_code: 'TRK123' },
            error: null
        });

        const req = {
            json: vi.fn().mockResolvedValue({ some: 'data' })
        } as any;

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(201);
        expect(body.id).toBe('ship_123');
        expect(mockSupabase.from).toHaveBeenCalledWith('shipments');
        expect(mockSupabase.insert).toHaveBeenCalledWith([normalizedData]);
    });

    it('should return 500 if DB insert fails', async () => {
        // Validation succeeds
        (validateAndNormalizeShipment as any).mockResolvedValue({
            ok: true,
            data: {}
        });

        // Insert fails
        mockSupabase.single.mockResolvedValue({
            data: null,
            error: { message: 'DB Error' }
        });

        const req = {
            json: vi.fn().mockResolvedValue({})
        } as any;

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.code).toBe('DB_ERROR');
    });
});
