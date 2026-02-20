
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDuplicate } from '@/lib/import/deduplication';

// Mock Supabase client
const mockSupabase = {
    from: vi.fn(),
};

describe('checkDuplicate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns duplicate if tracking_code exists', async () => {
        const mockSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-id' } })
                })
            })
        });

        mockSupabase.from.mockReturnValue({ select: mockSelect });

        const result = await checkDuplicate(
            mockSupabase as any,
            'org-123',
            { tracking_code: 'TRACK123' },
            'service-abc'
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.shipmentId).toBe('existing-id');
        expect(result.reason).toContain('Tracking Code "TRACK123" ya existe');
    });

    it('returns duplicate if fingerprint matches (phone+address)', async () => {
        // Mock for tracking code check (not found)
        // Wait, if no tracking_code passed, it skips step 1.

        // Mock chain for fingerprint query
        const mockLimit = vi.fn().mockResolvedValue({ data: [{ id: 'fingerprint-match-id' }] });
        const mockEqAddress = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockEqPhone = vi.fn().mockReturnValue({ eq: mockEqAddress }); // Chained eq
        const mockEqService = vi.fn().mockReturnValue({ eq: mockEqPhone }); // Chained eq
        const mockGt = vi.fn().mockReturnValue({ eq: mockEqService });
        const mockEqOrg = vi.fn().mockReturnValue({ gt: mockGt });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEqOrg });

        // We need to match the exact chain structure in the implementation
        // Implementation:
        // .from('shipments')
        // .select('id')
        // .eq('remitente_org_id', ...)
        // .gt('created_at', ...)
        // .eq('service_type_id', ...)
        // if (phone) .eq('recipient_phone', ...)
        // if (address) .eq('recipient_address', ...)
        // .limit(1)

        // It's hard to mock fluid chains perfectly with simple mocks if the chain is dynamic.
        // But let's try a recursive mock object.

        const createMockQuery = () => {
            const query: any = {};
            query.select = vi.fn().mockReturnValue(query);
            query.eq = vi.fn().mockReturnValue(query);
            query.gt = vi.fn().mockReturnValue(query);
            query.limit = vi.fn().mockResolvedValue({ data: [{ id: 'fingerprint-match-id' }] });
            query.maybeSingle = vi.fn().mockResolvedValue({ data: null }); // For tracking code check if needed
            return query;
        };

        const mockQuery = createMockQuery();
        mockSupabase.from.mockReturnValue(mockQuery);

        const result = await checkDuplicate(
            mockSupabase as any,
            'org-123',
            { recipient_phone: '099123456', recipient_address: 'Calle 123' },
            'service-abc'
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.shipmentId).toBe('fingerprint-match-id');
        expect(result.reason).toContain('Duplicado detectado');

        // Verify calls
        expect(mockQuery.eq).toHaveBeenCalledWith('recipient_phone', '099123456');
        expect(mockQuery.eq).toHaveBeenCalledWith('recipient_address', 'Calle 123');
    });

    it('returns false if no match found', async () => {
        const createMockQuery = () => {
            const query: any = {};
            query.select = vi.fn().mockReturnValue(query);
            query.eq = vi.fn().mockReturnValue(query);
            query.gt = vi.fn().mockReturnValue(query);
            query.limit = vi.fn().mockResolvedValue({ data: [] }); // No results
            query.maybeSingle = vi.fn().mockResolvedValue({ data: null });
            return query;
        };

        const mockQuery = createMockQuery();
        mockSupabase.from.mockReturnValue(mockQuery);

        const result = await checkDuplicate(
            mockSupabase as any,
            'org-123',
            { recipient_phone: '099123456' },
            'service-abc'
        );

        expect(result.isDuplicate).toBe(false);
    });
});
