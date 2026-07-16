import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString))
}

// פייפליין ההזמנה: לברר -> מעוניין / מתלבט -> נמדד -> הצעת מחיר -> הזמין -> בוטל
export const STATUS_LABELS: Record<string, string> = {
  lead: 'לברר',
  interested: 'מעוניין',
  considering: 'מתלבט',
  measured: 'נמדד',
  quoted: 'הצעת מחיר',
  ordered: 'הזמין',
  cancelled: 'בוטל',
}

// סדר הצגה לפייפליין (לתפריטים ולמסכי סקירה)
export const STATUS_ORDER = [
  'lead', 'interested', 'considering', 'measured', 'quoted', 'ordered', 'cancelled',
] as const

export const STATUS_COLORS: Record<string, string> = {
  lead: 'info',
  interested: 'secondary',
  considering: 'warning',
  measured: 'info',
  quoted: 'warning',
  ordered: 'success',
  cancelled: 'destructive',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_paid: 'לא שילם',
  advance: 'מקדמה',
  paid_full: 'שילם הכל',
}

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  not_paid: 'destructive',
  advance: 'warning',
  paid_full: 'success',
}
