'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/RoleProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronDown, ChevronUp, Printer } from 'lucide-react'
import { OrderNumber } from '@/components/OrderNumber'
import { formatCurrency } from '@/lib/utils'
import { orderAmount } from '@/lib/orderMetrics'
import {
  COMMISSION_ORDER_SELECT, commissionable, orderCommission,
  type CommissionCategory, type CommissionOrder, type Representative,
} from '@/lib/commissions'

// דוח נציגים: לכל נציג — ההזמנות בעיר שלו, מקובצות לפי ספק ומוצר, עם הסכום, אחוז העמלה וכמה זה יוצא.
// מנהל בלבד.

type Option = { id: string; name: string }

export default function RepresentativesPage() {
  const isAdmin = useIsAdmin()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<CommissionOrder[]>([])
  const [reps, setReps] = useState<Representative[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [categories, setCategories] = useState<CommissionCategory[]>([])
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7))
  const [repFilter, setRepFilter] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    ;(async () => {
      const [o, r, c, s, cat] = await Promise.all([
        supabase.from('orders').select(COMMISSION_ORDER_SELECT),
        supabase.from('representatives').select('*').order('name'),
        supabase.from('cities').select('id, name').order('name'),
        supabase.from('suppliers').select('id, name').order('name'),
        supabase.from('categories').select('id, name, all_profit, profit_type, profit_value').order('name'),
      ])
      setOrders((o.data || []) as unknown as CommissionOrder[])
      setReps((r.data || []) as Representative[])
      setCities(c.data || [])
      setSuppliers(s.data || [])
      setCategories((cat.data || []) as CommissionCategory[])
      setLoading(false)
    })()
  }, [isAdmin])

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const nameOf = (list: Option[], id: string | null) => list.find((x) => x.id === id)?.name || ''

  const report = useMemo(() => {
    const inPeriod = orders.filter((o) => commissionable(o) && (period === 'all' || o.created_at.slice(0, 7) === month))
    return reps
      .filter((rep) => !repFilter || rep.id === repFilter)
      .map((rep) => {
        const sameCity = reps.filter((r) => r.city_id === rep.city_id).length
        const list = inPeriod.filter((o) => o.residents?.projects?.city_id === rep.city_id)
        // קיבוץ לפי ספק + מוצר
        const groups = new Map<string, { supplierId: string | null; categoryId: string | null; rows: { o: CommissionOrder; base: number; rate: number; commission: number; allProfit: boolean }[] }>()
        for (const o of list) {
          const key = `${o.supplier_id || '-'}|${o.category_id || '-'}`
          if (!groups.has(key)) groups.set(key, { supplierId: o.supplier_id, categoryId: o.category_id, rows: [] })
          groups.get(key)!.rows.push({ o, ...orderCommission(o, rep, catById, sameCity) })
        }
        const groupList = Array.from(groups.entries()).map(([key, g]) => ({
          key: `${rep.id}|${key}`,
          ...g,
          count: g.rows.length,
          gross: g.rows.reduce((s, r) => s + orderAmount(r.o), 0),
          base: g.rows.reduce((s, r) => s + r.base, 0),
          commission: g.rows.reduce((s, r) => s + r.commission, 0),
          allProfit: g.rows[0]?.allProfit || false,
          rate: g.rows[0]?.rate || 0,
        })).sort((a, b) => b.gross - a.gross)
        return {
          rep, sameCity, groups: groupList,
          count: list.length,
          gross: groupList.reduce((s, g) => s + g.gross, 0),
          commission: groupList.reduce((s, g) => s + g.commission, 0),
        }
      })
  }, [orders, reps, catById, period, month, repFilter])

  const toggle = (key: string) => setOpen((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n })

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
  if (!isAdmin) return <p className="text-gray-500">המסך הזה זמין למנהלים בלבד.</p>

  const sel = 'h-9 rounded-md border border-gray-200 bg-white px-2 text-sm'
  const total = report.reduce((s, r) => s + r.commission, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">נציגים — דוח עמלות</h1>
          <p className="text-gray-500 mt-1">לכל נציג: ההזמנות בעיר שלו לפי ספק ומוצר, הסכום, אחוז העמלה וכמה זה יוצא</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href="/money"><Button variant="outline">הוספה ועריכת נציגים</Button></Link>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" />הדפסה</Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <select className={sel} value={period} onChange={(e) => setPeriod(e.target.value as 'month' | 'all')}>
            <option value="month">לפי חודש</option>
            <option value="all">כל התקופה</option>
          </select>
          {period === 'month' && <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 h-9" dir="ltr" />}
          <select className={sel} value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
            <option value="">כל הנציגים</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span className="mr-auto font-semibold">סה"כ עמלות: {formatCurrency(total)}</span>
        </CardContent>
      </Card>

      {reps.length === 0 && (
        <Card><CardContent className="p-6 text-gray-500">
          עוד לא הוגדרו נציגים. אפשר להוסיף אותם במסך <Link href="/money" className="text-blue-600 hover:underline">כסף ונציגים</Link> (שם, עיר, טלפון, מייל ואחוז עמלה).
        </CardContent></Card>
      )}

      {report.map(({ rep, sameCity, groups, count, gross, commission }) => (
        <Card key={rep.id} className="break-inside-avoid">
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg">{rep.name} · {nameOf(cities, rep.city_id) || 'ללא עיר'}</CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  {rep.commission_percent}% מהסכום במוצר רגיל · {rep.all_profit_commission_percent}% מהרווח במוצר שכל הרווח שלנו
                  {sameCity > 1 && ` · העמלה מתחלקת בין ${sameCity} נציגים בעיר`}
                </p>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">{count} הזמנות · {formatCurrency(gross)}</p>
                <p className="text-xl font-bold text-green-700">עמלה: {formatCurrency(commission)}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-sm text-gray-400">אין הזמנות בתקופה הזו בעיר של הנציג</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="text-right p-2">ספק</th>
                    <th className="text-right p-2">מוצר</th>
                    <th className="text-right p-2">הזמנות</th>
                    <th className="text-right p-2">סכום ההזמנות</th>
                    <th className="text-right p-2">חישוב</th>
                    <th className="text-right p-2">עמלה</th>
                    <th className="p-2 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="border-b">
                        <td className="p-2 font-medium">{nameOf(suppliers, g.supplierId) || <span className="text-gray-400">לא שויך ספק</span>}</td>
                        <td className="p-2">{catById.get(g.categoryId || '')?.name || '—'}{g.allProfit && <span className="text-xs text-purple-700"> (כל הרווח שלנו)</span>}</td>
                        <td className="p-2">{g.count}</td>
                        <td className="p-2">{formatCurrency(g.gross)}</td>
                        <td className="p-2 text-xs text-gray-600 whitespace-nowrap">
                          {g.allProfit
                            ? `${g.rate}% × רווח ${formatCurrency(g.base)}`
                            : `${g.rate}% × ${formatCurrency(g.gross)}`}
                          {sameCity > 1 && ` ÷ ${sameCity}`}
                        </td>
                        <td className="p-2 font-semibold">{formatCurrency(g.commission)}</td>
                        <td className="p-2 print:hidden">
                          <button onClick={() => toggle(g.key)} className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                            {open.has(g.key) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}פירוט
                          </button>
                        </td>
                      </tr>
                      {open.has(g.key) && g.rows.map(({ o, base, commission: c }) => (
                        <tr key={o.id} className="border-b bg-gray-50/60 text-xs">
                          <td className="p-2 pr-6" colSpan={2}>
                            <Link href={`/orders/${o.id}`} className="hover:text-blue-600 inline-flex items-center gap-1">
                              <OrderNumber orderNumber={o.order_number} /> {o.residents?.name}
                            </Link>
                          </td>
                          <td className="p-2">{o.created_at.slice(0, 10).split('-').reverse().join('/')}</td>
                          <td className="p-2">{formatCurrency(orderAmount(o))}</td>
                          <td className="p-2 text-gray-500">{g.allProfit ? `רווח ${formatCurrency(base)}` : ''}</td>
                          <td className="p-2">{formatCurrency(c)}</td>
                          <td className="print:hidden"></td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr className="font-semibold bg-gray-50">
                    <td className="p-2" colSpan={2}>סה"כ</td>
                    <td className="p-2">{count}</td>
                    <td className="p-2">{formatCurrency(gross)}</td>
                    <td></td>
                    <td className="p-2 text-green-700">{formatCurrency(commission)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-gray-500">
        נספרות הזמנות שלא בוטלו ויש להן מחיר, לפי תאריך פתיחת ההזמנה, בעיר של הנציג.
        <strong className="text-orange-700"> לזכור: להוריד ידנית מהעמלה את חלק הנציג בהוצאות הפרסום (ברכסים).</strong>
      </p>
    </div>
  )
}
