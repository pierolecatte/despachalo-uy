import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Genera un código de tracking único para envíos.
 * Formato: DUY-XXXXXXXX (8 caracteres alfanuméricos)
 */
export function generateTrackingCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'DUY-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Formatea una fecha a formato uruguayo (dd/mm/yyyy HH:mm)
 */
export function formatDateUY(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formatea un precio en pesos uruguayos
 */
export function formatPriceUYU(amount: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Traduce el estado del envío a español legible
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    levantado: 'Levantado',
    despachado: 'Despachado',
    en_transito: 'En tránsito',
    entregado: 'Entregado',
    con_problema: 'Con problema',
  }
  return labels[status] || status
}

/**
 * Devuelve el color asociado a cada estado del envío (para badges/chips)
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pendiente: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    levantado: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    despachado: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    en_transito: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    entregado: 'bg-green-500/10 text-green-400 border-green-500/20',
    con_problema: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return colors[status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

/**
 * Traduce el rol de usuario a español legible
 */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: 'Super Administrador',
    org_admin: 'Administrador',
    operador: 'Operador',
    cadete: 'Cadete',
  }
  return labels[role] || role
}

/**
 * Traduce el tipo de organización a español legible
 */
export function getOrgTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    remitente: 'Remitente',
    cadeteria: 'Cadetería',
    agencia: 'Agencia',
    admin: 'Administración',
  }
  return labels[type] || type
}

/**
 * Determina si se debe mostrar la descripción como "línea inferior de bultos" en las etiquetas.
 * Oculta la leyenda (ej: "1 de 1 Bulto") si la etiqueta ya tiene numeración superior de paquetes
 * (packageCount > 1) o si el servicio es Despacho Agencia.
 */
export function shouldShowBultoFooterLine(
  description: string | null | undefined,
  packageCount: number,
  isDespachoAgencia: boolean
): boolean {
  if (!description) return false

  // Verificamos si la descripción es textualmente "X de Y Bultos", "X Bultos", etc.
  const isBultoText = /^(\d+\s*de\s*\d+|\d+)\s*bultos?$/i.test(description.trim())

  if (isBultoText) {
    if (packageCount > 1) return false
    if (isDespachoAgencia) return false
  }

  return true
}
