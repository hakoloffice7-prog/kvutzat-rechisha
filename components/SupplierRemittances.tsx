'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Wand2 } from 'lucide-react'
import { OrderNumber } from '@/components/OrderNumber'
import { STATUS_LABELS, formatCurrency } from '@/lib/utils'
import { orderAmount, DONE_STATUSES } from '@/lib/orderMetrics'
import { COMMISSION_ORDER_SELECT, supplierCompanyShare, type CommissionCategory, type CommissionOrder, type SupplierDealRule } from '@/lib/commissions'

// מה הספק העביר לחברה — לפי לקוח. לכל הזמנה של הספק: כמה מגיע לחברה, כמה כבר הועבר עליה ומה נשאר.
// תשלום מהספק משויך להזמנות שהוא מכסה; מה שלא שויך נשאר "זיכוי פתוח" ואפשר לשייך אותו אחר כך.

type Supplier = { id: string; name: string; deal_type: string | null; deal_value: number | null }
type Settlement = { id: string; supplier_id: string; kind: string; amount: number; happened_at: string; note: string | null }
type Allocation = { id: string; settlement_id: string; order_id: string; amount: number }
type Option = { id: string; name: string }

const round2 = (n: number) => Math.round(n * 100) / 100

// צירוף הזמנות שסכום היתרות שלהן שווה בדיוק לסכום (בשקלים שלמים), אם יש
function findExactMatch(items: { id: string; value: number }[], target: number): string[] | null {
  const t = Math.round(target)
  if (t <= 0 || t > 500000 || items.length > 80) return null
  const vals = items.map((i) => Math.round(i.value))
  const from = new Map<number, number>([[0, -1]]) // סכום → אינדקס הפריט האחרון שהוביל אליו
  const prev = new Map<number, number>()
  for (let i = 0; i < vals.length; i++) {
    const sums = Array.from(from.keys())
    for (const sum of sums) {
      const next = sum + vals[i]
      if (next > t || from.has(next)) continue
      from.set(next, i)
      prev.set(next, sum)
      if (next === t) {
        const ids: string[] = []
        let cur = t
        while (cur !== 0) { ids.push(items[from.get(cur)!].id); cur = prev.get(cur)! }
        return ids
      }
    }
  }
  return null
}

