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

// מחיר ספק מחושב ממחיר לקוח לפי אחוז רווח (ברירת מחדל 10%): מחיר לקוח 100 + רווח 10% => מחיר ספק 90
export function calcSupplierPrice(customerPrice: number, profitPercent: number): number {
  return Math.round(customerPrice * (1 - profitPercent / 100) * 100) / 100
}

// אחוז הרווח ברירת המחדל לפי הקטגוריה: השלמת מטבחים 15%, שאר הקטגוריות 10%
export function defaultProfitPercent(categoryName?: string | null): string {
  return categoryName && categoryName.includes('השלמת מטבח') ? '15' : '10'
}

// כלל רווח לקטגוריה (מוגדר במסך קטגוריות): אחוז מהמחיר, או סכום קבוע ליחידה
// (למשל רשתות 20 ₪ לחלון, וילונות 35 ₪ למטר). בלי הגדרה — ברירת המחדל הישנה לפי השם.
export type ProfitType = 'percent' | 'per_unit'
export type ProfitRule = { type: ProfitType; value: number; unit: string }
export type CategoryProfitFields = {
  name?: string | null
  profit_type?: string | null
  profit_value?: number | string | null
  unit_label?: string | null
}

export function profitRuleFor(cat?: CategoryProfitFields | null): ProfitRule {
  const value = cat?.profit_value != null && cat.profit_value !== '' ? Number(cat.profit_value) : NaN
  if (cat?.profit_type === 'per_unit' && !Number.isNaN(value)) {
    return { type: 'per_unit', value, unit: cat.unit_label || 'יחידה' }
  }
  if (!Number.isNaN(value)) return { type: 'percent', value, unit: '' }
  return { type: 'percent', value: parseFloat(defaultProfitPercent(cat?.name)), unit: '' }
}

// מחיר ספק לפי הכלל. customer = מחיר לקוח של השורה; qty = כמה יחידות בשורה (לסכום ליחידה)
export function calcSupplierByRule(customer: number, value: number, type: ProfitType, qty = 1): number {
  if (type === 'per_unit') return Math.round((customer - value * qty) * 100) / 100
  return calcSupplierPrice(customer, value)
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString))
}

// תאריך עדכון סטטוס הזמנה בפורמט dd/mm/yyyy ('' אם אין)
export function formatStatusDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// שדה טלפון מקבל ספרות בלבד
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

// חיפוש לפי טלפון שמתעלם מהתו "-" (ורווחים): מחזיר את הספרות של מונח החיפוש,
// או '' אם המונח אינו מספר טלפון (מכיל אותיות או תווים אחרים)
export function phoneSearchDigits(term: string): string {
  const stripped = term.replace(/[\s-]/g, '')
  return /^\d+$/.test(stripped) ? stripped : ''
}

// תבניות ilike לשאילתת שרת: הספרות כפי שהן, וגם עם "-" בכל מיקום אפשרי,
// כדי להתאים למספרים שנשמרו עם מקף (050-1234567) וגם בלי
export function phoneIlikePatterns(digits: string): string[] {
  if (!digits) return []
  const patterns = [`%${digits}%`]
  for (let i = 1; i < digits.length && i <= 12; i++) {
    patterns.push(`%${digits.slice(0, i)}-${digits.slice(i)}%`)
  }
  return patterns
}

// חותמת תאריך אוטומטית להערות חופשיות: כל שורה חדשה שלא הייתה בהערה השמורה
// מקבלת בתחילתה [dd/mm/yyyy]. שורות קיימות או שכבר מתחילות בחותמת לא משתנות.
const NOTE_STAMP_RE = /^\[\d{1,2}\/\d{1,2}\/\d{4}\]/

export function stampNewNoteLines(previous: string | null | undefined, next: string | null | undefined): string {
  const nextText = (next || '').replace(/\s+$/, '')
  if (!nextText.trim()) return ''
  const d = new Date()
  const stamp = `[${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}]`
  const existing = new Map<string, number>()
  for (const line of (previous || '').split('\n')) {
    existing.set(line, (existing.get(line) || 0) + 1)
  }
  return nextText
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line
      const left = existing.get(line) || 0
      if (left > 0) { existing.set(line, left - 1); return line }
      if (NOTE_STAMP_RE.test(line.trim())) return line
      return `${stamp} ${line}`
    })
    .join('\n')
}

