import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { AIProvider } from './provider';
import { MappingResult, TARGET_FIELDS, TargetField } from '../import/import-schema';

export class GeminiProvider implements AIProvider {
    private client: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.client = new GoogleGenerativeAI(apiKey);
        this.model = this.client.getGenerativeModel({
            model: 'gemini-1.5-flash', // Cost-effective and fast
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        mappings: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    sourceHeader: { type: SchemaType.STRING },
                                    targetField: { type: SchemaType.STRING },
                                    transform: { type: SchemaType.STRING, nullable: true }, // Gemini handles nullable this way
                                    confidence: { type: SchemaType.NUMBER },
                                },
                                required: ['sourceHeader', 'targetField', 'confidence'],
                            },
                        },
                        defaultsSuggested: {
                            type: SchemaType.OBJECT,
                            properties: {}, // Allow any keys for defaults
                        },
                        questions: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING },
                        },
                        notes: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING },
                        },
                    },
                    required: ['mappings', 'defaultsSuggested', 'questions', 'notes'],
                },
            },
        });
    }

    async suggestMapping(
        headers: string[],
        sampleObjects: Record<string, string>[],
        context?: { requiredCandidates?: string[]; remitenteName?: string }
    ): Promise<MappingResult> {
        const samplePreview = sampleObjects.slice(0, 5);
        let prompt = `You are a data-mapping assistant for a Uruguayan shipping platform (despachalo.uy).
        
Target fields (choose from this exact list):
${TARGET_FIELDS.filter(f => f !== '_ignore').join(', ')}

Use "_ignore" for columns that don't map to any target field.

Rules:
- confidence is 0.0-1.0, where 1.0 means certain.
- For ambiguous columns, set confidence lower.
- If a column seems like it contains freight/shipping payment info ("FLETE PAGO", "PAGO", etc.), map to is_freight_paid.
- If a column has monetary amounts related to freight, map to freight_amount.
- Columns with phone/cel/teléfono → recipient_phone.
- Columns with department/departamento → department_name.
- Columns with localidad/locality/ciudad/city → locality_name.
- Columns with obs/observaciones/notas → observations or notes.
- defaultsSuggested: suggest defaults only when obvious from the data.
- questions: list any ambiguities (max 3).
- notes: brief explanations of non-obvious mapping choices.
- Data is in Spanish (Uruguay).

Headers: ${JSON.stringify(headers)}

Sample data (${samplePreview.length} rows):
${JSON.stringify(samplePreview, null, 2)}
`;

        if (context?.requiredCandidates?.length) {
            prompt += `Possible key fields detected: ${context.requiredCandidates.join(', ')}\n`;
        }
        if (context?.remitenteName) {
            prompt += `Organization context: remitente = "${context.remitenteName}"\n`;
        }
        prompt += '\nSuggest the mapping in JSON format.';

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const parsed = JSON.parse(responseText);

            // Validate targetField enum manually as strict schema might be loose on string values
            if (parsed.mappings) {
                parsed.mappings = parsed.mappings.map((m: any) => ({
                    ...m,
                    targetField: TARGET_FIELDS.includes(m.targetField) ? m.targetField : '_ignore',
                }));
            }

            return parsed as MappingResult;
        } catch (error) {
            console.error('[GeminiProvider] Error generating content:', error);
            throw error; // Let caller handle fallback
        }
    }
}
