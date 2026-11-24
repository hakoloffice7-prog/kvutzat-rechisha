// חישובי רווח ועמלות נציגים — משותף למסך "כסף ונציגים" ולדוח הנציגים.
import { profitRuleFor } from '@/lib/utils'
import { orderAmount } from '@/lib/orderMetrics'

export type CommissionCategory = {
  id: string
  name: string
  all_profit: boolean
  profit_type: string | null
  profit_value: number | null
}

export type CommissionOrder = {
  id: string
  order_number: number | null
  status: string
  created_at: string
  category_id: string | null
  supplier_id: string | null
  total_price: number | null
  is_global_price: boolean | null
  residents: { name: string; projects: { city_id: string } | null } | null
  order_payments: { amount: number | null }[]
  order_items: { customer_price: number | null; quantity?: number | null; order_item_costs: { supplier_price: number | null } | null }[]
  order_costs: { global_supplier_price: number | null } | null
}

export type Representative = {
  id: string
  name: string
  city_id: string | null
  phone: string | null
  email: string | null
  commission_percent: number
  all_profit_commission_percent: number
}

export const COMMISSION_ORDER_SELECT =
  'id, order_number, status, created_at, category_id, supplier_id, total_price, is_global_price, residents(name, projects(city_id)), order_payments(amount), order_items(customer_price, quantity, order_item_costs(supplier_price)), order_costs(global_supplier_price)'

// רווח משוער: לפי מחיר ספק אם הוקלד; אחרת לפי אחוז הרווח של המוצר (בסכום ליחידה — 10% כהערכה)
export function estimateProfit(o: CommissionOrder, catById: Map<string, CommissionCategory>) {
  const amount = orderAmount(o)
  if (!amount) return 0
  const cost = o.is_global_price
    ? (o.order_costs?.global_supplier_price || 0)
    : o.order_items.reduce((s, i) => s + (i.order_item_costs?.supplier_price || 0), 0)
  if (cost > 0) return amount - cost
  const rule = profitRuleFor(catById.get(o.category_id || ''))
  return amount * ((rule.type === 'percent' ? rule.value : 10) / 100)
}

// הזמנות שנספרות לעמלה: לא בוטלו, ויש להן מחיר
export function commissionable(o: CommissionOrder) {
  return o.status !== 'cancelled' && orderAmount(o) > 0
}

// עמלת נציג על הזמנה אחת. מוצר רגיל: אחוז מהברוטו. מוצר שכל הרווח שלנו: אחוז מהרווח.
// כשיש כמה נציגים באותה עיר — העמלה מתחלקת ביניהם שווה בשווה (sameCity).
export function orderCommission(
  o: CommissionOrder,
  rep: Representative,
  catById: Map<string, CommissionCategory>,
  sameCity: number,
) {
  const allProfit = !!catById.get(o.category_id || '')?.all_profit
  const base = allProfit ? estimateProfit(o, catById) : orderAmount(o)
  const rate = allProfit ? rep.all_profit_commission_percent : rep.commission_percent
  return { allProfit, base, rate, commission: (base * rate) / 100 / Math.max(1, sameCity) }
}
