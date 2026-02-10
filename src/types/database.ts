// Tipos de la base de datos de despachalo.uy
// Este archivo se puede regenerar con: npx supabase gen types typescript

export type OrgType = 'remitente' | 'cadeteria' | 'agencia' | 'admin'
export type UserRole = 'super_admin' | 'org_admin' | 'cadete' | 'operador'
export type ShipmentStatus = 'pendiente' | 'levantado' | 'despachado' | 'en_transito' | 'entregado' | 'con_problema'
export type DeliveryType = 'domicilio' | 'sucursal'
export type PackageSize = 'chico' | 'mediano' | 'grande'
export type PhotoType = 'comprobante' | 'paquete' | 'etiqueta' | 'documento_adicional'
export type NotificationChannel = 'email' | 'whatsapp' | 'push'
export type NotificationStatus = 'pendiente' | 'enviada' | 'fallida'
export type PricingMode = 'fijo' | 'por_zona' | 'por_km' | 'por_hora' | 'custom'
export type CoverageArea = 'metropolitana' | 'interior' | 'ambos'
export type ServiceTypeCode = 'despacho_agencia' | 'express_24h' | 'comun_48h' | 'por_km' | 'por_horas' | 'especial'
export type InvoiceStatus = 'pendiente' | 'pagada'

