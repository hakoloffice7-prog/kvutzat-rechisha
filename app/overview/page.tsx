'use client'

import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, BarChart2, Phone, MapPin } from 'lucide-react'
import Link from 'next/link'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, getDebtStatus, type DebtStatus } from '@/lib/utils'

// ערכי "סינטינל" לבחירת "כל הערים" / "כל הפרויקטים" בבוררים, כדי לאפשר
// תצוגה חוצת ערים/פרויקטים (למשל כל מי שרוצה וילונות, מכל המערכת)
const ALL_CITIES = '__ALL_CITIES__'
const ALL_PROJECTS = '__ALL_PROJECTS__'

type City = { id: string; name: string }
type Project = { id: string; city_id: string; name: string }
type Category = { id: string; name: string }

type Resident = {
  id: string
  name: string
  phone: string
  address: string
  project_id: string
  projects: { name: string; cities: { name: string } } | null
}

type Order = {
  id: string
  resident_id: string
  category_id: string
  status: string
  payment_status: string
  measured_at: string | null
  total_price: number | null
  notes: string | null
  measurements: string | null
  details: Record<string, string> | null
  order_payments: { amount: number }[]
  order_items: { description: string; model: string }[]
}

type ResidentRow = {
  resident: Resident
  order: Order | null
}

type StatusValue = typeof STATUS_ORDER[number]
type PaymentStatusFilter = 'all' | DebtStatus

const PAYMENT_STATUS_FILTER_OPTIONS: { value: PaymentStatusFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'not_paid', label: PAYMENT_STATUS_LABELS.not_paid },
  { value: 'partial', label: PAYMENT_STATUS_LABELS.partial },
  { value: 'paid_full', label: PAYMENT_STATUS_LABELS.paid_full },
]

// סטטוס התשלום מחושב תמיד מחדש ממחיר ותשלומים בפועל, ולא נלקח מהעמודה
// השמורה (order.payment_status) — היא יכולה להתיישן אם ההזמנה לא נשמרה מחדש.
function getEffectivePaymentStatus(order: Order) {
  const totalPaid = (order.order_payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
  return getDebtStatus(order.total_price || 0, totalPaid)
}

const STATUS_FILTER_OPTIONS: { value: StatusValue; label: string }[] =
  STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))

const STATUS_FILTER_VALUES = new Set<string>(STATUS_ORDER)
const PAYMENT_STATUS_FILTER_VALUES = new Set<string>(['all', 'not_paid', 'partial', 'paid_full'])

const TILE_COLOR: Record<string, string> = {
  interested: 'text-blue-600',
  measurement_scheduled: 'text-blue-600',
  measured: 'text-blue-600',
  quoted: 'text-yellow-600',
  delivery_scheduled: 'text-blue-600',
  done: 'text-green-600',
  cancelled: 'text-red-600',
}

