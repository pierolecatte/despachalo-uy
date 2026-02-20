'use client'

/* eslint-disable @next/next/no-img-element */
import { type LabelConfig } from '@/types/label-config'
import { useState } from 'react'

interface LabelPreviewProps {
    config: LabelConfig
    logoUrl?: string | null
    orgName?: string
    isFragile?: boolean
}

// Helper to determine text color based on background luminance
function getContrastColor(hexColor: string) {
    // Convert hex to rgb
    const r = parseInt(hexColor.substr(1, 2), 16)
    const g = parseInt(hexColor.substr(3, 2), 16)
    const b = parseInt(hexColor.substr(5, 2), 16)

    // Calculate luminance
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
    return (yiq >= 128) ? '#000000' : '#ffffff'
}

export default function LabelPreview({ config, logoUrl, orgName, isFragile = false }: LabelPreviewProps) {
    const scale = 3 // px per mm for preview (approx 72-96 dpi)
    const w = config.width_mm * scale
    const h = config.height_mm * scale

    const fontMap: Record<string, string> = {
        helvetica: 'Arial, Helvetica, sans-serif',
        times: 'Times New Roman, serif',
        courier: 'Courier New, monospace',
    }
    const fontFamily = fontMap[config.font_family] || fontMap.helvetica
    const primaryColor = config.primary_color || '#16a34a'
    const headerTextColor = config.header_band ? getContrastColor(primaryColor) : (config.theme_preset === 'minimal' ? '#000' : primaryColor)

    // QR box position
    const qrSize = config.qr_size_px * 0.8 // scale down slightly for visual fit in preview scaling
    const qrStyle: React.CSSProperties = {
        position: 'absolute',
        width: qrSize,
        height: qrSize,
        border: '2px dashed #ccc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: '#888',
        borderRadius: 4,
        background: '#fff',
        zIndex: 20
    }

    switch (config.qr_position) {
        case 'top_left':
            qrStyle.top = config.margin_top * scale
            qrStyle.left = config.margin_left * scale
            break
        case 'top_right':
            qrStyle.top = config.margin_top * scale
            qrStyle.right = config.margin_right * scale
            break
        case 'bottom_left':
            qrStyle.bottom = config.margin_bottom * scale
            qrStyle.left = config.margin_left * scale
            break
        case 'bottom_right':
            qrStyle.bottom = config.margin_bottom * scale
            qrStyle.right = config.margin_right * scale
            break
        case 'bottom_center':
            qrStyle.bottom = config.margin_bottom * scale
            qrStyle.left = '50%'
            qrStyle.transform = 'translateX(-50%)'
            break
    }

    // Logo style
    const logoW = config.logo_width_mm * scale
    const logoH = config.logo_height_mm * scale

    // Service Badge Style
    const badgeBg = config.freight_badge_variant === 'filled' ? primaryColor : 'transparent'
    const badgeColor = config.freight_badge_variant === 'filled' ? getContrastColor(primaryColor) : primaryColor
    const badgeBorder = config.freight_badge_variant === 'outline' ? `2px solid ${primaryColor}` : 'none'

    return (
        <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-zinc-500">
                {config.width_mm}mm × {config.height_mm}mm
            </p>
            <div
                style={{
                    width: w,
                    height: h,
                    position: 'relative',
                    border: config.show_border ? `${config.border_width_pt}px solid #000` : '1px solid #e5e5e5',
                    borderRadius: 0,
                    background: '#fff',
                    color: '#222',
                    fontFamily,
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
            >
                {/* Header Band */}
                {config.header_band && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: config.header_band_height_mm * scale,
                        backgroundColor: primaryColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderBottom: config.show_border ? '1px solid #000' : 'none'
                    }}>
                        {/* Fragile Banner - Replaces URGENTE */}
                        {/* We need a prop for fragile, but preview is generic config. 
                            We can mock it or add it to props. For now, let's assume this preview
                            component controls the config visual. 
                            The user said: "Si package.fragile === true". 
                            Since this is a config preview, we might not have a specific package.
                            
                            However, the "URGENTE" was hardcoded. 
                            New logic: 
                            If we want to preview "Fragile", we might need a dummy toggle or just show nothing text-wise
                            unless we want to simulate a fragile package.
                            
                            WAIT: The prompt says "Si package.fragile = true -> mostrar banda".
                            But LabelPreview is used in the config page where there is no package.
                            
                            Ill remove the text "URGENTE". 
                            Ill add a COMMENT or handle a prop if I can.
                            
                            Let's update props to include `isFragile` optional, for real implementation usage.
                        */}
                    </div>
                )}

                {/* Content area */}
                <div
                    style={{
                        position: 'absolute',
                        top: (config.margin_top * scale) + (config.header_band ? (config.header_band_height_mm * scale) : 0),
                        left: config.margin_left * scale,
                        right: config.margin_right * scale,
                        bottom: config.margin_bottom * scale,
                    }}
                >
                    {/* Header: Logo & Tracking */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' }}>
                        {config.show_logo && (config.logo_position || 'top_left').startsWith('top') && logoUrl && (
                            <div style={{
                                width: logoW,
                                height: logoH,
                                position: 'relative',
                                order: config.logo_position === 'top_right' ? 2 : 0
                            }}>
                                <img
                                    src={logoUrl}
                                    alt="Logo"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: config.logo_fit || 'contain',
                                        objectPosition: config.logo_position === 'top_right' ? 'right top' : 'left top'
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ flex: 1, textAlign: 'center' }}>
                            {(!config.header_band && isFragile) && (
                                <div style={{
                                    fontSize: config.font_size_title * 1.2,
                                    fontWeight: 'bold',
                                    color: '#dc2626', // Red for emphasis
                                    border: '2px solid #dc2626',
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    marginBottom: 4
                                }}>
                                    FRÁGIL
                                </div>
                            )}
                            <div style={{ fontSize: config.font_size_title * 0.9, fontWeight: 'bold', color: '#444' }}>DES-20250210-001</div>
                        </div>
                    </div>

                    {/* Service & Freight Badges */}
                    {(config.show_service_label || config.show_freight_badge) && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                            borderBottom: '2px solid #eee',
                            paddingBottom: 6
                        }}>
                            {config.show_service_label && (
                                <div style={{ fontSize: config.font_size_title * 0.8, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    📦 Despacho Agencia
                                </div>
                            )}

                            {config.show_freight_badge && config.freight_badge_position === 'service_block' && (
                                <div style={{
                                    border: badgeBorder,
                                    backgroundColor: badgeBg,
                                    color: badgeColor,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: config.font_size_content * 0.9,
                                    fontWeight: 'bold'
                                }}>
                                    FLETE PAGO
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sender section */}
                    {(config.show_sender_name || config.show_sender_address || config.show_sender_phone) && (
                        <div style={{ marginBottom: 6, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                            <div style={{ fontSize: config.font_size_title * 0.7, fontWeight: 'bold', color: '#666', marginBottom: 2 }}>
                                REMITENTE:
                            </div>
                            <div style={{ fontSize: config.font_size_content, lineHeight: 1.3 }}>
                                {config.show_sender_name && <div>{orgName || 'Nombre Remitente'}</div>}
                                {config.show_sender_address && <div>Av. 18 de Julio 1234</div>}
                                {config.show_sender_phone && <div>Tel: 099 123 456</div>}
                            </div>
                        </div>
                    )}

                    {/* Recipient section */}
                    {(config.show_recipient_name || config.show_recipient_address || config.show_recipient_phone || config.show_recipient_city) && (
                        <div style={{ marginBottom: 6, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                            <div style={{ fontSize: config.font_size_title * 0.7, fontWeight: 'bold', color: '#666', marginBottom: 2 }}>
                                DESTINATARIO:
                            </div>
                            <div style={{ fontSize: config.font_size_content * 1.1, lineHeight: 1.3, fontWeight: config.theme_preset === 'bold' ? 'bold' : 'normal' }}>
                                {config.show_recipient_name && <div>Juan Pérez</div>}
                                {config.show_recipient_address && <div>Calle Sarandí 456, Apto 301</div>}
                                {config.show_recipient_phone && <div>Tel: 098 765 432</div>}
                                {config.show_recipient_city && <div style={{ marginTop: 2, fontWeight: 'bold' }}>MONTEVIDEO</div>}
                            </div>
                        </div>
                    )}

                    {/* Footer Info */}
                    <div style={{ fontSize: config.font_size_content * 0.8, color: '#666', marginTop: 4 }}>
                        {config.show_cadeteria && <div>Cadetería: <b>Flash Express</b></div>}
                        {config.show_agencia && <div>Agencia: <b>DAC</b></div>}
                        {config.show_description && <div style={{ marginTop: 2 }}>Caja con documentos confidenciales</div>}
                    </div>
                </div>

                {/* Absolute Positioned Elements */}

                {/* Freight Badge (if not in service block) */}
                {config.show_freight_badge && config.freight_badge_position !== 'service_block' && (
                    <div style={{
                        position: 'absolute',
                        ...(config.freight_badge_position === 'top'
                            ? { top: (config.header_band ? 45 : 10), right: 10 }
                            : { bottom: 10, right: 10 }),
                        border: badgeBorder,
                        backgroundColor: badgeBg,
                        color: badgeColor,
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: config.font_size_content,
                        fontWeight: 'bold',
                        zIndex: 10
                    }}>
                        FLETE PAGO
                    </div>
                )}

                {/* Logo (if bottom) */}
                {config.show_logo && (config.logo_position || 'top_left').startsWith('bottom') && logoUrl && (
                    <div style={{
                        position: 'absolute',
                        bottom: config.margin_bottom * scale,
                        left: config.logo_position === 'bottom_left' ? config.margin_left * scale :
                            config.logo_position === 'bottom_center' ? '50%' : 'auto',
                        right: config.logo_position === 'bottom_right' ? config.margin_right * scale : 'auto',
                        transform: config.logo_position === 'bottom_center' ? 'translateX(-50%)' : 'none',
                        width: logoW,
                        height: logoH,
                        zIndex: 10
                    }}>
                        <img
                            src={logoUrl}
                            alt="Logo"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: config.logo_fit,
                                objectPosition: 'center bottom'
                            }}
                        />
                    </div>
                )}

                {/* QR placeholder */}
                {config.show_qr && (
                    <div style={qrStyle}>
                        <div style={{ textAlign: 'center', lineHeight: 1 }}>
                            QR<br /><span style={{ fontSize: 8 }}>{config.qr_size_px}px</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