export interface Database {
    public: {
        Tables: {
            organizations: {
                Row: {
                    id: string
                    name: string
                    type: OrgType
                    linked_remitente_id: string | null
                    is_internal_cadeteria: boolean
                    logo_url: string | null
                    phone: string | null
                    email: string | null
                    address: string | null
                    latitude: number | null
                    longitude: number | null
                    settings: Record<string, unknown> | null
                    active: boolean
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'active'> & {
                    id?: string
                    created_at?: string
                    active?: boolean
                }
                Update: Partial<Database['public']['Tables']['organizations']['Insert']>
            }
            users: {
                Row: {
                    id: string
                    org_id: string
                    email: string
                    full_name: string
                    role: UserRole
                    phone: string | null
                    active: boolean
                    default_permissions: Record<string, boolean> | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'active'> & {
                    id?: string
                    created_at?: string
                    active?: boolean
                }
                Update: Partial<Database['public']['Tables']['users']['Insert']>
            }
            shipments: {
                Row: {
                    id: string
                    remitente_org_id: string
                    cadeteria_org_id: string | null
                    agencia_org_id: string | null
                    cadete_user_id: string | null
                    service_type_id: string | null
                    tracking_code: string
                    external_tracking: string | null
                    status: ShipmentStatus
                    recipient_name: string
                    recipient_phone: string | null
                    recipient_email: string | null
                    recipient_city: string | null
                    recipient_department: string | null
                    recipient_address: string | null
                    delivery_type: DeliveryType
                    package_size: PackageSize
                    package_count: number
                    weight_kg: number | null
                    description: string | null
                    qr_code_url: string | null
                    label_url: string | null
                    shipping_cost: number | null
                    service_cost: number | null
                    distance_km: number | null
                    hours_worked: number | null
                    notes: string | null
                    recipient_observations: string | null
                    recipient_lat: number | null
                    recipient_lng: number | null
                    pickup_at: string | null
                    dispatched_at: string | null
                    delivered_at: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['shipments']['Row'], 'id' | 'created_at' | 'tracking_code'> & {
                    id?: string
                    created_at?: string
                    tracking_code?: string
                }
                Update: Partial<Database['public']['Tables']['shipments']['Insert']>
            }
            shipment_events: {
                Row: {
                    id: string
                    shipment_id: string
                    user_id: string | null
                    event_type: string
                    description: string | null
                    latitude: number | null
                    longitude: number | null
                    metadata: Record<string, unknown> | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['shipment_events']['Row'], 'id' | 'created_at'> & {
                    id?: string
                    created_at?: string
                }
                Update: Partial<Database['public']['Tables']['shipment_events']['Insert']>
            }
            shipment_photos: {
                Row: {
                    id: string
                    shipment_id: string
                    uploaded_by: string | null
                    photo_url: string
                    photo_type: PhotoType
                    ai_extracted_data: Record<string, unknown> | null
                    processed: boolean
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['shipment_photos']['Row'], 'id' | 'created_at' | 'processed'> & {
                    id?: string
                    created_at?: string
                    processed?: boolean
                }
                Update: Partial<Database['public']['Tables']['shipment_photos']['Insert']>
            }
            service_types: {
                Row: {
                    id: string
                    org_id: string
                    code: ServiceTypeCode
                    name: string
                    description: string | null
                    pricing_mode: PricingMode
                    base_price: number | null
                    price_per_km: number | null
                    price_per_hour: number | null
                    coverage_area: CoverageArea
                    active: boolean
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['service_types']['Row'], 'id' | 'created_at' | 'active'> & {
                    id?: string
                    created_at?: string
                    active?: boolean
                }
                Update: Partial<Database['public']['Tables']['service_types']['Insert']>
            }
            tariffs: {
                Row: {
                    id: string
                    org_id: string
                    service_type_id: string
                    zone_name: string | null
                    department: string | null
                    city: string | null
                    base_price: number
                    price_per_extra_package: number | null
                    size_prices: Record<string, number> | null
                    active: boolean
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['tariffs']['Row'], 'id' | 'created_at' | 'active'> & {
                    id?: string
                    created_at?: string
                    active?: boolean
                }
                Update: Partial<Database['public']['Tables']['tariffs']['Insert']>
            }
            departments: {
                Row: {
                    id: number
                    name: string
                    code: string
                }
                Insert: Omit<Database['public']['Tables']['departments']['Row'], 'id'> & {
                    id?: number
                }
                Update: Partial<Database['public']['Tables']['departments']['Insert']>
            }
            cities: {
                Row: {
                    id: number
                    department_id: number
                    name: string
                }
                Insert: Omit<Database['public']['Tables']['cities']['Row'], 'id'> & {
                    id?: number
                }
                Update: Partial<Database['public']['Tables']['cities']['Insert']>
            }
            notifications: {
                Row: {
                    id: string
                    shipment_id: string
                    user_id: string | null
                    channel: NotificationChannel
                    status: NotificationStatus
                    message: string | null
                    sent_at: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'> & {
                    id?: string
                    created_at?: string
                }
                Update: Partial<Database['public']['Tables']['notifications']['Insert']>
            }
            cadete_locations: {
                Row: {
                    id: string
                    cadete_user_id: string
                    latitude: number
                    longitude: number
                    accuracy_meters: number | null
                    recorded_at: string
                }
                Insert: Omit<Database['public']['Tables']['cadete_locations']['Row'], 'id' | 'recorded_at'> & {
                    id?: string
                    recorded_at?: string
                }
                Update: Partial<Database['public']['Tables']['cadete_locations']['Insert']>
            }
            invoices: {
                Row: {
                    id: string
                    cadeteria_org_id: string
                    remitente_org_id: string
                    period: string
                    total_amount: number
                    status: InvoiceStatus
                    line_items: Record<string, unknown>[] | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at'> & {
                    id?: string
                    created_at?: string
                }
                Update: Partial<Database['public']['Tables']['invoices']['Insert']>
            }
            user_permissions: {
                Row: {
                    id: string
                    user_id: string
                    permission: string
                    granted: boolean
                    granted_by: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['user_permissions']['Row'], 'id' | 'created_at'> & {
                    id?: string
                    created_at?: string
                }
                Update: Partial<Database['public']['Tables']['user_permissions']['Insert']>
            }
        }
        Views: Record<string, never>
        Functions: Record<string, never>
        Enums: {
            org_type: OrgType
            user_role: UserRole
            shipment_status: ShipmentStatus
            delivery_type: DeliveryType
            package_size: PackageSize
            photo_type: PhotoType
            notification_channel: NotificationChannel
            notification_status: NotificationStatus
            pricing_mode: PricingMode
            coverage_area: CoverageArea
            service_type_code: ServiceTypeCode
            invoice_status: InvoiceStatus
        }
    }
}
