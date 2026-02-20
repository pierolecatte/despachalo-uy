export type ServiceTypeCode = 'express_24h' | 'comun_48h' | 'despacho_agencia' | 'por_km' | 'por_horas' | 'especial';
export type RegenMode = 'REGENERATE_ALL' | 'FILL_MISSING';
export type BillingState = 'PENDING' | 'INVOICED' | 'PAID' | 'CANCELLED';

export interface CourierService {
    id: string;
    courier_org_id: string;
    service_type: ServiceTypeCode;
    is_enabled: boolean;
}

export interface PricingSnapshot {
    id: string;
    shipment_id: string;
    total_to_charge: number;
    service_subtotal: number;
    reimbursable_subtotal: number;
    pricing_incomplete: boolean;
    missing_pricing_reasons: string[];
    is_overridden: boolean;
    pricing_version: number;
}

export interface PricingLine {
    id: string;
    line_type: 'ZONE_STOP_FEE' | 'PACKAGE_FEE' | 'BASE_FEE' | 'VEHICLE_RATE' | 'REIMBURSABLE' | 'EXTRA' | 'DISCOUNT';
    description: string;
    quantity: number;
    unit_amount: number;
    line_amount: number;
    is_manual: boolean;
}