export function SupplierRemittances() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<CommissionOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<CommissionCategory[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [dealRules, setDealRules] = useState<SupplierDealRule[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid')
  const [onlyDone, setOnlyDone] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [payment, setPayment] = useState({ amount: '', date: new Date().toLocaleDateString('en-CA'), note: '' })
  const [useCredit, setUseCredit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [o, s, cat, c, st, al] = await Promise.all([
      supabase.from('orders').select(COMMISSION_ORDER_SELECT),
      supabase.from('suppliers').select('id, name, deal_type, deal_value').order('name'),
      supabase.from('categories').select('id, name, all_profit, profit_type, profit_value'),
      supabase.from('cities').select('id, name'),
      supabase.from('supplier_settlements').select('*').order('happened_at'),
      supabase.from('supplier_payment_allocations').select('id, settlement_id, order_id, amount'),
    ])
    const { data: dr } = await supabase.from('supplier_deal_rules').select('supplier_id, name, deal_type, deal_value, deal_unit')
    setDealRules((dr || []) as SupplierDealRule[])
    const cats = new Map(((cat.data || []) as CommissionCategory[]).map((c) => [c.id, c]))
    const changed = await syncProfitStatuses(
      (o.data || []) as unknown as CommissionOrder[], (s.data || []) as Supplier[], (dr || []) as SupplierDealRule[], (al.data || []) as Allocation[], cats,
    )
    if (changed) {
      const { data: fresh } = await supabase.from('orders').select(COMMISSION_ORDER_SELECT)
      setOrders((fresh || []) as unknown as CommissionOrder[])
    }
    setOrders((o.data || []) as unknown as CommissionOrder[])
    setSuppliers((s.data || []) as Supplier[])
    setCategories((cat.data || []) as CommissionCategory[])
    setCities(c.data || [])
    setSettlements((st.data || []) as Settlement[])
    setAllocations((al.data || []) as Allocation[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const supplier = suppliers.find((s) => s.id === supplierId)

  // כמה מגיע לחברה מהזמנה — לפי תנאי ההסכם של הספק (כולל פריטים כמו חלון / דלת), אחרת לפי הרווח
  function companyShare(o: CommissionOrder) {
    return supplierCompanyShare(o, supplier, dealRules, catById)
  }

  // סטטוס אוטומטי: הזמנה "בוצע" שהספק העביר עליה את כל החלק של החברה → "הרווח התקבל".
  // ואם בוטל שיוך והחלק כבר לא שולם במלואו → חוזרת ל"בוצע". רץ אחרי כל טעינה/שמירה.
  async function syncProfitStatuses(
    list: CommissionOrder[], sups: Supplier[], rules: SupplierDealRule[], allocs: Allocation[], cats: Map<string, CommissionCategory>,
  ) {
    const received = new Map<string, number>()
    for (const a of allocs) received.set(a.order_id, (received.get(a.order_id) || 0) + Number(a.amount))
    const toReceived: string[] = []
    const toDone: string[] = []
    for (const o of list) {
      if (!o.supplier_id || !DONE_STATUSES.has(o.status) || orderAmount(o) <= 0) continue
      const share = supplierCompanyShare(o, sups.find((x) => x.id === o.supplier_id), rules, cats)
      const fullyPaid = share > 0 && (received.get(o.id) || 0) >= share - 0.5
      if (o.status === 'done' && fullyPaid) toReceived.push(o.id)
      if (o.status === 'profit_received' && !fullyPaid && (received.get(o.id) || 0) > 0) toDone.push(o.id)
    }
    const now = new Date().toISOString()
    if (toReceived.length) await supabase.from('orders').update({ status: 'profit_received', updated_at: now }).in('id', toReceived).eq('status', 'done')
    if (toDone.length) await supabase.from('orders').update({ status: 'done', updated_at: now }).in('id', toDone).eq('status', 'profit_received')
    return toReceived.length + toDone.length
  }

  const allocatedByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of allocations) m.set(a.order_id, (m.get(a.order_id) || 0) + Number(a.amount))
    return m
  }, [allocations])

  const rows = useMemo(() => {
    if (!supplierId) return []
    return orders
      .filter((o) => o.supplier_id === supplierId && o.status !== 'cancelled' && orderAmount(o) > 0)
      .map((o) => {
        const share = companyShare(o)
        const received = round2(allocatedByOrder.get(o.id) || 0)
        const left = round2(Math.max(0, share - received))
        const state: 'paid' | 'partial' | 'unpaid' = left <= 0.5 ? 'paid' : received > 0 ? 'partial' : 'unpaid'
        return { o, share, received, left, state }
      })
      .sort((a, b) => (a.o.order_number || 0) - (b.o.order_number || 0))
  }, [orders, supplierId, allocatedByOrder, supplier, catById, dealRules])

  const visible = rows.filter((r) =>
    (!onlyDone || DONE_STATUSES.has(r.o.status)) &&
    (filter === 'all' || (filter === 'paid' ? r.state === 'paid' : r.state !== 'paid')))

  // זיכוי פתוח: תשלומים של הספק שלא שויכו במלואם
  const supplierPayments = settlements.filter((x) => x.supplier_id === supplierId && x.kind === 'payment')
  const allocatedBySettlement = (id: string) => allocations.filter((a) => a.settlement_id === id).reduce((s, a) => s + Number(a.amount), 0)
  const openCredit = round2(supplierPayments.reduce((s, p) => s + Number(p.amount) - allocatedBySettlement(p.id), 0))

  const totals = {
    share: rows.reduce((s, r) => s + r.share, 0),
    received: rows.reduce((s, r) => s + r.received, 0),
    left: rows.reduce((s, r) => s + r.left, 0),
  }
  const pickedLeft = round2(rows.filter((r) => picked.has(r.o.id)).reduce((s, r) => s + r.left, 0))
  const available = useCredit ? openCredit : (parseFloat(payment.amount) || 0)

  function suggest() {
    setMsg('')
    const target = available
    const candidates = rows.filter((r) => r.left > 0.5).map((r) => ({ id: r.o.id, value: r.left }))
    const match = findExactMatch(candidates, target)
    if (match) {
      setPicked(new Set(match))
      setMsg(`נמצא צירוף של ${match.length} הזמנות שהיתרות שלהן שוות בדיוק ל-${formatCurrency(target)}. כדאי לוודא מול הספק לפני השמירה.`)
    } else {
      setMsg('לא נמצא צירוף הזמנות שמתאים בדיוק לסכום. כדאי לבקש מהספק פירוט, או לסמן ידנית.')
    }
  }

  async function save() {
    if (picked.size === 0 && !(!useCredit && parseFloat(payment.amount) > 0)) return
    setSaving(true)
    setMsg('')
    // סדר השיוך: ההזמנות שסומנו, לפי מספר הזמנה
    const targets = rows.filter((r) => picked.has(r.o.id) && r.left > 0)
    const newAllocs: { settlement_id: string; order_id: string; amount: number }[] = []
    if (useCredit) {
      // שיוך מתוך זיכוי פתוח — מהתשלום הישן ביותר שיש בו יתרה
      const pools = supplierPayments.map((p) => ({ id: p.id, left: round2(Number(p.amount) - allocatedBySettlement(p.id)) })).filter((p) => p.left > 0)
      for (const t of targets) {
        let need = t.left
        for (const pool of pools) {
          if (need <= 0) break
          const take = round2(Math.min(need, pool.left))
          if (take <= 0) continue
          newAllocs.push({ settlement_id: pool.id, order_id: t.o.id, amount: take })
          pool.left = round2(pool.left - take)
          need = round2(need - take)
        }
      }
    } else {
      const amount = parseFloat(payment.amount) || 0
      const { data: st, error } = await supabase.from('supplier_settlements').insert({
        supplier_id: supplierId, kind: 'payment', amount, happened_at: payment.date, note: payment.note.trim() || null,
      }).select('id').single()
      if (error || !st) { setSaving(false); alert('שמירת התשלום נכשלה'); return }
      let left = amount
      for (const t of targets) {
        if (left <= 0) break
        const take = round2(Math.min(t.left, left))
        newAllocs.push({ settlement_id: st.id, order_id: t.o.id, amount: take })
        left = round2(left - take)
      }
    }
    if (newAllocs.length) {
      const { error } = await supabase.from('supplier_payment_allocations').insert(newAllocs)
      if (error) { setSaving(false); alert('השיוך להזמנות נכשל'); return }
    }
    setSaving(false)
    setPicked(new Set())
    setPayment({ ...payment, amount: '', note: '' })
    setUseCredit(false)
    setMsg(`נשמר: ${newAllocs.length} שיוכים להזמנות.`)
    load()
  }

  async function undoOrder(orderId: string) {
    if (!confirm('לבטל את השיוכים של ההזמנה הזו? הסכום יחזור לזיכוי הפתוח של הספק.')) return
    await supabase.from('supplier_payment_allocations').delete().eq('order_id', orderId).in('settlement_id', supplierPayments.map((p) => p.id))
    load()
  }

  // מחיקת תשלום שנרשם בטעות — מוחקת גם את השיוכים שלו להזמנות (והסטטוסים מתעדכנים בטעינה)
  async function deletePayment(p: Settlement) {
    const linked = allocations.filter((a) => a.settlement_id === p.id).length
    const msgText = `למחוק את התשלום של ${formatCurrency(Number(p.amount))} מ-${p.happened_at.split('-').reverse().join('/')}?` +
      (linked ? `\nהוא משויך ל-${linked} הזמנות — השיוכים יימחקו, וההזמנות יחזרו ל"לא הועבר".` : '')
    if (!confirm(msgText)) return
    // הזמנות שעברו ל"הרווח התקבל" בזכות התשלום הזה חוזרות ל"בוצע"
    const linkedOrders = Array.from(new Set(allocations.filter((a) => a.settlement_id === p.id).map((a) => a.order_id)))
    if (linkedOrders.length) {
      await supabase.from('orders').update({ status: 'done', updated_at: new Date().toISOString() }).in('id', linkedOrders).eq('status', 'profit_received')
    }
    const { error } = await supabase.from('supplier_settlements').delete().eq('id', p.id)
    if (error) { alert('המחיקה נכשלה'); return }
    setMsg('התשלום נמחק.')
    load()
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-blue-600" />

  const suppliersWithOrders = suppliers.filter((s) => orders.some((o) => o.supplier_id === s.id))
  const stateBadge = { paid: ['success', 'הועבר'], partial: ['info', 'חלקי'], unpaid: ['destructive', 'לא הועבר'] } as const
  const cityOf = (o: CommissionOrder) => cities.find((c) => c.id === o.residents?.projects?.city_id)?.name || ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">מה הספק העביר — לפי לקוח</CardTitle>
        <p className="text-xs text-gray-500">בוחרים ספק ורואים על איזה לקוח הוא כבר העביר לחברה את החלק שלה ועל איזה לא. תשלום חדש מהספק משייכים להזמנות שהוא מכסה.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPicked(new Set()); setMsg('') }}>
            <option value="">בחרו ספק</option>
            {suppliersWithOrders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {supplierId && (
            <>
              <select className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                <option value="unpaid">לא הועבר / חלקי</option>
                <option value="paid">הועבר</option>
                <option value="all">הכל</option>
              </select>
              <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={onlyDone} onChange={(e) => setOnlyDone(e.target.checked)} />רק הזמנות שבוצעו</label>
            </>
          )}
        </div>

        {supplierId && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded border p-2"><div className="text-gray-500 text-xs">מגיע לחברה (כל ההזמנות)</div><div className="font-semibold">{formatCurrency(totals.share)}</div></div>
              <div className="rounded border p-2"><div className="text-gray-500 text-xs">הועבר ושויך ללקוחות</div><div className="font-semibold text-green-700">{formatCurrency(totals.received)}</div></div>
              <div className="rounded border p-2"><div className="text-gray-500 text-xs">עוד לא הועבר</div><div className="font-semibold text-red-600">{formatCurrency(totals.left)}</div></div>
              <div className="rounded border p-2"><div className="text-gray-500 text-xs">זיכוי פתוח (שולם ולא שויך)</div><div className={`font-semibold ${openCredit > 0 ? 'text-orange-600' : ''}`}>{formatCurrency(openCredit)}</div></div>
            </div>

            <div className="border rounded-md max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="p-2 text-right">הזמנה</th>
                    <th className="p-2 text-right">לקוח</th>
                    <th className="p-2 text-right">סטטוס</th>
                    <th className="p-2 text-right">מחיר ללקוח</th>
                    <th className="p-2 text-right">מגיע לחברה</th>
                    <th className="p-2 text-right">הועבר</th>
                    <th className="p-2 text-right">נשאר</th>
                    <th className="p-2 text-right">מצב</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={10} className="p-4 text-center text-gray-400">אין הזמנות להצגה</td></tr>
                  ) : visible.map((r) => (
                    <tr key={r.o.id} className={`border-t ${picked.has(r.o.id) ? 'bg-blue-50' : ''}`}>
                      <td className="p-2">
                        {r.state !== 'paid' && (
                          <input type="checkbox" checked={picked.has(r.o.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(r.o.id) ? n.delete(r.o.id) : n.add(r.o.id); return n })} />
                        )}
                      </td>
                      <td className="p-2"><Link href={`/orders/${r.o.id}`} className="hover:text-blue-600"><OrderNumber orderNumber={r.o.order_number} /></Link></td>
                      <td className="p-2">{r.o.residents?.name}<span className="text-xs text-gray-400"> · {cityOf(r.o)}</span></td>
                      <td className="p-2 text-xs text-gray-600">{STATUS_LABELS[r.o.status] || r.o.status}</td>
                      <td className="p-2">{formatCurrency(orderAmount(r.o))}</td>
                      <td className="p-2">{formatCurrency(r.share)}</td>
                      <td className="p-2 text-green-700">{r.received ? formatCurrency(r.received) : '—'}</td>
                      <td className="p-2 font-medium">{r.left ? formatCurrency(r.left) : '—'}</td>
                      <td className="p-2"><Badge variant={stateBadge[r.state][0] as any}>{stateBadge[r.state][1]}</Badge></td>
                      <td className="p-2">
                        {r.received > 0 && <button onClick={() => undoOrder(r.o.id)} className="text-xs text-gray-400 hover:text-red-600">ביטול שיוך</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* רישום תשלום / שיוך */}
            <div className="rounded-md border p-3 space-y-2 bg-gray-50">
              <div className="font-medium text-sm">רישום תשלום מהספק ושיוך ללקוחות</div>
              <div className="flex flex-wrap gap-2 items-center">
                {openCredit > 0 && (
                  <label className="text-sm flex items-center gap-1">
                    <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
                    לשייך מתוך הזיכוי הפתוח ({formatCurrency(openCredit)}) במקום תשלום חדש
                  </label>
                )}
                {!useCredit && (
                  <>
                    <Input type="number" step="any" placeholder="סכום שהתקבל" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} className="w-36 h-9" dir="ltr" />
                    <Input type="date" value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} className="w-40 h-9" dir="ltr" />
                    <Input placeholder="הערה (למשל אסמכתא)" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} className="w-48 h-9" />
                  </>
                )}
                <Button size="sm" variant="outline" onClick={suggest} disabled={available <= 0} title="למצוא הזמנות שהיתרות שלהן מסתכמות בדיוק בסכום">
                  <Wand2 className="h-4 w-4 ml-1" />הצע התאמה
                </Button>
              </div>
              <div className="text-sm text-gray-700">
                סומנו {picked.size} הזמנות · יתרה בהן: <strong>{formatCurrency(pickedLeft)}</strong> · סכום לשיוך: <strong>{formatCurrency(available)}</strong>
                {available > 0 && pickedLeft > 0 && Math.abs(available - pickedLeft) > 0.5 && (
                  <span className="text-orange-700"> · {available > pickedLeft
                    ? `יישאר זיכוי פתוח של ${formatCurrency(available - pickedLeft)}`
                    : `חסרים ${formatCurrency(pickedLeft - available)} — ההזמנה האחרונה תסומן כ"חלקי"`}</span>
                )}
              </div>
              {msg && <p className="text-sm text-blue-800">{msg}</p>}
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving || (useCredit ? picked.size === 0 : !(parseFloat(payment.amount) > 0))}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : useCredit ? 'שייך מהזיכוי' : picked.size ? 'שמור תשלום ושיוך' : 'שמור תשלום (בלי שיוך — כזיכוי פתוח)'}
                </Button>
              </div>
            </div>
            {/* תשלומים שנרשמו מהספק — עם מחיקה */}
            {supplierPayments.length > 0 && (
              <div className="rounded-md border p-3 space-y-1">
                <div className="font-medium text-sm">תשלומים שנרשמו מהספק</div>
                <ul className="divide-y text-sm">
                  {[...supplierPayments].reverse().map((p) => {
                    const used = round2(allocatedBySettlement(p.id))
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span>
                          {p.happened_at.split('-').reverse().join('/')} · <strong>{formatCurrency(Number(p.amount))}</strong>
                          {p.note ? <span className="text-gray-500"> · {p.note}</span> : null}
                          <span className="text-xs text-gray-500"> · שויך {formatCurrency(used)}{Number(p.amount) - used > 0.5 ? ` · פתוח ${formatCurrency(Number(p.amount) - used)}` : ''}</span>
                        </span>
                        <button onClick={() => deletePayment(p)} className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap">מחק תשלום</button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {supplier && !supplier.deal_type && (
              <p className="text-xs text-gray-500">לספק לא הוגדר הסכם, ולכן "מגיע לחברה" מחושב לפי מחיר הלקוח פחות מחיר הספק בכל הזמנה. אפשר להגדיר הסכם במסך ספקים ← ⚙.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