// פייפליין ההזמנה: מעוניין -> ממתין לבחירת צורה ודגם -> אושר צורה ודגם -> תיאום מדידות -> נמדד -> אישור -> תיאום אספקה -> בוצע -> בוטל
export const STATUS_LABELS: Record<string, string> = {
  inquiring: 'מתעניין',
  interested: 'מעוניין',
  awaiting_selection: 'ממתין לבחירת צורה ודגם',
  selection_approved: 'אושר צורה ודגם',
  measurement_scheduled: 'תיאום מדידות',
  measured: 'נמדד',
  awaiting_quote: 'ממתין להצעת מחיר',
  awaiting_approval: 'מחכים לאישור',
  quoted: 'אישור',
  delivery_scheduled: 'תיאום אספקה',
  done: 'בוצע',
  profit_received: 'הרווח התקבל',
  cancelled: 'בוטל',
}

// סדר הצגה לפייפליין (לתפריטים ולמסכי סקירה)
export const STATUS_ORDER = [
  'inquiring', 'interested', 'awaiting_selection', 'selection_approved', 'measurement_scheduled', 'measured', 'awaiting_quote', 'awaiting_approval', 'quoted',
  'delivery_scheduled', 'done', 'profit_received', 'cancelled',
] as const

export const STATUS_COLORS: Record<string, string> = {
  inquiring: 'outline',
  interested: 'secondary',
  awaiting_selection: 'warning',
  selection_approved: 'info',
  measurement_scheduled: 'info',
  measured: 'info',
  awaiting_quote: 'warning',
  awaiting_approval: 'warning',
  quoted: 'warning',
  delivery_scheduled: 'info',
  done: 'success',
  profit_received: 'success',
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

// כתובת מלאה של דייר: רחוב ומספר + קומה + דירה (מפרט, סעיף 5)
export function fullAddress(r?: { address?: string | null; floor?: string | null; apartment?: string | null } | null): string {
  if (!r) return ''
  const parts = [r.address?.trim()]
  if (r.floor?.trim()) parts.push(`קומה ${r.floor.trim()}`)
  if (r.apartment?.trim()) parts.push(`דירה ${r.apartment.trim()}`)
  return parts.filter(Boolean).join(', ')
}

// מה חסר בכתובת הדייר (לסימון כתום)
export function missingAddressParts(r?: { address?: string | null; floor?: string | null; apartment?: string | null } | null): string[] {
  const missing: string[] = []
  if (!r?.address?.trim()) missing.push('כתובת')
  if (!r?.floor?.trim()) missing.push('קומה')
  if (!r?.apartment?.trim()) missing.push('דירה')
  return missing
}

// מי פותח את הדירה לבעל המקצוע
export const ACCESS_TYPES = ['הדייר בבית', 'שוכר גר בדירה', 'מפתח אצל שכן', 'מפתח אצל קרוב משפחה', 'אחר'] as const

// ---------- כמות של פריט: "8.3 מטר", "5 חלונות", "2 דלתות" ----------
const UNIT_PLURALS: Record<string, string> = { 'חלון': 'חלונות', 'דלת': 'דלתות' }

// יחידת המידה של פריט: לפי סוג המוצר שהתיאור שלו מכיל (למשל "דלת"), אחרת לפי המוצר (למשל "מטר" בווילונות)
export function itemUnit(
  description: string | null | undefined,
  cat: { profit_type?: string | null; unit_label?: string | null } | null | undefined,
  rules: { name: string; profit_type: string; unit_label?: string | null }[] = [],
) {
  const r = rules.find((x) => x.name.trim() && (description || '').includes(x.name.trim()))
  if (r) return r.profit_type === 'per_unit' ? (r.unit_label || r.name) : null
  return cat?.profit_type === 'per_unit' ? (cat.unit_label || null) : null
}

export function quantityLabel(qty: number | string | null | undefined, unit?: string | null) {
  const q = Number(qty)
  if (!(q > 0)) return ''
  const n = String(Math.round(q * 100) / 100)
  if (!unit) return q === 1 ? '' : `× ${n}`
  return `${n} ${q === 1 ? unit : (UNIT_PLURALS[unit] || unit)}`
}
