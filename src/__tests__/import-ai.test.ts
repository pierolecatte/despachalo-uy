import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeuristicsProvider } from '../lib/ai/heuristics';
// import { GeminiProvider } from '../lib/ai/gemini';

/*
    generateContent: vi.fn()
}));

vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
            getGenerativeModel: vi.fn().mockReturnValue({
                generateContent: mocks.generateContent
            })
        })),
        SchemaType: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' }
    };
});
*/

describe('HeuristicsProvider', () => {
    it('should map common headers correctly', async () => {
        const provider = new HeuristicsProvider();
        const headers = ['Dirección', 'Nombre', 'Teléfono', 'Pago Flete'];
        const samples = [{}];

        const result = await provider.suggestMapping(headers, samples);

        expect(result.mappings).toHaveLength(4);
        expect(result.mappings.find(m => m.sourceHeader === 'Dirección')?.targetField).toBe('recipient_address');
        expect(result.mappings.find(m => m.sourceHeader === 'Nombre')?.targetField).toBe('recipient_name');
        expect(result.mappings.find(m => m.sourceHeader === 'Teléfono')?.targetField).toBe('recipient_phone');
        expect(result.mappings.find(m => m.sourceHeader === 'Pago Flete')?.targetField).toBe('is_freight_paid');
    });

    it('should fallback to _ignore for unknown headers', async () => {
        const provider = new HeuristicsProvider();
        const headers = ['Unknown Column 123'];
        const result = await provider.suggestMapping(headers, [{}]);

        expect(result.mappings[0].targetField).toBe('_ignore');
    });
});

/*
describe('GeminiProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should parse valid JSON response', async () => {
        const mockResponse = {
            mappings: [
                { sourceHeader: 'Dir', targetField: 'recipient_address', confidence: 0.9 }
            ],
            defaultsSuggested: {},
            questions: [],
            notes: []
        };

        mocks.generateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockResponse)
            }
        });

        const provider = new GeminiProvider('fake-key');
        const result = await provider.suggestMapping(['Dir'], [{}]);

        expect(result.mappings[0].targetField).toBe('recipient_address');
        expect(mocks.generateContent).toHaveBeenCalled();
    });

    it('should throw error on invalid JSON', async () => {
        mocks.generateContent.mockResolvedValue({
            response: {
                text: () => 'Invalid JSON'
            }
        });

        const provider = new GeminiProvider('fake-key');
        await expect(provider.suggestMapping(['Dir'], [{}])).rejects.toThrow();
    });
});
*/
