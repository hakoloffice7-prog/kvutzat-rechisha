'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertTriangle, Clock } from 'lucide-react'
import { OrderNumber } from '@/components/OrderNumber'
import { RemindersPanel } from '@/components/RemindersPanel'
import { STATUS_LABELS, formatCurrency, formatStatusDate } from '@/lib/utils'
import {
  AWAITING_STATUSES, STUCK_DAYS, VERY_STUCK_DAYS, DEFAULT_SUPPLIER_MIN, isOpen, isStuck, lastUpdated, daysSince,
  orderAmount, orderBalance, payState, isScheduledThisWeek, isValidIsraeliPhone,
} from '@/lib/orderMetrics'

// לוח פעולה (מפרט, סעיף 2): מה צריך לעשות היום — מספרים לחיצים, תזכורות,
// ממתינים לפי עיר × מוצר, הזמנות תקועות, ו"דברים לבדוק".

type Order = {
  id: string
  order_number: number | null
  status: string
  category_id: string | null
  supplier_id: string | null
  total_price: number | null
  is_global_price: boolean | null
  updated_at: string | null
  status_updated_at: string | null
  created_at: string
  measured_at: string | null
  installation_planned_date: string | null
  residents: { id: string; name: string; projects: { city_id: string } | null } | null
  categories: { name: string } | null
  order_payments: { amount: number | null }[]
  order_items: { customer_price: number | null }[]
}
type Resident = {
  id: string
  name: string
  phone: string | null
  phone2: string | null
  address: string | null
  floor: string | null
  apartment: string | null
  projects: { city_id: string } | null
}
type Option = { id: string; name: string }
type SupplierMin = { supplier_id: string; city_id: string; min_orders: number }
type Supplier = { id: string; category_id: string | null }

