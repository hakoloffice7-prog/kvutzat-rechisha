'use client'

import { EmailLink } from '@/components/EmailLink'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Loader2, Search, X, Mail } from 'lucide-react'
import { OrderNumber } from '@/components/OrderNumber'
import { ClickToCallButton } from '@/components/ClickToCallButton'
import { saveNavList } from '@/components/PrevNextNav'
import { ImportRegistrantsDialog } from '@/components/ImportRegistrantsDialog'
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_ORDER, formatCurrency, formatStatusDate, digitsOnly, phoneSearchDigits, fullAddress, missingAddressParts,
} from '@/lib/utils'
import {
  CLOSED_STATUSES as CLOSED, AWAITING_STATUSES as AWAITING, STUCK_DAYS, VERY_STUCK_DAYS, PAY_LABELS, PAY_COLORS,
  type PayState, stampsMeasuredDate, orderAmount, orderBalance, payState, lastUpdated, daysSince, scheduledDate, isScheduledThisWeek,
} from '@/lib/orderMetrics'

// מסך ההזמנות (שלב א' במפרט): טבלה מלאה עם טלפון, כתובת, עיר/פרויקט, ספק, עדכון אחרון,
// תשלום והערות, סינונים לפי עיר/פרויקט/מוצר/סטטוס/תשלום, חיפוש, מיון ושינוי סטטוס לכמה הזמנות יחד.

type Order = {
  id: string
  order_number: number | null
  status: string
  status_updated_at: string | null
  updated_at: string | null
  created_at: string
  total_price: number | null
  is_global_price: boolean | null
  measured_at: string | null
  installation_planned_date: string | null
  notes: string | null
  category_id: string | null
  supplier_id: string | null
  residents: {
    id: string
    name: string
    phone: string | null
    phone2: string | null
    email: string | null
    address: string | null
    floor: string | null
    apartment: string | null
    projects: { id: string; name: string; city_id: string; cities: { id: string; name: string } | null } | null
  } | null
  categories: { id: string; name: string } | null
  suppliers: { id: string; name: string } | null
  order_payments: { amount: number | null }[]
  order_items: { customer_price: number | null }[]
}

type Option = { id: string; name: string }
type Project = Option & { city_id: string }

const STATUS_GROUPS: { value: string; label: string }[] = [
  { value: 'g:open', label: 'כל הפתוחות' },
  { value: 'g:awaiting', label: 'ממתינות לתיאום' },
  { value: 'g:stuck', label: `תקועות מעל ${STUCK_DAYS} ימים` },
  { value: 'g:week', label: 'מדידה/התקנה ב-7 הימים הקרובים' },
]

type SortKey = 'stale' | 'recent' | 'number' | 'amount'
const SORT_LABELS: Record<SortKey, string> = {
  stale: 'עודכן הכי מזמן',
  recent: 'עודכן לאחרונה',
  number: 'מספר הזמנה',
  amount: 'סכום (גבוה לנמוך)',
}

type Filters = { city: string; project: string; category: string; status: string; pay: string; search: string; sort: SortKey }
const EMPTY_FILTERS: Filters = { city: '', project: '', category: '', status: '', pay: '', search: '', sort: 'stale' }
const FILTERS_KEY = 'ordersFilters'

