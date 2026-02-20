/* eslint-disable @typescript-eslint/no-empty-object-type */

// Stub: replace with Supabase-generated types via `supabase gen types typescript`
export interface Database {
    public: {
        Tables: {
            [key: string]: {
                Row: Record<string, unknown>
                Insert: Record<string, unknown>
                Update: Record<string, unknown>
            }
        }
        Views: {}
        Functions: {}
        Enums: {}
    }
}

// ── Domain types used across the app ──────────────────────────────────

export type PackageSize = 'chico' | 'mediano' | 'grande'

export type OrgType = 'remitente' | 'cadeteria' | 'agencia'

export type UserRole = 'super_admin' | 'org_admin' | 'operador' | 'cadete'

export interface AsignarCadeteResponse {
    status: 'ok' | 'error'
    message: string
    envioId?: string
    cadeteId?: string
}

export interface CadeteScanResponse {
    status: 'ok' | 'error' | 'not_found'
    message: string
    reassigned: boolean
    envioId: string | null
    cadeteId: string | null
}
