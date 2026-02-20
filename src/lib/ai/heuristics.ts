import { AIProvider } from './provider';
import { MappingResult, TargetField } from '../import/import-schema';

export class HeuristicsProvider implements AIProvider {
    async suggestMapping(
        headers: string[],
        sampleObjects: Record<string, string>[],
        context?: { requiredCandidates?: string[]; remitenteName?: string }
    ): Promise<MappingResult> {
        const mappings = headers.map(header => {
            const normalized = header.toLowerCase().trim();
            let target: TargetField = '_ignore';
            let confidence = 0.1;

            // Basic regex matching
            if (/nombre|destinatario|cliente|receptor/i.test(normalized)) {
                target = 'recipient_name';
                confidence = 0.8;
            } else if (/direcci[oó]n|calle|domicilio/i.test(normalized)) {
                target = 'recipient_address';
                confidence = 0.8;
            } else if (/telef|tel|cel|movil|phone/i.test(normalized)) {
                target = 'recipient_phone';
                confidence = 0.8;
            } else if (/email|correo|mail/i.test(normalized)) {
                target = 'recipient_email';
                confidence = 0.8;
            } else if (/departamento|depto|provincia/i.test(normalized)) {
                target = 'department_name';
                confidence = 0.8;
            } else if (/localidad|ciudad|city|pueblo/i.test(normalized)) {
                target = 'locality_name';
                confidence = 0.8;
            } else if (/obs|observaciones/i.test(normalized)) {
                target = 'observations';
                confidence = 0.6;
            } else if (/notas|comentario/i.test(normalized)) {
                target = 'notes';
                confidence = 0.6;
            } else if (/flete|pago|pagar/i.test(normalized)) {
                target = 'is_freight_paid';
                confidence = 0.7;
            } else if (/monto|precio|costo(\s*env[ií]o)?/i.test(normalized)) {
                target = 'shipping_cost'; // or freight_amount? Schema has both, usually shipping_cost is for us.
                confidence = 0.6;
            } else if (/valor(\s*flete)?|importe/i.test(normalized)) {
                target = 'freight_amount';
                confidence = 0.6;
            } else if (/medidas|tamaño|dimensiones/i.test(normalized)) {
                target = 'package_size';
                confidence = 0.6;
            } else if (/peso|kilo|kg/i.test(normalized)) {
                target = 'weight_kg';
                confidence = 0.6;
            } else if (/contenido|descri/i.test(normalized)) {
                target = 'content_description';
                confidence = 0.6;
            } else if (/agencia|transporte/i.test(normalized)) {
                target = 'agency_name';
                confidence = 0.6;
            } else if (/servicio|tipo/i.test(normalized)) {
                target = 'service_type';
                confidence = 0.6;
            }

            return {
                sourceHeader: header,
                targetField: target,
                confidence,
                transform: undefined // Must be undefined or string, not null
            };
        });

        return {
            mappings,
            defaultsSuggested: {},
            questions: [],
            notes: ['Generated using basic text pattern matching (heuristics).']
        };
    }
}
