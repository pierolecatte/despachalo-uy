import { MappingResult } from '../import/import-schema';

export interface AIProvider {
    suggestMapping(
        headers: string[],
        sampleObjects: Record<string, string>[],
        context?: {
            requiredCandidates?: string[];
            remitenteName?: string;
        }
    ): Promise<MappingResult>;
}