export default function OverviewPage() {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // הפילטרים נשמרים ב-URL (לא רק ב-state) כדי שכפתור "חזור" בדפדפן (למשל
  // מתוך עמוד דייר) יחזיר את המסך הזה מדויק כמו שהיה, גם אם הוא נטען מחדש
  const initialCityId = searchParams.get('city') || ''
  const initialProjectId = searchParams.get('project') || ''
  const initialCategoryId = searchParams.get('category') || ''
  const initialStatusFilters = (searchParams.get('status') || '')
    .split(',')
    .filter((s) => STATUS_FILTER_VALUES.has(s)) as StatusValue[]
  const initialPaymentParam = searchParams.get('payment') || 'all'
  const initialPaymentStatusFilter = (PAYMENT_STATUS_FILTER_VALUES.has(initialPaymentParam) ? initialPaymentParam : 'all') as PaymentStatusFilter
  const initialMeasuredDateFilter = searchParams.get('measuredDate') || ''

  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const pendingProjectIdRef = useRef(initialProjectId)

  const [selectedCityId, setSelectedCityId] = useState(initialCityId)
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId)
  const [statusFilters, setStatusFilters] = useState<StatusValue[]>(initialStatusFilters)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>(initialPaymentStatusFilter)
  const [measuredDateFilter, setMeasuredDateFilter] = useState(initialMeasuredDateFilter)

  const [residents, setResidents] = useState<Resident[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [expandedResidentId, setExpandedResidentId] = useState<string>('')

  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  // Load cities + categories on mount
  useEffect(() => {
    async function init() {
      const [{ data: citiesData }, { data: catsData }] = await Promise.all([
        supabase.from('cities').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name'),
      ])
      setCities(citiesData || [])
      setCategories(catsData || [])
      setLoadingInit(false)
    }
    init()
  }, [])

  // Load projects when city changes (או את כל הפרויקטים מכל הערים אם נבחר
  // "כל הערים"); משחזר את הפרויקט שהגיע מה-URL (בטעינה ראשונה) אם הוא באמת
  // שייך לרשימה, אחרת מנקה אותו
  useEffect(() => {
    if (!selectedCityId) {
      setProjects([])
      setSelectedProjectId('')
      return
    }
    const query = supabase.from('projects').select('id, city_id, name').order('name')
    const scoped = selectedCityId === ALL_CITIES ? query : query.eq('city_id', selectedCityId)
    scoped.then(({ data }) => {
      const projectsData = data || []
      setProjects(projectsData)
      const pending = pendingProjectIdRef.current
      if (pending && (pending === ALL_PROJECTS || projectsData.some((p) => p.id === pending))) {
        setSelectedProjectId(pending)
      } else {
        setSelectedProjectId('')
      }
      pendingProjectIdRef.current = ''
    })
  }, [selectedCityId])

  // Keep the current filters reflected in the URL (replacing, not pushing, so
  // it doesn't pollute browser history) so that navigating back to this page
  // restores the exact same filters instead of resetting them
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedCityId) params.set('city', selectedCityId)
    if (selectedProjectId) params.set('project', selectedProjectId)
    if (selectedCategoryId) params.set('category', selectedCategoryId)
    if (statusFilters.length > 0) params.set('status', statusFilters.join(','))
    if (paymentStatusFilter !== 'all') params.set('payment', paymentStatusFilter)
    if (measuredDateFilter) params.set('measuredDate', measuredDateFilter)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [selectedCityId, selectedProjectId, selectedCategoryId, statusFilters, paymentStatusFilter, measuredDateFilter, pathname, router])

  // Reset measured-date filter whenever "measured" isn't one of the selected statuses
  useEffect(() => {
    if (!statusFilters.includes('measured') && measuredDateFilter) {
      setMeasuredDateFilter('')
    }
  }, [statusFilters])

  // Close the status multi-select dropdown when clicking outside of it
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleStatusFilter(value: StatusValue) {
    setStatusFilters((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value])
  }

  // רשימת מזהי הפרויקטים הרלוונטית לשאילתה: פרויקט בודד, או כל הפרויקטים
  // שכבר נטענו לפי סינון העיר (עיר בודדת / כל הערים)
  const effectiveProjectIds = useMemo(() => {
    if (!selectedProjectId) return null
    if (selectedProjectId === ALL_PROJECTS) return projects.map((p) => p.id)
    return [selectedProjectId]
  }, [selectedProjectId, projects])

  // Load residents + orders when project(s) + category selected
  useEffect(() => {
    if (!effectiveProjectIds || effectiveProjectIds.length === 0 || !selectedCategoryId) {
      setResidents([])
      setOrders([])
      return
    }

    async function fetchData() {
      setLoadingData(true)
      const residentsQuery = supabase
        .from('residents')
        .select('id, name, phone, address, project_id, projects(name, cities(name))')
        .order('name')
      const scopedResidentsQuery = effectiveProjectIds!.length === 1
        ? residentsQuery.eq('project_id', effectiveProjectIds![0])
        : residentsQuery.in('project_id', effectiveProjectIds!)
      const { data: residentsData } = await scopedResidentsQuery

      const residentsList = (residentsData || []) as unknown as Resident[]
      setResidents(residentsList)

      if (residentsList.length > 0) {
        const residentIds = residentsList.map((r) => r.id)
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, resident_id, category_id, status, payment_status, measured_at, total_price, notes, measurements, details, order_payments(amount), order_items(description, model)')
          .in('resident_id', residentIds)
          .eq('category_id', selectedCategoryId)

        setOrders((ordersData || []) as unknown as Order[])
      } else {
        setOrders([])
      }

      setLoadingData(false)
    }

    fetchData()
  }, [effectiveProjectIds, selectedCategoryId])

  // Merge residents + orders — residents with no order (no status yet) in this
  // category are left out entirely, instead of being treated as "לברר"
  const rows = useMemo<ResidentRow[]>(() => {
    return residents
      .map((resident) => {
        const order = orders.find((o) => o.resident_id === resident.id) || null
        return { resident, order }
      })
      .filter((row) => row.order !== null)
  }, [residents, orders])

  // Apply status filter (multi-select — empty selection means "all")
  const filteredRows = useMemo(() => {
    let result = rows
    if (statusFilters.length > 0) {
      result = result.filter((row) => row.order && statusFilters.includes(row.order.status as StatusValue))
    }
    if (paymentStatusFilter !== 'all') {
      result = result.filter((row) => row.order && getEffectivePaymentStatus(row.order) === paymentStatusFilter)
    }
    if (measuredDateFilter && statusFilters.includes('measured')) {
      // הסינון לפי תאריך מדידה חל רק על שורות בסטטוס "נמדד"; שאר הסטטוסים הנבחרים לא מוסתרים
      result = result.filter((row) => row.order?.status !== 'measured' || row.order?.measured_at === measuredDateFilter)
    }
    return result
  }, [rows, statusFilters, paymentStatusFilter, measuredDateFilter])

  // Summary counts — נספרים דינמית לפי כל הסטטוסים הקיימים בפייפליין הנוכחי
  const summary = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const s of STATUS_ORDER) byStatus[s] = 0
    for (const row of rows) {
      if (row.order && byStatus[row.order.status] !== undefined) byStatus[row.order.status]++
    }
    return { total: rows.length, byStatus }
  }, [rows])

  const filteredProjects = selectedCityId === ALL_CITIES ? projects : projects.filter((p) => p.city_id === selectedCityId)
  const showAllScopeColumn = selectedProjectId === ALL_PROJECTS
  const showTable = !!(selectedProjectId && selectedCategoryId)
  const selectedCategoryName = categories.find((c) => c.id === selectedCategoryId)?.name || ''

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">סקירת פרויקט</h1>
          <p className="text-gray-500 mt-1">הצג את כל הדיירים בפרויקט (או בכל הערים/פרויקטים) עם סטטוס הזמנה לפי קטגוריה</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          {loadingInit ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען נתונים...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="citySelect">בחר עיר</Label>
                <select
                  id="citySelect"
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- בחר עיר --</option>
                  <option value={ALL_CITIES}>כל הערים</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>

              {/* Project */}
              <div className="space-y-2">
                <Label htmlFor="projectSelect">בחר פרויקט</Label>
                <select
                  id="projectSelect"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={!selectedCityId}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- בחר פרויקט --</option>
                  {selectedCityId && (
                    <option value={ALL_PROJECTS}>
                      {selectedCityId === ALL_CITIES ? 'כל הפרויקטים (כל הערים)' : 'כל הפרויקטים בעיר'}
                    </option>
                  )}
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="categorySelect">בחר קטגוריה</Label>
                <select
                  id="categorySelect"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- בחר קטגוריה --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Status filter (multi-select) */}
              <div className="space-y-2" ref={statusDropdownRef}>
                <Label>סנן לפי סטטוס</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((v) => !v)}
                    className="w-full flex items-center justify-between border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="truncate">
                      {statusFilters.length === 0
                        ? 'הכל'
                        : statusFilters.length === 1
                          ? STATUS_LABELS[statusFilters[0]]
                          : `${statusFilters.length} סטטוסים נבחרו`}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg py-1">
                      <button
                        type="button"
                        onClick={() => setStatusFilters([])}
                        className="w-full text-right px-3 py-1.5 text-sm hover:bg-gray-50 text-blue-600"
                      >
                        נקה בחירה (הכל)
                      </button>
                      {STATUS_FILTER_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={statusFilters.includes(opt.value)}
                            onChange={() => toggleStatusFilter(opt.value)}
                            className="h-4 w-4"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment status filter */}
              <div className="space-y-2">
                <Label htmlFor="paymentStatusFilter">סנן לפי סטטוס תשלום</Label>
                <select
                  id="paymentStatusFilter"
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value as PaymentStatusFilter)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Measured date filter - shown only when "measured" is one of the selected statuses */}
              {statusFilters.includes('measured') && (
                <div className="space-y-2">
                  <Label htmlFor="measuredDateFilter">תאריך מדידה</Label>
                  <input
                    id="measuredDateFilter"
                    type="date"
                    value={measuredDateFilter}
                    onChange={(e) => setMeasuredDateFilter(e.target.value)}
                    dir="ltr"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table / States */}
      {!showTable ? (
        <Card>
          <CardContent className="text-center py-12">
            <BarChart2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">בחר פרויקט (או "כל הפרויקטים") וקטגוריה לצפייה בסקירה</p>
          </CardContent>
        </Card>
      ) : loadingData ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : residents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">אין דיירים בסינון זה</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">אין דיירים עם סטטוס בקטגוריה זו</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                דיירים ({filteredRows.length}{statusFilters.length > 0 ? ` מתוך ${rows.length}` : ''})
              </CardTitle>
              <p className="text-xs text-gray-400">לחיצה על שם הדייר פותחת שורת פירוט (לצילום מסך ושליחה לבעל מקצוע)</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="text-right py-3 px-4 font-medium">#</th>
                      <th className="text-right py-3 px-4 font-medium">שם דייר</th>
                      <th className="text-right py-3 px-4 font-medium">כתובת</th>
                      <th className="text-right py-3 px-4 font-medium">טלפון</th>
                      <th className="text-right py-3 px-4 font-medium">סטטוס הזמנה</th>
                      <th className="text-right py-3 px-4 font-medium">סטטוס תשלום</th>
                      <th className="text-right py-3 px-4 font-medium">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ resident, order }, idx) => {
                      const effectiveStatus = order!.status
                      const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus
                      const statusVariant = STATUS_COLORS[effectiveStatus] || 'outline'
                      const isExpanded = expandedResidentId === resident.id

                      return (
                        <Fragment key={resident.id}>
                          <tr className="border-b hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 text-gray-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedResidentId(isExpanded ? '' : resident.id)}
                                  className="flex items-center gap-1 text-blue-700 hover:underline text-right"
                                  title="הצג פרטי הזמנה"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                                  {resident.name}
                                </button>
                                <Link href={`/residents/${resident.id}`} className="text-gray-400 hover:text-blue-600 text-xs" title="לעמוד הדייר">
                                  ←
                                </Link>
                              </div>
                              {showAllScopeColumn && resident.projects && (
                                <div className="text-xs text-gray-400 mr-5">
                                  {resident.projects.cities?.name} · {resident.projects.name}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-600">{resident.address || '—'}</td>
                            <td className="py-3 px-4 text-left">
                              {resident.phone
                                ? <div className="flex items-center gap-2">
                                    <span className="text-gray-600" dir="ltr">{resident.phone}</span>
                                    <a href={`tel:${resident.phone}`} className="inline-flex items-center justify-center p-1 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors" title="חייג">
                                      <Phone className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                            </td>
                            <td className="py-3 px-4">
                              {order ? (
                                <Badge variant={PAYMENT_STATUS_COLORS[getEffectivePaymentStatus(order)] as any}>
                                  {PAYMENT_STATUS_LABELS[getEffectivePaymentStatus(order)]}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={order?.notes || ''}>
                              {order?.notes || '—'}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-blue-50/40 border-b">
                              <td></td>
                              <td colSpan={6} className="px-4 pb-4 pt-1">
                                <div className="rounded-md border bg-white p-3 space-y-2 text-sm">
                                  <div className="font-semibold text-gray-900">{resident.name} — {selectedCategoryName}</div>
                                  {resident.address && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <MapPin className="h-4 w-4 shrink-0" />
                                      {resident.address}
                                    </div>
                                  )}
                                  {order?.measurements && (
                                    <div><span className="text-gray-500">מדידות: </span>{order.measurements}</div>
                                  )}
                                  {order?.notes && (
                                    <div><span className="text-gray-500">הערות: </span>{order.notes}</div>
                                  )}
                                  {order?.order_items && order.order_items.length > 0 && (
                                    <ul className="list-disc pr-5">
                                      {order.order_items.map((it, i) => (
                                        <li key={i}>{it.description}{it.model ? ` — ${it.model}` : ''}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {order?.details && Object.keys(order.details).length > 0 && (
                                    <div className="grid grid-cols-2 gap-1 pt-1 border-t">
                                      {Object.entries(order.details).map(([k, v]) => (
                                        <div key={k}><span className="text-gray-500">{k}: </span>{v}</div>
                                      ))}
                                    </div>
                                  )}
                                  {!order?.measurements && !order?.notes && (!order?.order_items || order.order_items.length === 0) && (!order?.details || Object.keys(order.details).length === 0) && (
                                    <p className="text-gray-400">אין פרטים נוספים להזמנה זו</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-gray-700">סיכום</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
                <SummaryTile label="סה״כ דיירים" value={summary.total} color="text-gray-800" />
                {STATUS_ORDER.map((s) => (
                  <SummaryTile key={s} label={STATUS_LABELS[s]} value={summary.byStatus[s] || 0} color={TILE_COLOR[s] || 'text-gray-600'} />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 text-center border">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}
