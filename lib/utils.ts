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

export const STATUS_LABELS: Record<string, string> = {
  contact: 'ליצור קשר',
  considering: 'מתלבט',
  interested: 'מעוניין',
  ordered: 'הזמין',
}

export const STATUS_COLORS: Record<string, string> = {
  contact: 'info',
  considering: 'warning',
  interested: 'secondary',
  ordered: 'success',
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