function noteLines(notes: string | null) {
  return (notes || '').split('\n').map((l) => l.trim()).filter(Boolean)
}

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // הזמנות עם תזכורת פתוחה — מסומנות בפעמון בעמודת ההערות
  const [remindedOrders, setRemindedOrders] = useState<Set<string>>(new Set())

  // הסינונים נשמרים לחלון הנוכחי, כדי שחזרה מהזמנה תחזיר לאותה רשימה
  // קישור מלוח הפעולה (למשל ?city=..&category=..&status=g:awaiting) גובר על הסינון השמור
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const keys: (keyof Filters)[] = ['city', 'project', 'category', 'status', 'pay', 'search']
    if (keys.some((k) => params.has(k))) {
      const next: Filters = { ...EMPTY_FILTERS }
      for (const k of keys) if (params.has(k)) (next as any)[k] = params.get(k) || ''
      setFilters(next)
      return
    }
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY)
      if (raw) setFilters({ ...EMPTY_FILTERS, ...JSON.parse(raw) })
    } catch {}
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)) } catch {}
  }, [filters])

  async function fetchAll() {
    const [{ data: ordersData }, { data: citiesData }, { data: projectsData }, { data: catsData }] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, order_number, status, status_updated_at, updated_at, created_at, total_price, is_global_price, measured_at, installation_planned_date, notes, category_id, supplier_id, ' +
          'residents(id, name, phone, phone2, email, address, floor, apartment, projects(id, name, city_id, cities(id, name))), categories(id, name), suppliers(id, name), order_payments(amount), order_items(customer_price)'
        ),
      supabase.from('cities').select('id, name').order('name'),
      supabase.from('projects').select('id, name, city_id').order('name'),
      supabase.from('categories').select('id, name, kind').order('name'),
    ])
    const { data: rem } = await supabase
      .from('notifications')
      .select('order_id')
      .in('type', ['manual_reminder', 'advance_reminder'])
      .eq('is_read', false)
      .not('order_id', 'is', null)
    setRemindedOrders(new Set((rem || []).map((r: any) => r.order_id)))
    setOrders((ordersData || []) as unknown as Order[])
    setCities(citiesData || [])
    setProjects((projectsData || []) as Project[])
    setCategories(((catsData || []) as any[]).filter((c) => c.kind !== 'staff'))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  const filtered = useMemo(() => {
    const term = filters.search.trim().replace(/^#/, '')
    const termDigits = phoneSearchDigits(term)
    const list = orders.filter((o) => {
      const proj = o.residents?.projects
      if (filters.city && proj?.city_id !== filters.city) return false
      if (filters.project && proj?.id !== filters.project) return false
      if (filters.category && o.category_id !== filters.category) return false
      if (filters.status) {
        if (filters.status === 'g:open' && CLOSED.has(o.status)) return false
        if (filters.status === 'g:awaiting' && !AWAITING.has(o.status)) return false
        if (filters.status === 'g:stuck' && (CLOSED.has(o.status) || daysSince(lastUpdated(o)) <= STUCK_DAYS)) return false
        if (filters.status === 'g:week' && !isScheduledThisWeek(o)) return false
        if (!filters.status.startsWith('g:') && o.status !== filters.status) return false
      }
      if (filters.pay === 'g:debt') {
        if (o.status === 'cancelled' || orderBalance(o) <= 0) return false
      } else if (filters.pay && payState(o) !== filters.pay) return false
      if (term) {
        // שם, מספר הזמנה, טלפון (עם/בלי מקף), כתובת, או מילה מתוך ההערות
        const r = o.residents
        const phones = [r?.phone, r?.phone2].filter(Boolean).map((p) => digitsOnly(p!))
        const hit =
          (r?.name || '').includes(term) ||
          String(o.order_number ?? '') === term ||
          (termDigits.length >= 3 && phones.some((p) => p.includes(termDigits))) ||
          (r?.address || '').includes(term) ||
          (r?.email || '').toLowerCase().includes(term.toLowerCase()) ||
          (o.notes || '').includes(term)
        if (!hit) return false
      }
      return true
    })
    const sorted = [...list]
    if (filters.sort === 'stale') sorted.sort((a, b) => lastUpdated(a).localeCompare(lastUpdated(b)))
    if (filters.sort === 'recent') sorted.sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a)))
    if (filters.sort === 'number') sorted.sort((a, b) => (b.order_number || 0) - (a.order_number || 0))
    if (filters.sort === 'amount') sorted.sort((a, b) => orderAmount(b) - orderAmount(a))
    return sorted
  }, [orders, filters])

  const totalAmount = filtered.reduce((s, o) => s + orderAmount(o), 0)
  const visibleProjects = filters.city ? projects.filter((p) => p.city_id === filters.city) : projects
  const anyFilter = JSON.stringify({ ...filters, sort: 'stale' }) !== JSON.stringify(EMPTY_FILTERS)
  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id))

  function openOrder(id: string) {
    saveNavList('orders', filtered.map((o) => o.id), '/orders')
    router.push(`/orders/${id}?from=${encodeURIComponent('/orders')}`)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyBulkStatus() {
    const ids = filtered.filter((o) => selected.has(o.id)).map((o) => o.id)
    if (!bulkStatus || ids.length === 0) return
    if (!confirm(`לשנות ${ids.length} הזמנות לסטטוס "${STATUS_LABELS[bulkStatus]}"?`)) return
    setBulkSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: bulkStatus, updated_at: new Date().toISOString() })
      .in('id', ids)
    if (!error) {
      // סורגים בלי תאריך מדידה: תאריך היום
      const stampIds = filtered
        .filter((o) => selected.has(o.id) && !o.measured_at && stampsMeasuredDate(o.categories?.name, bulkStatus))
        .map((o) => o.id)
      if (stampIds.length) {
        await supabase.from('orders').update({ measured_at: new Date().toLocaleDateString('en-CA') }).in('id', stampIds).is('measured_at', null)
      }
    }
    setBulkSaving(false)
    if (error) {
      alert('שגיאה בעדכון הסטטוס')
      return
    }
    setSelected(new Set())
    setBulkStatus('')
    fetchAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const selectClass = 'h-9 rounded-md border border-gray-200 bg-white px-2 text-sm'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">הזמנות</h1>
          <p className="text-gray-500 mt-1">{orders.length} הזמנות במערכת</p>
        </div>
        <Button onClick={() => setImportOpen(true)}>+ הוסף הזמנות / קליטת נרשמים</Button>
      </div>
      <ImportRegistrantsDialog open={importOpen} onOpenChange={setImportOpen} onDone={fetchAll} />

      {/* סינונים */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="שם, מספר הזמנה, טלפון, רחוב או מילה מההערות"
                value={filters.search}
                onChange={(e) => set({ search: e.target.value })}
                className="pr-9"
              />
            </div>
            <select className={selectClass} value={filters.city} onChange={(e) => set({ city: e.target.value, project: '' })}>
              <option value="">כל הערים</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={selectClass} value={filters.project} onChange={(e) => set({ project: e.target.value })}>
              <option value="">כל הפרויקטים</option>
              {visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={selectClass} value={filters.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">כל המוצרים</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={selectClass} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">כל הסטטוסים</option>
              <optgroup label="קבוצות">
                {STATUS_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </optgroup>
              <optgroup label="סטטוס">
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </optgroup>
            </select>
            <select className={selectClass} value={filters.pay} onChange={(e) => set({ pay: e.target.value })}>
              <option value="">כל מצבי התשלום</option>
              <option value="g:debt">יש יתרה לגבות</option>
              {(Object.keys(PAY_LABELS) as PayState[]).map((k) => <option key={k} value={k}>{PAY_LABELS[k]}</option>)}
            </select>
            <select className={selectClass} value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} title="מיון">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>מיון: {SORT_LABELS[k]}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input type="checkbox" checked={showAllNotes} onChange={(e) => setShowAllNotes(e.target.checked)} />
              הצג את כל ההערות
            </label>
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                <X className="h-4 w-4 ml-1" />
                נקה סינון
              </Button>
            )}
          </div>

          {/* פעולה על כמה הזמנות יחד */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-2 text-sm">
              <span className="font-medium text-blue-900">{selected.size} מסומנות</span>
              <select className={selectClass} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                <option value="">שנה סטטוס ל...</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <Button size="sm" onClick={applyBulkStatus} disabled={!bulkStatus || bulkSaving}>
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'עדכן'}
              </Button>
              {(() => {
                // "קבע יום ביומן": רק כשכל המסומנות מאותו מוצר ואותה עיר
                const sel = filtered.filter((o) => selected.has(o.id))
                const cats = new Set(sel.map((o) => o.category_id))
                const cits = new Set(sel.map((o) => o.residents?.projects?.city_id))
                const ok = sel.length > 0 && cats.size === 1 && cits.size === 1 && !cats.has(null) && !cits.has(undefined)
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ok}
                    title={ok ? 'פתיחת קביעת יום ביומן עם ההזמנות המסומנות' : 'אפשר רק כשכל המסומנות מאותו מוצר ואותה עיר'}
                    onClick={() => router.push(`/calendar?new=1&category=${sel[0].category_id}&city=${sel[0].residents?.projects?.city_id}&orders=${sel.map((o) => o.id).join(',')}`)}
                  >
                    קבע יום ביומן
                  </Button>
                )
              })()}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>בטל סימון</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">לא נמצאו הזמנות</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((o) => o.id)))}
                        title="סמן הכל"
                      />
                    </th>
                    <th className="text-right py-3 px-3 font-medium">מס׳</th>
                    <th className="text-right py-3 px-3 font-medium">דייר</th>
                    <th className="text-right py-3 px-3 font-medium">טלפון</th>
                    <th className="text-right py-3 px-3 font-medium">כתובת</th>
                    <th className="text-right py-3 px-3 font-medium">עיר ופרויקט</th>
                    <th className="text-right py-3 px-3 font-medium">מוצר</th>
                    <th className="text-right py-3 px-3 font-medium">ספק</th>
                    <th className="text-right py-3 px-3 font-medium">סטטוס</th>
                    <th className="text-right py-3 px-3 font-medium">עודכן</th>
                    <th className="text-right py-3 px-3 font-medium">סכום</th>
                    <th className="text-right py-3 px-3 font-medium">תשלום</th>
                    <th className="text-right py-3 px-3 font-medium">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const r = o.residents
                    const proj = r?.projects
                    const updated = lastUpdated(o)
                    const days = daysSince(updated)
                    const open = !CLOSED.has(o.status)
                    const daysClass = open && days > VERY_STUCK_DAYS ? 'text-red-600 font-medium' : open && days > STUCK_DAYS ? 'text-orange-600 font-medium' : 'text-gray-400'
                    const ps = payState(o)
                    const amount = orderAmount(o)
                    const notes = noteLines(o.notes)
                    const sched = scheduledDate(o)
                    return (
                      <tr
                        key={o.id}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button, a, select, input, textarea, label')) return
                          if (window.getSelection()?.toString()) return
                          openOrder(o.id)
                        }}
                        className={`border-b hover:bg-gray-50 cursor-pointer align-top ${selected.has(o.id) ? 'bg-blue-50/50' : ''}`}
                        title="לחץ לפתיחת ההזמנה"
                      >
                        <td className="py-3 px-3">
                          <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap"><OrderNumber orderNumber={o.order_number} /></td>
                        <td className="py-3 px-3 font-medium text-gray-900">{r?.name || 'לא ידוע'}</td>
                        <td className="py-3 px-3">
                          {r?.phone || r?.phone2 ? (
                            <div className="space-y-1">
                              {[r?.phone, r?.phone2].filter(Boolean).map((ph, i) => (
                                <div key={i} className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="text-gray-600" dir="ltr">{ph}</span>
                                  <ClickToCallButton phone={ph!} name={r?.name} className="p-1" />
                                </div>
                              ))}
                            </div>
                          ) : !r?.email && <span className="text-gray-400">—</span>}
                          {r?.email && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap mt-1">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <EmailLink email={r!.email!} />
                                  
                                </div>
                              )}
                        </td>
                        <td className="py-3 px-3 text-gray-600 max-w-[180px]">
                          {r?.address && <div>{fullAddress(r)}</div>}
                          {missingAddressParts(r).length > 0 && (
                            <span className="text-xs rounded bg-orange-100 text-orange-700 px-1.5 py-0.5 whitespace-nowrap">
                              {r?.address ? missingAddressParts(r).map((m) => `${m}?`).join(' ') : 'חסרה כתובת'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                          <div>{proj?.cities?.name || '—'}</div>
                          {proj?.name && <div className="text-xs text-gray-400">{proj.name}</div>}
                        </td>
                        <td className="py-3 px-3 text-gray-700 whitespace-nowrap">
                          {o.categories?.name || <span className="text-xs rounded bg-orange-100 text-orange-700 px-1.5 py-0.5">אין מוצר</span>}
                        </td>
                        <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                          {o.suppliers?.name || <span className="text-xs rounded bg-orange-100 text-orange-700 px-1.5 py-0.5">אין ספק</span>}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge variant={(STATUS_COLORS[o.status] || 'outline') as any}>{STATUS_LABELS[o.status] || o.status}</Badge>
                          {sched && <div className="text-[11px] text-gray-500 mt-0.5">ביומן: {formatStatusDate(sched + 'T00:00:00')}</div>}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-gray-600">{formatStatusDate(updated)}</div>
                          <div className={`text-[11px] ${daysClass}`}>{days === 0 ? 'היום' : `לפני ${days} ימים`}</div>
                        </td>
                        <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{amount ? formatCurrency(amount) : '—'}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge variant={PAY_COLORS[ps] as any}>{PAY_LABELS[ps]}</Badge>
                        </td>
                        <td className={`py-3 px-3 text-gray-600 ${showAllNotes ? 'min-w-[260px]' : 'max-w-[220px]'}`}>
                          {remindedOrders.has(o.id) && <span title="יש תזכורת פתוחה" className="ml-1">🔔</span>}
                          {notes.length > 0 ? (
                            showAllNotes ? (
                              <ul className="space-y-0.5 text-xs">
                                {notes.map((n, i) => <li key={i}>{n}</li>)}
                              </ul>
                            ) : (
                              <div className="inline">
                                <div className="truncate" title={notes.join('\n')}>{notes[notes.length - 1]}</div>
                                {notes.length > 1 && <div className="text-[11px] text-gray-400">+ עוד {notes.length - 1}</div>}
                              </div>
                            )
                          ) : !remindedOrders.has(o.id) && <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-medium text-gray-700">
                    <td colSpan={10} className="py-3 px-3">{filtered.length} הזמנות{anyFilter ? ` (מתוך ${orders.length})` : ''}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{formatCurrency(totalAmount)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
