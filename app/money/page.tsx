'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/RoleProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react'
import { OrderNumber } from '@/components/OrderNumber'
import { SupplierRemittances } from '@/components/SupplierRemittances'
import { supplierCompanyShare, supplierDebtFromPayments, type SupplierDealRule } from '@/lib/commissions'
import { formatCurrency, profitRuleFor, STATUS_LABELS } from '@/lib/utils'
import { orderAmount, orderPaid, orderBalance, DONE_STATUSES } from '@/lib/orderMetrics'

// כסף ונציגים (מפרט, סעיף 7) — מנהל בלבד.

type Option = { id: string; name: string }
type Category = { id: string; name: string; kind: string; all_profit: boolean; profit_type: string | null; profit_value: number | null }
type Order = {
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
  order_items: { customer_price: number | null; quantity: number | null; order_item_costs: { supplier_price: number | null } | null }[]
  order_costs: { global_supplier_price: number | null } | null
}
type Rep = { id: string; name: string; city_id: string | null; phone: string | null; email: string | null; commission_percent: number; all_profit_commission_percent: number }
type Expense = { id: string; spent_at: string; city_id: string | null; kind: string; amount: number; note: string | null }
type Supplier = { id: string; name: string; deal_type: string | null; deal_value: number | null; deal_unit: string | null }
type Settlement = { id: string; supplier_id: string; kind: 'payment' | 'offset'; amount: number; happened_at: string; note: string | null }

const EMPTY_REP = { name: '', city_id: '', phone: '', email: '', commission_percent: '1.25', all_profit_commission_percent: '12.5' }