export function ActionBoard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [mins, setMins] = useState<SupplierMin[]>([])

  useEffect(() => {
    ;(async () => {
      const [o, r, c, cat, s, m] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, status, category_id, supplier_id, total_price, is_global_price, updated_at, status_updated_at, created_at, measured_at, installation_planned_date, residents(id, name, projects(city_id)), categories(name), order_payments(amount), order_items(customer_price)'),
        supabase.from('residents').select('*, projects(city_id)'),
        supabase.from('cities').select('id, name').order('name'),
        supabase.from('categories').select('*').order('name'),
        supabase.from('suppliers').select('id, category_id'),
        supabase.from('supplier_city_settings').select('supplier_id, city_id, min_orders'),
      ])
      setOrders((o.data || []) as unknown as Order[])
      setResidents((r.data || []) as unknown as Resident[])
      setCities(c.data || [])
      // אנשי צוות (מעצבת / מתכנת) אינם מוצרים — לא נספרים בלוח
      setCategories(((cat.data || []) as any[]).filter((x) => x.kind !== 'staff'))
      setSuppliers((s.data || []) as Supplier[])
      setMins(((m.data as SupplierMin[]) || []))
      setLoading(false)
    })()
  }, [])

  const productIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories])

  const stats = useMemo(() => {
    const open = orders.filter(isOpen)
    const stuck = open.filter(isStuck).sort((a, b) => lastUpdated(a).localeCompare(lastUpdated(b)))
    const debt = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + orderBalance(o), 0)
    const week = orders.filter(isScheduledThisWeek)
    const missingAddress = residents.filter((r) => !r.address || !r.floor || !r.apartment)
    return { open, stuck, debt, week, missingAddress }
  }, [orders, residents])

  // ממתינים לפי עיר × מוצר
  const grid = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (const o of orders) {
      if (!AWAITING_STATUSES.has(o.status) || !o.category_id || !productIds.has(o.category_id)) continue
      const city = o.residents?.projects?.city_id
      if (!city) continue
      counts[city] = counts[city] || {}
      counts[city][o.category_id] = (counts[city][o.category_id] || 0) + 1
    }
    const usedCats = categories.filter((c) => cities.some((ci) => counts[ci.id]?.[c.id]))
    return { counts, usedCats }
  }, [orders, categories, cities, productIds])

  // המינימום לעיר ומוצר: הנמוך מבין הספקים של המוצר (ספק שכבר משתלם לו להגיע), ברירת מחדל 5
  function minFor(cityId: string, categoryId: string) {
    const sups = suppliers.filter((s) => s.category_id === categoryId).map((s) => s.id)
    const values = mins.filter((m) => m.city_id === cityId && sups.includes(m.supplier_id)).map((m) => m.min_orders)
    return values.length ? Math.min(...values) : DEFAULT_SUPPLIER_MIN
  }

  // דברים לבדוק
  const checks = useMemo(() => {
    const items: { key: string; label: string; href: string; tag: string }[] = []
    for (const o of orders) {
      const who = `${o.residents?.name || 'לא ידוע'} · ${o.categories?.name || 'ללא מוצר'}`
      const href = `/orders/${o.id}`
      if (payState(o) === 'paid' && o.status === 'interested') items.push({ key: o.id + 'a', label: who, href, tag: 'שולם הכל אבל עדיין "מעוניין"' })
      if (o.status === 'done' && orderBalance(o) > 0) items.push({ key: o.id + 'b', label: `${who} · ${formatCurrency(orderBalance(o))}`, href, tag: 'בוצע ונשאר לגבות' })
      if (o.status === 'done' && !orderAmount(o)) items.push({ key: o.id + 'c', label: who, href, tag: 'בוצע בלי מחיר' })
      if (!o.category_id) items.push({ key: o.id + 'd', label: who, href, tag: 'הזמנה בלי מוצר' })
    }
    const byName: Record<string, Resident[]> = {}
    for (const r of residents) {
      const bad = [r.phone, r.phone2].filter((p) => p && p.trim()).some((p) => !isValidIsraeliPhone(p))
      if (bad) items.push({ key: r.id + 'p', label: `${r.name} · ${[r.phone, r.phone2].filter(Boolean).join(' / ')}`, href: `/residents/${r.id}`, tag: 'טלפון לא תקין' })
      const n = r.name.trim()
      byName[n] = byName[n] || []
      byName[n].push(r)
    }
    for (const [name, list] of Object.entries(byName)) {
      if (list.length > 1) items.push({ key: 'dup' + name, label: `${name} (${list.length} פעמים)`, href: `/residents?search=${encodeURIComponent(name)}`, tag: 'דייר כפול?' })
    }
    return items
  }, [orders, residents])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const tile = 'rounded-lg border bg-white p-4 hover:shadow-md hover:border-blue-300 transition block'

  return (
    <div className="space-y-6">
      {/* שורת מספרים */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link href="/orders?status=g:open" className={tile}>
          <p className="text-sm text-gray-500">הזמנות פתוחות</p>
          <p className="text-2xl font-bold text-gray-900">{stats.open.length}</p>
        </Link>
        <Link href="/orders?status=g:stuck" className={tile}>
          <p className="text-sm text-gray-500">תקועות (מעל {STUCK_DAYS} ימים)</p>
          <p className={`text-2xl font-bold ${stats.stuck.length ? 'text-orange-600' : 'text-gray-900'}`}>{stats.stuck.length}</p>
        </Link>
        <Link href="/orders?pay=g:debt" className={tile}>
          <p className="text-sm text-gray-500">כסף שלא נגבה</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.debt)}</p>
        </Link>
        <Link href="/orders?status=g:week" className={tile}>
          <p className="text-sm text-gray-500">מדידות והתקנות ב-7 ימים</p>
          <p className="text-2xl font-bold text-gray-900">{stats.week.length}</p>
        </Link>
        <Link href="/residents?missing=address" className={tile}>
          <p className="text-sm text-gray-500">דיירים בלי כתובת / קומה / דירה</p>
          <p className="text-2xl font-bold text-gray-900">{stats.missingAddress.length}</p>
        </Link>
      </div>

      {/* תזכורות פתוחות */}
      <RemindersPanel title="תזכורות פתוחות" />

      {/* ממתינים לפי עיר × מוצר */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ממתינים לתיאום — לפי עיר ומוצר</CardTitle>
          <p className="text-xs text-gray-500">
            נספרים "מעוניין", "ממתין לבחירת צורה ודגם" ו"אושר צורה ודגם". ירוק = הגיע למינימום של הספק בעיר — זמן להתקשר ולתאם יום.
          </p>
        </CardHeader>
        <CardContent>
          {grid.usedCats.length === 0 ? (
            <p className="text-gray-400 text-sm">אין כרגע הזמנות שממתינות לתיאום</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="text-right py-2 px-3 font-medium">עיר</th>
                    {grid.usedCats.map((c) => <th key={c.id} className="py-2 px-3 font-medium text-center whitespace-nowrap">{c.name}</th>)}
                    <th className="py-2 px-3 font-medium text-center">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((city) => {
                    const row = grid.counts[city.id] || {}
                    const total = Object.values(row).reduce((a, b) => a + b, 0)
                    return (
                      <tr key={city.id} className="border-b">
                        <td className="py-2 px-3 font-medium whitespace-nowrap">{city.name}</td>
                        {grid.usedCats.map((c) => {
                          const n = row[c.id] || 0
                          const min = minFor(city.id, c.id)
                          const ready = n > 0 && n >= min
                          return (
                            <td key={c.id} className="py-1 px-1 text-center">
                              {n > 0 ? (
                                <Link
                                  href={`/orders?city=${city.id}&category=${c.id}&status=g:awaiting`}
                                  className={`block rounded px-2 py-1 font-medium ${ready ? 'bg-green-500 text-white hover:bg-green-600' : 'hover:bg-gray-100 text-gray-800'}`}
                                  title={`${n} ממתינות · מינימום ${min}`}
                                >
                                  {n}
                                </Link>
                              ) : <span className="text-gray-300">·</span>}
                            </td>
                          )
                        })}
                        <td className="py-2 px-3 text-center font-semibold">{total || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* הזמנות תקועות */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-orange-500" />הזמנות תקועות</CardTitle>
            <Link href="/orders?status=g:stuck" className="text-sm text-blue-600 hover:underline">לכל הרשימה ({stats.stuck.length})</Link>
          </CardHeader>
          <CardContent>
            {stats.stuck.length === 0 ? (
              <p className="text-gray-400 text-sm">אין הזמנות תקועות 👍</p>
            ) : (
              <ul className="divide-y">
                {stats.stuck.slice(0, 10).map((o) => {
                  const days = daysSince(lastUpdated(o))
                  return (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 px-1 rounded">
                        <span className="flex items-center gap-2 min-w-0">
                          <OrderNumber orderNumber={o.order_number} />
                          <span className="truncate">{o.residents?.name} · {o.categories?.name}</span>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{STATUS_LABELS[o.status] || o.status}</span>
                        </span>
                        <span className={`text-sm font-medium whitespace-nowrap ${days > VERY_STUCK_DAYS ? 'text-red-600' : 'text-orange-600'}`}>
                          {days} ימים
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* דברים לבדוק */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />דברים לבדוק ({checks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {checks.length === 0 ? (
              <p className="text-gray-400 text-sm">הכל מסתדר 👍</p>
            ) : (
              <ul className="divide-y max-h-96 overflow-y-auto">
                {checks.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="flex items-center justify-between gap-2 py-2 hover:bg-gray-50 px-1 rounded">
                      <span className="truncate text-gray-800">{c.label}</span>
                      <span className="text-xs rounded bg-yellow-100 text-yellow-800 px-2 py-0.5 whitespace-nowrap">{c.tag}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-gray-400">עודכן: {formatStatusDate(new Date().toISOString())}</p>
    </div>
  )
}
