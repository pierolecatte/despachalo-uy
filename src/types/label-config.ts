export type PackageSize = 'chico' | 'mediano' | 'grande'

export interface LabelConfig {
    id?: string
    profile_id?: string
    size?: PackageSize // Optional because sometimes we just pass the config values
    width_mm: number
    height_mm: number

    // Sender
    show_sender_name: boolean
    show_sender_address: boolean
    show_sender_phone: boolean

    // Recipient
    show_recipient_name: boolean
    show_recipient_phone: boolean
    show_recipient_address: boolean
    show_recipient_city: boolean

    // Extra Info
    show_cadeteria: boolean
    show_agencia: boolean
    show_description: boolean

    // Logo
    show_logo: boolean
    logo_position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'bottom_center'
    logo_width_mm: number
    logo_height_mm: number
    logo_fit: 'contain' | 'cover'

    // QR
    show_qr: boolean
    qr_position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'bottom_center'
    qr_size_px: number // Keep as px for now if used by QR lib, or convert to mm? DB has px... wait migration didn't change qr_size_px.

    // Fonts
    font_family: string
    font_size_title: number
    font_size_content: number

    // Margins
    margin_top: number
    margin_bottom: number
    margin_left: number
    margin_right: number

    // New Fields
    show_service_label: boolean
    show_freight_badge: boolean
    freight_badge_position: 'service_block' | 'top' | 'bottom'
    freight_badge_variant: 'outline' | 'filled'

    theme_preset: 'minimal' | 'classic' | 'bold' | 'branded'
    primary_color: string
    show_border: boolean
    border_width_pt: number
    header_band: boolean
    header_band_height_mm: number
}

// Helper defaults
export const DEFAULT_LABEL_CONFIG: LabelConfig = {
    // ID and profile_id can be undefined
    width_mm: 100,
    height_mm: 150,

    show_sender_name: true,
    show_sender_address: true,
    show_sender_phone: true,

    show_recipient_name: true,
    show_recipient_phone: true,
    show_recipient_address: true,
    show_recipient_city: true,

    show_cadeteria: true,
    show_agencia: true,
    show_description: true,

    show_logo: true,
    logo_position: 'top_left',
    logo_width_mm: 25,
    logo_height_mm: 10,
    logo_fit: 'contain',

    show_qr: true,
    qr_position: 'top_right',
    qr_size_px: 100,

    font_family: 'helvetica',
    font_size_title: 12,
    font_size_content: 10,

    margin_top: 5,
    margin_bottom: 5,
    margin_left: 5,
    margin_right: 5,

    show_service_label: true,
    show_freight_badge: true,
    freight_badge_position: 'service_block',
    freight_badge_variant: 'outline',

    theme_preset: 'classic',
    primary_color: '#16a34a',
    show_border: true,
    border_width_pt: 1,
    header_band: true,
    header_band_height_mm: 14
}