export default function MoneyPage() {
  const isAdmin = useIsAdmin()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [reps, setReps] = useState<Rep[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [dealRules, setDealRules] = useState<SupplierDealRule[]>([])
  const [allocatedByOrder, setAllocatedByOrder] = useState<Map<string, number>>(new Map())
  // לחיצה על משבצת למעלה — רשימת ההזמנות שמרכיבות את הסכום
  const [tile, setTile] = useState<null | 'sum' | 'paid' | 'left' | 'profit'>(null)
  const [tileCat, setTileCat] = useState('')
  const [tileSort, setTileSort] = useState<'value' | 'category'>('value')
  const tileScrollRef = useRef<HTMLDivElement>(null)
  const restoreScrollRef = useRef<number | null>(null)
  // חזרה מהזמנה ("חזור") — פותחים שוב את אותה רשימה באותו מקום
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('money-tile') || 'null')
      if (saved?.tile) {
        setTile(saved.tile); setTileCat(saved.cat || ''); setTileSort(saved.sort || 'value')
        restoreScrollRef.current = saved.scroll || 0
      }
      sessionStorage.removeItem('money-tile') // פעם אחת בלבד — כניסה רגילה למסך לא תפתח את החלון
    } catch {}
  }, [])
  function closeTile() {
    setTile(null)
    try { sessionStorage.removeItem('money-tile') } catch {}
  }
  function rememberTile() {
    try { sessionStorage.setItem('money-tile', JSON.stringify({ tile, cat: tileCat, sort: tileSort, scroll: tileScrollRef.current?.scrollTop || 0 })) } catch {}
  }
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7))
  const [repDialog, setRepDialog] = useState<{ id?: string; data: typeof EMPTY_REP } | null>(null)
  const [newExpense, setNewExpense] = useState({ spent_at: new Date().toLocaleDateString('en-CA'), city_id: '', amount: '', note: '' })
  const [newSettlement, setNewSettlement] = useState({ supplier_id: '', kind: 'payment', amount: '', note: '' })

  async function load() {
    const [o, c, cat, r, e, s, st] = await Promise.all([
      supabase.from('orders').select('id, order_number, status, created_at, category_id, supplier_id, total_price, is_global_price, residents(name, projects(city_id)), order_payments(amount, paid_to), order_items(description, customer_price, quantity, order_item_costs(supplier_price)), order_costs(global_supplier_price)'),
      supabase.from('cities').select('id, name').order('name'),
      supabase.from('categories').select('id, name, kind, all_profit, profit_type, profit_value').order('name'),
      supabase.from('representatives').select('*').order('name'),
      supabase.from('expenses').select('*').order('spent_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, deal_type, deal_value, deal_unit').order('name'),
      supabase.from('supplier_settlements').select('*').order('happened_at', { ascending: false }),
    ])
    const { data: dr } = await supabase.from('supplier_deal_rules').select('supplier_id, name, deal_type, deal_value, deal_unit')
    setDealRules((dr || []) as SupplierDealRule[])
    const { data: al } = await supabase.from('supplier_payment_allocations').select('order_id, amount')
    const m = new Map<string, number>()
    for (const a of (al || []) as any[]) m.set(a.order_id, (m.get(a.order_id) || 0) + Number(a.amount))
    setAllocatedByOrder(m)
    setOrders((o.data || []) as unknown as Order[])
    setCities(c.data || [])
    setCategories((cat.data || []) as Category[])
    setReps((r.data || []) as Rep[])
    setExpenses((e.data || []) as Expense[])
    setSuppliers((s.data || []) as Supplier[])
    setSettlements((st.data || []) as Settlement[])
    setLoading(false)
  }
  useEffect(() => { if (isAdmin) load(); else setLoading(false) }, [isAdmin])

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name || '—'

  // רווח משוער: לפי מחיר ספק אם הוקלד; אחרת לפי אחוז הרווח של המוצר (סכום ליחידה — 10% כהערכה)
  function profit(o: Order) {
    const amount = orderAmount(o)
    if (!amount) return 0
    const cost = o.is_global_price
      ? (o.order_costs?.global_supplier_price || 0)
      : o.order_items.reduce((s, i) => s + (i.order_item_costs?.supplier_price || 0), 0)
    if (cost > 0) return amount - cost
    const rule = profitRuleFor(catById.get(o.category_id || ''))
    return amount * ((rule.type === 'percent' ? rule.value : 10) / 100)
  }

  const live = orders.filter((o) => o.status !== 'cancelled' && orderAmount(o) > 0)
  const totals = useMemo(() => {
    const sum = live.reduce((s, o) => s + orderAmount(o), 0)
    const paid = live.reduce((s, o) => s + Math.min(orderPaid(o), orderAmount(o)), 0)
    // נשאר לגבות — רק על הזמנות שכבר בוצעו
    const left = live.filter((o) => DONE_STATUSES.has(o.status)).reduce((s, o) => s + orderBalance(o), 0)
    return { sum, paid, left, profit: live.reduce((s, o) => s + profit(o), 0) }
  }, [orders, categories])

  const byCity = cities.map((c) => {
    const list = live.filter((o) => o.residents?.projects?.city_id === c.id)
    const sum = list.reduce((s, o) => s + orderAmount(o), 0)
    const paid = list.reduce((s, o) => s + Math.min(orderPaid(o), orderAmount(o)), 0)
    return { city: c, count: list.length, sum, paid, profit: list.reduce((s, o) => s + profit(o), 0) }
  }).filter((r) => r.count > 0)

  const toCollect = orders.filter((o) => DONE_STATUSES.has(o.status) && orderBalance(o) > 0).sort((a, b) => orderBalance(b) - orderBalance(a))

  // עמלות לחודש שנבחר: לפי הזמנות שנפתחו בחודש, בעיר של הנציג; שני נציגים בעיר — חלוקה שווה
  const monthOrders = live.filter((o) => o.created_at.slice(0, 7) === month)
  const commissions = reps.map((rep) => {
    const list = monthOrders.filter((o) => o.residents?.projects?.city_id === rep.city_id)
    const sameCity = Math.max(1, reps.filter((r) => r.city_id === rep.city_id).length)
    let regular = 0, allProfit = 0, grossRegular = 0, profitAll = 0
    for (const o of list) {
      if (catById.get(o.category_id || '')?.all_profit) { profitAll += profit(o); allProfit += profit(o) * rep.all_profit_commission_percent / 100 }
      else { grossRegular += orderAmount(o); regular += orderAmount(o) * rep.commission_percent / 100 }
    }
    const ads = expenses.filter((e) => e.city_id === rep.city_id && e.spent_at.slice(0, 7) === month && e.kind === 'advertising').reduce((s, e) => s + e.amount, 0)
    return { rep, count: list.length, grossRegular, profitAll, commission: (regular + allProfit) / sameCity, sameCity, ads }
  })

  // מה הספק חייב לחברה: על הזמנות שבוצעו — לפי תנאי ההסכם (אחוז מהמחיר, או סכום ליחידה × הכמות
  // שנרשמה בפריטים; כל מטר = יחידה). בלי הסכם / בלי כמות — לפי הרווח המשוער
  // כולל תנאי הסכם לפי פריט (חלון / דלת וכו') — חישוב משותף עם "מה הספק העביר — לפי לקוח"
  function supplierShare(s: Supplier, o: Order) {
    return supplierCompanyShare(o as any, s, dealRules, catById as any)
  }
  // חוב הספק נוצר לפי תשלומי הלקוחות (גם מקדמה, יחסית); תשלום ישיר לחברה נחשב כחלק שכבר התקבל
  const supplierRows = suppliers.map((s) => {
    const list = orders.filter((o) => o.supplier_id === s.id && o.status !== 'cancelled' && orderAmount(o) > 0)
    let owed = 0
    let paidDirect = 0
    let count = 0
    for (const o of list) {
      const share = supplierShare(s, o)
      const debt = supplierDebtFromPayments(o as any, share)
      const direct = Math.min(debt.companyPaid, share)
      // "הרווח התקבל" שנבחר ידנית: כל חלק החברה נחשב כהתקבל
      const manualExtra = o.status === 'profit_received'
        ? Math.max(0, share - (allocatedByOrder.get(o.id) || 0) - direct) : 0
      const accrued = manualExtra > 0 ? Math.max(debt.accrued, share) : debt.accrued
      if (accrued > 0) count++
      owed += accrued
      paidDirect += direct + manualExtra
    }
    const paid = settlements.filter((x) => x.supplier_id === s.id && x.kind === 'payment').reduce((a, x) => a + x.amount, 0) + paidDirect
    const offset = settlements.filter((x) => x.supplier_id === s.id && x.kind === 'offset').reduce((a, x) => a + x.amount, 0)
    return { s, count, owed, paid, offset, balance: owed - paid - offset }
  }).filter((r) => r.count > 0 || r.paid > 0 || r.offset > 0)

  async function saveRep() {
    if (!repDialog || !repDialog.data.name.trim()) return
    const d = repDialog.data
    const row = {
      name: d.name.trim(), city_id: d.city_id || null, phone: d.phone.trim() || null, email: d.email.trim() || null,
      commission_percent: parseFloat(d.commission_percent) || 0, all_profit_commission_percent: parseFloat(d.all_profit_commission_percent) || 0,
    }
    if (repDialog.id) await supabase.from('representatives').update(row).eq('id', repDialog.id)
    else await supabase.from('representatives').insert(row)
    setRepDialog(null)
    load()
  }
  async function deleteRep(id: string) {
    if (!confirm('למחוק את הנציג?')) return
    await supabase.from('representatives').delete().eq('id', id)
    load()
  }
  async function addExpense() {
    const amount = parseFloat(newExpense.amount)
    if (!amount) return
    await supabase.from('expenses').insert({ spent_at: newExpense.spent_at, city_id: newExpense.city_id || null, kind: 'advertising', amount, note: newExpense.note.trim() || null })
    setNewExpense({ ...newExpense, amount: '', note: '' })
    load()
  }
  async function addSettlement() {
    const amount = parseFloat(newSettlement.amount)
    if (!amount || !newSettlement.supplier_id) return
    await supabase.from('supplier_settlements').insert({ supplier_id: newSettlement.supplier_id, kind: newSettlement.kind, amount, note: newSettlement.note.trim() || null })
    setNewSettlement({ ...newSettlement, amount: '', note: '' })
    load()
  }
  async function deleteRow(table: 'expenses' | 'supplier_settlements', id: string) {
    if (!confirm('למחוק את השורה?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  // אחרי חזרה — גוללים את הרשימה לאותו מקום (כשהנתונים נטענו והחלון נפתח)
  useEffect(() => {
    if (loading || !tile || restoreScrollRef.current == null) return
    const top = restoreScrollRef.current
    restoreScrollRef.current = null
    const t = setTimeout(() => { if (tileScrollRef.current) tileScrollRef.current.scrollTop = top }, 80)
    return () => clearTimeout(t)
  }, [loading, tile])

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
  if (!isAdmin) return <p className="text-gray-500">המסך הזה זמין למנהלים בלבד.</p>

  // ההזמנות שמאחורי המשבצת שנלחצה (סינון לפי מוצר, מיון לפי סכום או לפי מוצר)
  const tileValue = (o: Order) => tile === 'paid' ? orderPaid(o) : tile === 'left' ? orderBalance(o) : tile === 'profit' ? profit(o) : orderAmount(o)
  const tileOrders = !tile ? [] : (
    tile === 'sum' || tile === 'profit' ? live
    : tile === 'paid' ? live.filter((o) => orderPaid(o) > 0)
    : live.filter((o) => DONE_STATUSES.has(o.status) && orderBalance(o) > 0)
  )
    .filter((o) => !tileCat || o.category_id === tileCat)
    .sort((a, b) => tileSort === 'category'
      ? (catById.get(a.category_id || '')?.name || '').localeCompare(catById.get(b.category_id || '')?.name || '', 'he') || tileValue(b) - tileValue(a)
      : tileValue(b) - tileValue(a))
  const tileCategories = categories.filter((c) => live.some((o) => o.category_id === c.id))
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const sel = 'h-9 rounded-md border border-gray-200 bg-white px-2 text-sm'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">כסף ונציגים</h1>
        <p className="text-gray-500 mt-1">כמה כסף בחוץ ואצל מי, רווח לפי עיר, עמלות נציגים וחובות ספקים</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button type="button" onClick={() => setTile('sum')} className="text-right"><Card className="h-full hover:shadow-md hover:border-blue-300 transition"><CardContent className="p-4"><p className="text-sm text-gray-500">סך הזמנות עם מחיר</p><p className="text-2xl font-bold">{formatCurrency(totals.sum)}</p><p className="text-xs text-gray-400">{live.length} הזמנות (בלי בוטלו) · לחצו לרשימה</p></CardContent></Card></button>
        <button type="button" onClick={() => setTile('paid')} className="text-right"><Card className="h-full hover:shadow-md hover:border-blue-300 transition"><CardContent className="p-4"><p className="text-sm text-gray-500">נגבה</p><p className="text-2xl font-bold text-green-600">{formatCurrency(totals.paid)}</p><p className="text-xs text-gray-400">{pct(totals.paid, totals.sum)}% גבייה · לחצו לרשימה</p></CardContent></Card></button>
        <button type="button" onClick={() => setTile('left')} className="text-right"><Card className="h-full hover:shadow-md hover:border-blue-300 transition"><CardContent className="p-4"><p className="text-sm text-gray-500">נשאר לגבות</p><p className="text-2xl font-bold text-red-600">{formatCurrency(totals.left)}</p><p className="text-xs text-gray-400">לחצו לרשימה</p></CardContent></Card></button>
        <button type="button" onClick={() => setTile('profit')} className="text-right"><Card className="h-full hover:shadow-md hover:border-blue-300 transition"><CardContent className="p-4"><p className="text-sm text-gray-500">רווח משוער</p><p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.profit)}</p><p className="text-xs text-gray-400">לפי מחיר ספק, או אחוז הרווח של המוצר · לחצו לרשימה</p></CardContent></Card></button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">לפי עיר</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-600">
              <th className="text-right p-2">עיר</th><th className="text-right p-2">הזמנות</th><th className="text-right p-2">סכום</th><th className="text-right p-2">נגבה</th><th className="text-right p-2 w-1/4">גבייה</th><th className="text-right p-2">רווח משוער</th>
            </tr></thead>
            <tbody>
              {byCity.map((r) => (
                <tr key={r.city.id} className="border-b">
                  <td className="p-2 font-medium">{r.city.name}</td>
                  <td className="p-2">{r.count}</td>
                  <td className="p-2">{formatCurrency(r.sum)}</td>
                  <td className="p-2">{formatCurrency(r.paid)}</td>
                  <td className="p-2">
                    <div className="h-2 rounded bg-gray-100"><div className="h-2 rounded bg-green-500" style={{ width: `${pct(r.paid, r.sum)}%` }} /></div>
                    <span className="text-xs text-gray-500">{pct(r.paid, r.sum)}%</span>
                  </td>
                  <td className="p-2">{formatCurrency(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">אחוז הרווח לכל מוצר נערך במסך <Link href="/categories" className="text-blue-600 hover:underline">קטגוריות</Link>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">לגבייה ({toCollect.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y max-h-96 overflow-y-auto">
            {toCollect.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between py-2 px-1 hover:bg-gray-50 rounded">
                  <span className="flex items-center gap-2"><OrderNumber orderNumber={o.order_number} />{o.residents?.name} · {catById.get(o.category_id || '')?.name} · {cityName(o.residents?.projects?.city_id || null)}</span>
                  <span className="font-semibold text-red-600">{formatCurrency(orderBalance(o))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">נציגים ועמלות</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">חודש:</span>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 h-9" dir="ltr" />
            <Button size="sm" onClick={() => setRepDialog({ data: { ...EMPTY_REP } })}><Plus className="h-4 w-4 ml-1" />הוסף נציג</Button>
          </div>
        </CardHeader>
        <CardContent>
          {reps.length === 0 ? <p className="text-sm text-gray-500">עוד לא הוגדרו נציגים</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-right p-2">נציג</th><th className="text-right p-2">עיר</th><th className="text-right p-2">טלפון</th><th className="text-right p-2">עמלה</th>
                <th className="text-right p-2">הזמנות בחודש</th><th className="text-right p-2">עמלה לחודש</th><th className="text-right p-2">פרסום בעיר</th><th></th>
              </tr></thead>
              <tbody>
                {commissions.map(({ rep, count, commission, sameCity, ads, grossRegular, profitAll }) => (
                  <tr key={rep.id} className="border-b">
                    <td className="p-2 font-medium">{rep.name}{!rep.email && <span className="mr-1 text-[10px] rounded bg-orange-100 text-orange-700 px-1">חסר מייל</span>}</td>
                    <td className="p-2">{cityName(rep.city_id)}</td>
                    <td className="p-2" dir="ltr">{rep.phone || '—'}</td>
                    <td className="p-2 text-xs">{rep.commission_percent}% מוצר רגיל · {rep.all_profit_commission_percent}% כשכל הרווח שלנו</td>
                    <td className="p-2">{count}</td>
                    <td className="p-2 font-semibold" title={`ברוטו מוצרים רגילים ${formatCurrency(grossRegular)} · רווח מוצרים שכל הרווח שלנו ${formatCurrency(profitAll)}${sameCity > 1 ? ` · מחולק ל-${sameCity} נציגים` : ''}`}>
                      {formatCurrency(commission)}{sameCity > 1 && <span className="text-xs text-gray-400"> (÷{sameCity})</span>}
                    </td>
                    <td className="p-2 text-gray-600">{ads ? formatCurrency(ads) : '—'}</td>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setRepDialog({ id: rep.id, data: { name: rep.name, city_id: rep.city_id || '', phone: rep.phone || '', email: rep.email || '', commission_percent: String(rep.commission_percent), all_profit_commission_percent: String(rep.all_profit_commission_percent) } })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteRep(rep.id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-500 mt-2">
            מוצר רגיל: אחוז מהברוטו. מוצר שכל הרווח שלנו (מסומן במסד: {categories.filter((c) => c.all_profit).map((c) => c.name).join(', ') || '—'}): אחוז מהרווח המשוער.
            <br /><strong className="text-orange-700">⚠ לזכור: להוריד ידנית מהעמלה את חלק הנציג בהוצאות הפרסום (ברכסים).</strong> ההוצאות מוצגות ליד הנציג ולא מקוזזות אוטומטית.
          </p>
        </CardContent>
      </Card>

      <SupplierRemittances />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">הוצאות פרסום</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={newExpense.spent_at} onChange={(e) => setNewExpense({ ...newExpense, spent_at: e.target.value })} className="w-40 h-9" dir="ltr" />
              <select className={sel} value={newExpense.city_id} onChange={(e) => setNewExpense({ ...newExpense, city_id: e.target.value })}>
                <option value="">עיר</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Input type="number" step="any" placeholder="סכום" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} className="w-28 h-9" dir="ltr" />
              <Input placeholder="הערה" value={newExpense.note} onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })} className="w-40 h-9" />
              <Button size="sm" onClick={addExpense} disabled={!parseFloat(newExpense.amount)}>הוסף</Button>
            </div>
            <ul className="divide-y text-sm max-h-60 overflow-y-auto">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-1.5">
                  <span>{e.spent_at.split('-').reverse().join('/')} · {cityName(e.city_id)}{e.note ? ` · ${e.note}` : ''}</span>
                  <span className="flex items-center gap-2">{formatCurrency(e.amount)}<button onClick={() => deleteRow('expenses', e.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">מה הספקים חייבים לחברה</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-right p-2">ספק</th><th className="text-right p-2">חייב</th><th className="text-right p-2">שילם</th><th className="text-right p-2">קיזוז</th><th className="text-right p-2">יתרה</th>
              </tr></thead>
              <tbody>
                {supplierRows.map((r) => (
                  <tr key={r.s.id} className="border-b">
                    <td className="p-2"><Link href={`/suppliers/${r.s.id}`} className="hover:text-blue-600">{r.s.name}</Link><span className="text-xs text-gray-400"> ({r.count} לקוחות ששילמו)</span></td>
                    <td className="p-2">{formatCurrency(r.owed)}</td>
                    <td className="p-2">{formatCurrency(r.paid)}</td>
                    <td className="p-2">{formatCurrency(r.offset)}</td>
                    <td className={`p-2 font-semibold ${r.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <select className={sel} value={newSettlement.supplier_id} onChange={(e) => setNewSettlement({ ...newSettlement, supplier_id: e.target.value })}>
                <option value="">ספק</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className={sel} value={newSettlement.kind} onChange={(e) => setNewSettlement({ ...newSettlement, kind: e.target.value })}>
                <option value="payment">תשלום מהספק</option><option value="offset">קיזוז</option>
              </select>
              <Input type="number" step="any" placeholder="סכום" value={newSettlement.amount} onChange={(e) => setNewSettlement({ ...newSettlement, amount: e.target.value })} className="w-28 h-9" dir="ltr" />
              <Input placeholder="הערה" value={newSettlement.note} onChange={(e) => setNewSettlement({ ...newSettlement, note: e.target.value })} className="w-36 h-9" />
              <Button size="sm" onClick={addSettlement} disabled={!newSettlement.supplier_id || !parseFloat(newSettlement.amount)}>רשום</Button>
            </div>
            <ul className="divide-y text-xs max-h-40 overflow-y-auto">
              {settlements.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-1">
                  <span>{x.happened_at.split('-').reverse().join('/')} · {suppliers.find((s) => s.id === x.supplier_id)?.name} · {x.kind === 'payment' ? 'תשלום' : 'קיזוז'}{x.note ? ` · ${x.note}` : ''}</span>
                  <span className="flex items-center gap-2">{formatCurrency(x.amount)}<button onClick={() => deleteRow('supplier_settlements', x.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">חוב הספק נוצר לפי מה שהלקוחות שילמו (גם מקדמה — באופן יחסי), לפי תנאי ההסכם במסך הספקים: אחוז מהמחיר, או סכום ליחידה × הכמות שנרשמה בפריטים (כל מטר = יחידה). הזמנה בלי הסכם או בלי כמות — לפי הרווח המשוער.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!tile} onOpenChange={(o) => !o && closeTile()}>
        <DialogContent dir="rtl" className="max-w-4xl">
          <DialogHeader><DialogTitle>{tile === 'sum' ? 'כל ההזמנות עם מחיר' : tile === 'paid' ? 'הזמנות ששולם עליהן' : tile === 'left' ? 'נשאר לגבות' : 'רווח משוער לפי הזמנה'} ({tileOrders.length})</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <select className={sel} value={tileCat} onChange={(e) => setTileCat(e.target.value)}>
              <option value="">כל המוצרים</option>
              {tileCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={sel} value={tileSort} onChange={(e) => setTileSort(e.target.value as any)}>
              <option value="value">מיון: מהסכום הגדול לקטן</option>
              <option value="category">מיון: לפי מוצר</option>
            </select>
            {tile === 'left' && <span className="text-xs text-gray-500">רק הזמנות שבוצעו</span>}
          </div>
          <div ref={tileScrollRef} className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0"><tr>
                <th className="text-right p-2">הזמנה</th><th className="text-right p-2">לקוח</th><th className="text-right p-2">מוצר</th><th className="text-right p-2">עיר</th><th className="text-right p-2">סטטוס</th>
                <th className="text-right p-2">מחיר</th><th className="text-right p-2">שולם</th><th className="text-right p-2">יתרה</th><th className="text-right p-2">רווח משוער</th>
              </tr></thead>
              <tbody>
                {tileOrders.map((o) => (
                  <tr key={o.id} className="border-b hover:bg-gray-50">
                    <td className="p-2"><Link href={`/orders/${o.id}`} onClick={rememberTile} className="text-blue-600 hover:underline"><OrderNumber orderNumber={o.order_number} /></Link></td>
                    <td className="p-2"><Link href={`/orders/${o.id}`} onClick={rememberTile} className="hover:underline">{o.residents?.name || '—'}</Link></td>
                    <td className="p-2">{catById.get(o.category_id || '')?.name || '—'}</td>
                    <td className="p-2">{cityName(o.residents?.projects?.city_id || null)}</td>
                    <td className="p-2">{STATUS_LABELS[o.status] || o.status}</td>
                    <td className={`p-2 ${tile === 'sum' ? 'font-semibold' : ''}`}>{formatCurrency(orderAmount(o))}</td>
                    <td className={`p-2 text-green-700 ${tile === 'paid' ? 'font-semibold' : ''}`}>{formatCurrency(Math.min(orderPaid(o), orderAmount(o)))}</td>
                    <td className={`p-2 text-red-600 ${tile === 'left' ? 'font-semibold' : ''}`}>{formatCurrency(orderBalance(o))}</td>
                    <td className={`p-2 text-blue-700 ${tile === 'profit' ? 'font-semibold' : ''}`}>{formatCurrency(profit(o))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold bg-gray-50">
                <td className="p-2" colSpan={5}>סה"כ</td>
                <td className="p-2">{formatCurrency(tileOrders.reduce((a, o) => a + orderAmount(o), 0))}</td>
                <td className="p-2">{formatCurrency(tileOrders.reduce((a, o) => a + Math.min(orderPaid(o), orderAmount(o)), 0))}</td>
                <td className="p-2">{formatCurrency(tileOrders.reduce((a, o) => a + orderBalance(o), 0))}</td>
                <td className="p-2">{formatCurrency(tileOrders.reduce((a, o) => a + profit(o), 0))}</td>
              </tr></tfoot>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!repDialog} onOpenChange={(o) => !o && setRepDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{repDialog?.id ? 'עריכת נציג' : 'נציג חדש'}</DialogTitle></DialogHeader>
          {repDialog && (
            <div className="space-y-2">
              <Input placeholder="שם *" value={repDialog.data.name} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, name: e.target.value } })} />
              <select className="h-10 w-full rounded-md border border-gray-200 px-2 text-sm" value={repDialog.data.city_id} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, city_id: e.target.value } })}>
                <option value="">עיר</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="טלפון" value={repDialog.data.phone} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, phone: e.target.value } })} dir="ltr" />
                <Input placeholder="מייל" value={repDialog.data.email} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, email: e.target.value } })} dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">% מוצר רגיל (מהברוטו)
                  <Input type="number" step="any" value={repDialog.data.commission_percent} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, commission_percent: e.target.value } })} dir="ltr" />
                </label>
                <label className="text-xs text-gray-500">% מוצר שכל הרווח שלנו
                  <Input type="number" step="any" value={repDialog.data.all_profit_commission_percent} onChange={(e) => setRepDialog({ ...repDialog, data: { ...repDialog.data, all_profit_commission_percent: e.target.value } })} dir="ltr" />
                </label>
              </div>
              <p className="text-xs text-gray-500">נציג רגיל: 1.25% / 12.5%. רכסים: 2.5% / 25%.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRepDialog(null)}>ביטול</Button>
                <Button onClick={saveRep} disabled={!repDialog.data.name.trim()}>שמור</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
