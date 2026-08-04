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

// פייפליין ההזמנה: לברר -> לא עונה / ישלח מייל -> מעוניין / מתלבט -> תיאום מדידות -> נמדד -> הצעת מחיר -> הזמין -> תיאום הספקה -> בוצע -> בוטל
export const STATUS_LABELS: Record<string, string> = {
  lead: 'לברר',
  no_answer: 'לא עונה',
  will_email: 'ישלח מייל',
  interested: 'מעוניין',
  considering: 'מתלבט',
  measurement_scheduled: 'תיאום מדידות',
  measured: 'נמדד',
  quoted: 'הצעת מחיר',
  ordered: 'הזמין',
  delivery_scheduled: 'תיאום הספקה',
  done: 'בוצע',
  cancelled: 'בוטל',
}

// סדר הצגה לפייפליין (לתפריטים ולמסכי סקירה)
export const STATUS_ORDER = [
  'lead', 'no_answer', 'will_email', 'interested', 'considering',
  'measurement_scheduled', 'measured', 'quoted', 'ordered',
  'delivery_scheduled', 'done', 'cancelled',
] as const

export const STATUS_COLORS: Record<string, string> = {
  lead: 'info',
  no_answer: 'destructive',
  will_email: 'secondary',
  interested: 'secondary',
  considering: 'warning',
  measurement_scheduled: 'info',
  measured: 'info',
  quoted: 'warning',
  ordered: 'success',
  delivery_scheduled: 'info',
  done: 'success',
  cancelled: 'destructive',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_paid: 'לא שילם',
  advance: 'מקדמה',
  partial: 'תשלום חלקי',
  paid_full: 'שילם הכל',
}

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  not_paid: 'destructive',
  advance: 'warning',
  partial: 'info',
  paid_full: 'success',
}

// סטטוס תשלום חוב (ספק לנו / נציג) - מחושב, לא נשמר במסד הנתונים
export type DebtStatus = 'not_paid' | 'partial' | 'paid_full'

export function getDebtStatus(owed: number, paid: number): DebtStatus {
  if (owed <= 0) return 'not_paid'
  if (paid >= owed) return 'paid_full'
  if (paid > 0) return 'partial'
  return 'not_paid'
}

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  not_paid: 'לא שילם',
  partial: 'שילם חלקית',
  paid_full: 'שילם הכל',
}

export const DEBT_STATUS_COLORS: Record<DebtStatus, string> = {
  not_paid: 'destructive',
  partial: 'warning',
  paid_full: 'success',
}
