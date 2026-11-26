// חישובים משותפים להזמנות: סכום, תשלום, עדכון אחרון, הזמנות תקועות וממתינות.
// משמשים את מסך ההזמנות, לוח הפעולה והתפריט (מספר התקועות).

export const CLOSED_STATUSES = new Set(['done', 'profit_received', 'cancelled'])
// הזמנה שהעבודה בה בוצעה ("בוצע", או "הרווח התקבל" — הספק כבר העביר לחברה את חלקה)
export const DONE_STATUSES = new Set(['done', 'profit_received'])
// "ממתינות לתיאום" עם בעל המקצוע (מפרט, סעיף 2)
export const AWAITING_STATUSES = new Set(['interested', 'awaiting_selection', 'selection_approved'])
export const STUCK_DAYS = 7
export const VERY_STUCK_DAYS = 21
// מינימום ברירת מחדל של הזמנות ממתינות שממנו שווה לקרוא לספק (עד שיוגדר לכל ספק ועיר)
export const DEFAULT_SUPPLIER_MIN = 5

export type OrderLike = {
  status?: string
  total_price?: number | null
  is_global_price?: boolean | null
  updated_at?: string | null
  status_updated_at?: string | null
  created_at?: string | null
  measured_at?: string | null
  installation_planned_date?: string | null
  order_payments?: { amount: number | null }[] | null
  order_items?: { customer_price: number | null }[] | null
}

export type PayState = 'paid' | 'partial' | 'not_paid' | 'no_price'
export const PAY_LABELS: Record<PayState, string> = { paid: 'שולם', partial: 'חלקי', not_paid: 'לא שולם', no_price: 'אין מחיר' }
export const PAY_COLORS: Record<PayState, string> = { paid: 'success', partial: 'info', not_paid: 'destructive', no_price: 'outline' }

// כמו בדף ההזמנה: במחיר גלובלי — total_price; אחרת סכום הפריטים (total_price עלול להיות
// תקוע על 0 בהזמנות ישנות), ואם אין פריטים — total_price
export function orderAmount(o: OrderLike) {
  if (o.is_global_price) return o.total_price || 0
  const items = (o.order_items || []).reduce((s, i) => s + (i.customer_price || 0), 0)
  return items > 0 ? items : (o.total_price || 0)
}

export function orderPaid(o: OrderLike) {
  return (o.order_payments || []).reduce((s, p) => s + (p.amount || 0), 0)
}

export function orderBalance(o: OrderLike) {
  return Math.max(0, orderAmount(o) - orderPaid(o))
}

export function payState(o: OrderLike): PayState {
  const amount = orderAmount(o)
  if (!amount) return 'no_price'
  const paid = orderPaid(o)
  if (paid >= amount) return 'paid'
  if (paid > 0) return 'partial'
  return 'not_paid'
}

export function lastUpdated(o: OrderLike): string {
  return ([o.updated_at, o.status_updated_at, o.created_at].filter(Boolean) as string[]).sort().pop() || ''
}

export function daysSince(iso: string) {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

export function isOpen(o: OrderLike) {
  return !CLOSED_STATUSES.has(o.status || '')
}

export function isStuck(o: OrderLike) {
  return isOpen(o) && daysSince(lastUpdated(o)) > STUCK_DAYS
}

// תאריך ביומן (מדידה/התקנה) אם נקבע בסטטוס המתאים
export function scheduledDate(o: OrderLike): string | null {
  if (o.status === 'measurement_scheduled') return o.measured_at || null
  if (o.status === 'delivery_scheduled') return o.installation_planned_date || null
  return null
}

export function todayKey() {
  return new Date().toLocaleDateString('en-CA')
}

export function addDaysKey(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

// מדידה או התקנה מתוכננת היום או ב-7 הימים הקרובים
export function isScheduledThisWeek(o: OrderLike) {
  const d = scheduledDate(o)
  return !!d && d >= todayKey() && d <= addDaysKey(7)
}

// טלפון ישראלי תקין: נייד 10 ספרות שמתחיל ב-05, נייח 9 ספרות (02/03/04/08/09),
// או קווי 10 ספרות שמתחיל ב-07 (072/073/074/077 וכו')
export function isValidIsraeliPhone(raw: string | null | undefined) {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return /^0[57]\d{8}$/.test(d) || /^0[2-9]\d{7}$/.test(d)
}

// סורגים: כשההזמנה עוברת ל"נמדד" / "ממתין להצעת מחיר" / "מחכים לאישור" / "אישור" ואין תאריך מדידה —
// נכנס אוטומטית תאריך היום (שעון מקומי)
export const BARS_MEASURED_STATUSES = new Set(['measured', 'awaiting_quote', 'awaiting_approval', 'quoted'])
export function stampsMeasuredDate(categoryName: string | null | undefined, status: string) {
  return !!categoryName && categoryName.includes('סורג') && BARS_MEASURED_STATUSES.has(status)
}
