import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { type LabelConfig, DEFAULT_LABEL_CONFIG } from '@/types/label-config'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ShipmentRow {
    id: string
    tracking_code: string
    package_size: string
    package_count: number
    description: string | null
    weight_kg: number | null
    shipping_cost: number | null
    recipient_name: string
    recipient_phone: string
    recipient_address: string
    recipient_city: string | null
    recipient_department: string | null

    // New fields for logic
    delivery_type: 'domicilio' | 'sucursal'
    is_freight_paid: boolean

    agencia_org_id: string | null
    cadeteria_org_id: string | null

    // Relations
    remitente_org_id: string
    remitente?: { name: string; phone: string | null; address: string | null; logo_url: string | null } | null

    // Joined standard tables
    cadeteria?: { name: string } | null
    agency?: { name: string } | null
    service_types?: { name: string } | null
}

interface PackageRow {
    id: string
    shipment_id: string
    index: number
    size: string
    weight_kg: number | null
    shipping_cost: number | null
    content_description: string | null
    qr_token: string
    fragile: boolean
}

// Helpers
async function fetchImageAndConvertBase64(url: string | null): Promise<{ data: string; format: string } | null> {
    if (!url) return null
    try {
        const res = await fetch(url, { cache: 'force-cache' })
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`)

        const arrayBuffer = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const base64 = buffer.toString('base64')
        const contentType = res.headers.get('content-type') || 'image/png'
        const format = contentType.includes('jpeg') || contentType.includes('jpg') ? 'JPEG' : 'PNG'

        return { data: base64, format }
    } catch (e) {
        console.warn('Failed to load logo image:', e)
        return null
    }
}

function getContrastColor(hexColor: string) {
    const r = parseInt(hexColor.substr(1, 2), 16)
    const g = parseInt(hexColor.substr(3, 2), 16)
    const b = parseInt(hexColor.substr(5, 2), 16)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
    return (yiq >= 128) ? '#000000' : '#ffffff'
}

// Strip emojis and non-latin chars that jsPDF might fail on (basic ASCII + Latin-1 Supplement)
function cleanText(text: string | null | undefined): string {
    if (!text) return ''
    // eslint-disable-next-line no-control-regex
    return text.replace(/[^\x00-\x7F\xA0-\xFF]/g, '').trim()
}

export async function POST(req: NextRequest) {
    try {
        const { shipment_ids } = await req.json()

        if (!Array.isArray(shipment_ids) || shipment_ids.length === 0) {
            return NextResponse.json({ error: 'Se requiere al menos un envío' }, { status: 400 })
        }

        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll() { /* read-only */ },
                },
            }
        )

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        // 1. Fetch shipments with CORRECT joins
        const { data: shipments, error: shipErr } = await supabase
            .from('shipments')
            .select(`
                id, tracking_code, package_size, package_count, description,
                weight_kg, shipping_cost,
                recipient_name, recipient_phone, recipient_address,
                recipient_city, recipient_department,
                delivery_type, is_freight_paid,
                agencia_org_id, cadeteria_org_id,
                remitente_org_id,
                remitente:remitente_org_id(name, phone, address, logo_url),
                cadeteria:cadeteria_org_id(name),
                agency:agencia_org_id(name),
                service_types(name)
            `)
            .in('id', shipment_ids)

        if (shipErr || !shipments || shipments.length === 0) {
            return NextResponse.json({ error: 'No se encontraron envíos' }, { status: 404 })
        }

        // 2. Fetch packages
        const { data: allPackages } = await supabase
            .from('shipment_packages')
            .select('id, shipment_id, index, size, weight_kg, shipping_cost, content_description, qr_token, fragile')
            .in('shipment_id', shipment_ids)
            .order('index', { ascending: true })

        const packagesByShipment: Record<string, PackageRow[]> = {}
        if (allPackages) {
            for (const pkg of allPackages) {
                if (!packagesByShipment[pkg.shipment_id]) packagesByShipment[pkg.shipment_id] = []
                packagesByShipment[pkg.shipment_id].push(pkg as PackageRow)
            }
        }

        // 3. Prepare Configs Cache (Per Remitente)
        // Collect unique remitente IDs
        const uniqueRemitentes = Array.from(new Set(shipments.map(s => s.remitente_org_id)))

        // Fetch ALL profiles for these remitentes (ordered by is_default desc so default comes first)
        const { data: profiles } = await supabase
            .from('label_profiles')
            .select('id, org_id, is_default')
            .in('org_id', uniqueRemitentes)
            .order('is_default', { ascending: false })

        // Make map remitenteId -> profileId
        const profileByRemitente: Record<string, string> = {}
        const profileIds: string[] = []
        if (profiles) {
            profiles.forEach(p => {
                // Since we sorted by is_default DESC, the first one we see for an org
                // is either the default one, or the "first available" if no default exists.
                if (p.org_id && !profileByRemitente[p.org_id]) {
                    profileByRemitente[p.org_id] = p.id
                    profileIds.push(p.id)
                }
            })
        }

        // Fetch Global Default as fallback
        const { data: globalDefault } = await supabase
            .from('label_profiles')
            .select('id')
            .eq('is_default', true)
            .is('org_id', null)
            .single()

        const globalDefaultId = globalDefault?.id

        // Fetch configs for all relevant profiles (remitente defaults + global)
        const allProfileIdsToFetch = [...profileIds]
        if (globalDefaultId) allProfileIdsToFetch.push(globalDefaultId)

        let configsByProfileId: Record<string, Record<string, LabelConfig>> = {}

        if (allProfileIdsToFetch.length > 0) {
            const { data: configRows } = await supabase
                .from('label_configs')
                .select('*')
                .in('profile_id', allProfileIdsToFetch)

            if (configRows) {
                configRows.forEach((row: any) => {
                    if (!configsByProfileId[row.profile_id]) configsByProfileId[row.profile_id] = {}
                    configsByProfileId[row.profile_id][row.size] = { ...DEFAULT_LABEL_CONFIG, ...row }
                })
            }
        }

        // Helper to get config for a shipment + size
        function getConfigForShipmentAndSize(shipment: ShipmentRow, size: string): LabelConfig {
            let profileId = profileByRemitente[shipment.remitente_org_id] || globalDefaultId
            if (!profileId) return DEFAULT_LABEL_CONFIG // Should not happen ideally

            const profileConfigs = configsByProfileId[profileId] || {}
            return profileConfigs[size] || profileConfigs['mediano'] || DEFAULT_LABEL_CONFIG
        }

        // 4. Pre-load Logos (Per Remitente)
        // Map remitente_org_id -> logo data
        const logosByRemitente: Record<string, { data: string; format: string }> = {}

        // Parallel fetch for logos
        await Promise.all(uniqueRemitentes.map(async (remitenteId) => {
            // Find a shipment for this remitente to get the URL
            const ship = shipments.find(s => s.remitente_org_id === remitenteId)
            if (ship?.remitente?.logo_url) {
                const logo = await fetchImageAndConvertBase64(ship.remitente.logo_url)
                if (logo) {
                    logosByRemitente[remitenteId] = logo
                }
            }
        }))

        // 5. Build PDF (Dynamic Pages)
        interface PageTask {
            shipment: ShipmentRow
            pkg: PackageRow | null
            pkgIndex: number
            total: number
            config: LabelConfig
        }

        const tasks: PageTask[] = []

        for (const rawShip of shipments) {
            const ship = rawShip as any as ShipmentRow
            const pkgs = packagesByShipment[ship.id] || []

            if (pkgs.length > 0) {
                for (const pkg of pkgs) {
                    const size = pkg.size || ship.package_size || 'mediano'
                    const cfg = getConfigForShipmentAndSize(ship, size)
                    tasks.push({ shipment: ship, pkg, pkgIndex: pkg.index, total: pkgs.length, config: cfg })
                }
            } else {
                // Fallback 1 package logic
                const size = ship.package_size || 'mediano'
                const cfg = getConfigForShipmentAndSize(ship, size)
                tasks.push({ shipment: ship, pkg: null, pkgIndex: 1, total: 1, config: cfg })
            }
        }

        if (tasks.length === 0) return NextResponse.json({ error: 'No hay etiquetas para generar' }, { status: 400 })

        // Initialize PDF with first task's dimension
        const firstTask = tasks[0]
        const doc = new jsPDF({
            orientation: firstTask.config.width_mm > firstTask.config.height_mm ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [firstTask.config.width_mm, firstTask.config.height_mm],
        })

        const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://despachalo.uy'

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
            const cfg = task.config
            const ship = task.shipment
            const pkg = task.pkg

            // Get correct logo for this shipment
            const logoData = logosByRemitente[ship.remitente_org_id]

            if (i > 0) {
                doc.addPage(
                    [cfg.width_mm, cfg.height_mm],
                    cfg.width_mm > cfg.height_mm ? 'landscape' : 'portrait'
                )
            }

            // Render Task
            const ml = cfg.margin_left
            const mt = cfg.margin_top
            const contentW = cfg.width_mm - ml - cfg.margin_right
            const font = cfg.font_family || 'helvetica'
            doc.setFont(font)

            // -- Visuals --
            const primaryColor = cfg.primary_color || '#16a34a'
            const headerHeight = cfg.header_band ? cfg.header_band_height_mm : 0

            // Border
            if (cfg.show_border) {
                doc.setDrawColor(0)
                doc.setLineWidth(cfg.border_width_pt * 0.3528)
                doc.rect(0, 0, cfg.width_mm, cfg.height_mm)
            }

            let y = mt

            // Header Band
            if (cfg.header_band) {
                doc.setFillColor(primaryColor)
                doc.rect(0, 0, cfg.width_mm, headerHeight, 'F')
                if (cfg.show_border) {
                    doc.setDrawColor(0)
                    doc.line(0, headerHeight, cfg.width_mm, headerHeight)
                }

                // Fragile Banner
                if (pkg?.fragile) {
                    const contrastColor = getContrastColor(primaryColor)
                    doc.setTextColor(contrastColor)
                    doc.setFontSize(cfg.font_size_title * 1.5)
                    doc.setFont(font, 'bold')
                    // Increased spacing: '2px' logic from preview approximated by tracking/kerning if possible, 
                    // jsPDF doesn't support letter-spacing easily without plugin, so we just print bold.
                    doc.text('FRÁGIL', cfg.width_mm / 2, headerHeight / 2 + 2, { align: 'center' })
                    doc.setFont(font, 'normal')
                }

                doc.setTextColor(0)
                y = headerHeight + mt
            }

            // Logo & Tracking (Top Section)
            const topY = y
            doc.setFontSize(cfg.font_size_title)
            doc.setFont(font, 'bold')

            // Logo
            if (cfg.show_logo && logoData && cfg.show_logo && cfg.logo_position.startsWith('top')) {
                let lx = ml
                if (cfg.logo_position === 'top_right') lx = cfg.width_mm - cfg.margin_right - cfg.logo_width_mm
                // Center logic if needed, but usually top_left/right

                doc.addImage(logoData.data, logoData.format, lx, topY, cfg.logo_width_mm, cfg.logo_height_mm)
            }

            // Tracking Text
            const trackingY = cfg.header_band ? y + 5 : y + 6
            doc.text(ship.tracking_code || 'SIN CÓDIGO', cfg.width_mm / 2, trackingY, { align: 'center' })

            // Package X of Y
            if (task.total > 1) {
                doc.setFontSize(cfg.font_size_title * 0.75)
                doc.text(`Paquete ${task.pkgIndex} de ${task.total}`, cfg.width_mm / 2, trackingY + 5, { align: 'center' })
            }

            // Fragile Badge (if NO header band)
            if (!cfg.header_band && pkg?.fragile) {
                doc.setFontSize(cfg.font_size_title)
                doc.setTextColor(220, 38, 38) // Red-600
                doc.setFont(font, 'bold')
                doc.text('FRÁGIL', cfg.width_mm / 2, trackingY + 10, { align: 'center' })
                doc.setTextColor(0)
            }

            // Move Y down
            y += (cfg.show_logo && cfg.logo_position.startsWith('top')) ? Math.max(cfg.logo_height_mm, 15) : 15

            // Divider
            doc.setDrawColor(200)
            doc.setLineWidth(0.1)
            doc.line(ml, y, ml + contentW, y)
            y += 4

            // Cleaned Strings
            const senderName = cleanText(ship.remitente?.name || 'Remitente')
            const senderAddr = cleanText(ship.remitente?.address)
            const senderPhone = cleanText(ship.remitente?.phone)

            const recipName = cleanText(ship.recipient_name)
            const recipAddr = cleanText(ship.recipient_address)
            const recipPhone = cleanText(ship.recipient_phone)
            const recipCity = cleanText(ship.recipient_city || ship.recipient_department)

            const agencyName = cleanText(ship.agency?.name)
            const cadeteriaName = cleanText(ship.cadeteria?.name)
            const serviceName = cleanText(ship.service_types?.name)

            // Service & Freight line
            if (cfg.show_service_label || cfg.show_freight_badge) {
                const serviceY = y
                if (cfg.show_service_label) {
                    let label = ''
                    if (serviceName) {
                        label = serviceName.toUpperCase()
                    } else if (ship.delivery_type === 'domicilio') {
                        label = 'ENTREGA A DOMICILIO'
                    } else {
                        label = ship.agencia_org_id ? 'DESPACHO AGENCIA' : 'RETIRA EN SUCURSAL'
                    }
                    // Strip emojis just in case
                    label = cleanText(label)

                    doc.setFontSize(cfg.font_size_title * 0.8)
                    doc.setFont(font, 'bold')
                    // No emoji icon in PDF to avoid encoding issues
                    doc.text(label, ml, serviceY + 3)
                }

                // Freight Paid Badge (Inline)
                if (cfg.show_freight_badge && ship.is_freight_paid && cfg.freight_badge_position === 'service_block') {
                    const badgeText = 'FLETE PAGO'
                    const badgeW = doc.getTextWidth(badgeText) + 6
                    const badgeH = 5
                    const badgeX = cfg.width_mm - cfg.margin_right - badgeW

                    if (cfg.freight_badge_variant === 'filled') {
                        doc.setFillColor(primaryColor)
                        doc.roundedRect(badgeX, serviceY - 1, badgeW, badgeH, 1, 1, 'F')
                        doc.setTextColor(getContrastColor(primaryColor))
                    } else {
                        doc.setDrawColor(primaryColor)
                        doc.setLineWidth(0.4)
                        doc.roundedRect(badgeX, serviceY - 1, badgeW, badgeH, 1, 1, 'S')
                        doc.setTextColor(primaryColor)
                    }
                    doc.setFontSize(cfg.font_size_content * 0.9)
                    doc.text(badgeText, badgeX + 3, serviceY + 2.5)
                    doc.setTextColor(0)
                }

                y += 8
                doc.setDrawColor(200)
                doc.line(ml, y, ml + contentW, y)
                y += 4
            }

            // Sender
            if (cfg.show_sender_name) {
                doc.setFontSize(cfg.font_size_title * 0.7)
                doc.setFont(font, 'bold')
                doc.setTextColor(100)
                doc.text('REMITENTE:', ml, y + 2)
                y += 5

                doc.setTextColor(0)
                doc.setFont(font, 'normal')
                doc.setFontSize(cfg.font_size_content)

                if (cfg.show_sender_name) { doc.text(senderName, ml, y + 2); y += 4 }
                if (cfg.show_sender_address && senderAddr) { doc.text(senderAddr, ml, y + 2); y += 4 }
                if (cfg.show_sender_phone && senderPhone) { doc.text(senderPhone, ml, y + 2); y += 4 }

                y += 2
                doc.setDrawColor(220)
                doc.line(ml, y, ml + contentW, y)
                y += 4
            }

            // Recipient
            doc.setFontSize(cfg.font_size_title * 0.7)
            doc.setFont(font, 'bold')
            doc.setTextColor(100)
            doc.text('DESTINATARIO:', ml, y + 2)
            y += 5

            doc.setTextColor(0)
            doc.setFontSize(cfg.font_size_content * 1.1)
            doc.setFont(font, cfg.theme_preset === 'bold' ? 'bold' : 'normal')

            if (cfg.show_recipient_name) { doc.text(recipName, ml, y + 2); y += 4.5 }

            if (cfg.show_recipient_address && recipAddr) {
                doc.setFont(font, 'normal')
                const lines = doc.splitTextToSize(recipAddr, contentW)
                doc.text(lines, ml, y + 2)
                y += lines.length * 4.5
            }

            if (cfg.show_recipient_phone && recipPhone) {
                doc.text('Tel: ' + recipPhone, ml, y + 2); y += 4.5
            }

            if (cfg.show_recipient_city && recipCity) {
                doc.setFont(font, 'bold')
                doc.text(recipCity.toUpperCase(), ml, y + 2); y += 4.5
            }

            // Footer / Bottom info
            // Calculate absolute bottom printable area
            const bottomInfoY = cfg.height_mm - cfg.margin_bottom - (cfg.logo_position.startsWith('bottom') ? cfg.logo_height_mm + 5 : 0) - 15

            doc.setFontSize(cfg.font_size_content * 0.8)
            doc.setFont(font, 'normal')
            doc.setTextColor(80)

            let fy = bottomInfoY

            if (cfg.show_cadeteria && cadeteriaName) {
                doc.text(`Cadetería: ${cadeteriaName}`, ml, fy); fy += 4
            }
            if (cfg.show_agencia && agencyName) {
                doc.text(`Agencia: ${agencyName}`, ml, fy); fy += 4
            }
            if (cfg.show_description) {
                const desc = cleanText(pkg?.content_description || ship.description)
                if (desc) {
                    const lines = doc.splitTextToSize(desc, contentW)
                    doc.text(lines, ml, fy)
                }
            }

            // Floating elements

            // Bottom Logo
            if (cfg.show_logo && logoData && cfg.logo_position.startsWith('bottom')) {
                let lx = ml
                const ly = cfg.height_mm - cfg.margin_bottom - cfg.logo_height_mm

                if (cfg.logo_position === 'bottom_right') lx = cfg.width_mm - cfg.margin_right - cfg.logo_width_mm
                if (cfg.logo_position === 'bottom_center') lx = (cfg.width_mm - cfg.logo_width_mm) / 2

                doc.addImage(logoData.data, logoData.format, lx, ly, cfg.logo_width_mm, cfg.logo_height_mm)
            }

            // Floating Freight Badge
            if (cfg.show_freight_badge && ship.is_freight_paid && cfg.freight_badge_position !== 'service_block') {
                const badgeText = 'FLETE PAGO'
                const badgeW = doc.getTextWidth(badgeText) + 6
                const badgeH = 5

                let bx = cfg.width_mm - cfg.margin_right - badgeW
                let by = cfg.height_mm - cfg.margin_bottom - badgeH

                if (cfg.freight_badge_position === 'top') {
                    by = (cfg.header_band ? headerHeight : 0) + cfg.margin_top + 2
                }

                if (cfg.freight_badge_variant === 'filled') {
                    doc.setFillColor(primaryColor)
                    doc.roundedRect(bx, by, badgeW, badgeH, 1, 1, 'F')
                    doc.setTextColor(getContrastColor(primaryColor))
                } else {
                    doc.setDrawColor(primaryColor)
                    doc.setFillColor(255, 255, 255)
                    doc.roundedRect(bx, by, badgeW, badgeH, 1, 1, 'DF')
                    doc.setTextColor(primaryColor)
                }

                doc.setFontSize(cfg.font_size_content)
                doc.setFont(font, 'bold')
                doc.text(badgeText, bx + 3, by + 3.5)
                doc.setTextColor(0)
            }

            // QR Code
            if (cfg.show_qr) {
                const qrS = cfg.qr_size_px * 0.25
                let qx = cfg.width_mm - cfg.margin_right - qrS
                let qy = cfg.margin_top

                if (cfg.qr_position === 'top_left') { qx = cfg.margin_left; qy = cfg.margin_top }
                if (cfg.qr_position === 'bottom_left') { qx = cfg.margin_left; qy = cfg.height_mm - cfg.margin_bottom - qrS }
                if (cfg.qr_position === 'bottom_right') { qx = cfg.width_mm - cfg.margin_right - qrS; qy = cfg.height_mm - cfg.margin_bottom - qrS }
                if (cfg.qr_position === 'bottom_center') { qx = (cfg.width_mm - qrS) / 2; qy = cfg.height_mm - cfg.margin_bottom - qrS }

                const qrContent = pkg?.qr_token
                    ? `${origin}/tracking?code=${ship.tracking_code}&pkg=${pkg.qr_token}`
                    : `${origin}/tracking?code=${ship.tracking_code}`

                const qrDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', margin: 0 })
                doc.addImage(qrDataUrl, 'PNG', qx, qy, qrS, qrS)
            }
        }

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="etiquetas_${Date.now()}.pdf"`,
            },
        })

    } catch (err: any) {
        console.error('Label generation error:', err)
        return NextResponse.json({ error: 'Error al generar etiquetas', debug: err.message }, { status: 500 })
    }
}
