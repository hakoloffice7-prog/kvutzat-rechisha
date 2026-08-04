'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, BarChart2, Phone } from 'lucide-react'
import Link from 'next/link'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, getDebtStatus, type DebtStatus } from '@/lib/utils'

type City = { id: string; name: string }
type Project = { id: string; city_id: string; name: string }
type Category = { id: string; name: string }

type Resident = { id: string; name: string; phone: string }

type Order = {
  id: string
  resident_id: string
  category_id: string
  status: string
  payment_status: string
  measured_at: string | null
  total_price: number | null
  order_payments: { amount: number }[]
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

  // Load projects when city changes; restore the project coming from the URL
  // (on first load) if it actually belongs to that city, otherwise clear it
  useEffect(() => {
    if (!selectedCityId) {
      setProjects([])
      setSelectedProjectId('')
      return
    }
    supabase
      .from('projects')
      .select('id, city_id, name')
      .eq('city_id', selectedCityId)
      .order('name')
      .then(({ data }) => {
        const projectsData = data || []
        setProjects(projectsData)
        const pending = pendingProjectIdRef.current
        if (pending && projectsData.some((p) => p.id === pending)) {
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

  // Load residents + orders when project + category selected
  useEffect(() => {
    if (!selectedProjectId || !selectedCategoryId) {
      setResidents([])
      setOrders([])
      return
    }

    async function fetchData() {
      setLoadingData(true)
      const { data: residentsData } = await supabase
        .from('residents')
        .select('id, name, phone')
        .eq('project_id', selectedProjectId)
        .order('name')

      const residentsList = residentsData || []
      setResidents(residentsList)

      if (residentsList.length > 0) {
        const residentIds = residentsList.map((r) => r.id)
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, resident_id, category_id, status, payment_status, measured_at, total_price, order_payments(amount)')
          .in('resident_id', residentIds)
          .eq('category_id', selectedCategoryId)

        setOrders(ordersData || [])
      } else {
        setOrders([])
      }

      setLoadingData(false)
    }

    fetchData()
  }, [selectedProjectId, selectedCategoryId])

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

  // Summary counts
  const summary = useMemo(() => {
    const total = rows.length
    const ordered = rows.filter((r) => r.order?.status === 'ordered').length
    const quoted = rows.filter((r) => r.order?.status === 'quoted').length
    const interested = rows.filter((r) => r.order?.status === 'interested').length
    const considering = rows.filter((r) => r.order?.status === 'considering').length
    const noContact = rows.filter((r) => r.order?.status === 'lead').length
    return { total, ordered, quoted, interested, considering, noContact }
  }, [rows])

  const filteredProjects = projects.filter((p) => p.city_id === selectedCityId)
  const showTable = !!(selectedProjectId && selectedCategoryId)

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">סקירת פרויקט</h1>
          <p className="text-gray-500 mt-1">הצג את כל הדיירים בפרויקט עם סטטוס הזמנה לפי קטגוריה</p>
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
            <p className="text-gray-500 text-lg">בחר פרויקט וקטגוריה לצפייה בסקירה</p>
          </CardContent>
        </Card>
      ) : loadingData ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : residents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">אין דיירים בפרויקט זה</p>
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
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="text-right py-3 px-4 font-medium">#</th>
                      <th className="text-right py-3 px-4 font-medium">שם דייר</th>
                      <th className="text-right py-3 px-4 font-medium">טלפון</th>
                      <th className="text-right py-3 px-4 font-medium">סטטוס הזמנה</th>
                      <th className="text-right py-3 px-4 font-medium">סטטוס תשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ resident, order }, idx) => {
                      const effectiveStatus = order!.status
                      const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus
                      const statusVariant = STATUS_COLORS[effectiveStatus] || 'outline'

                      return (
                        <tr key={resident.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-medium">
                            <Link href={`/residents/${resident.id}`} className="text-blue-700 hover:underline">{resident.name}</Link>
                          </td>
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
                        </tr>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                <SummaryTile label="סה״כ דיירים" value={summary.total} color="text-gray-800" />
                <SummaryTile label="הזמינו" value={summary.ordered} color="text-green-600" />
                <SummaryTile label="הצעת מחיר" value={summary.quoted} color="text-yellow-600" />
                <SummaryTile label="מעוניינים" value={summary.interested} color="text-blue-600" />
                <SummaryTile label="מתלבטים" value={summary.considering} color="text-yellow-600" />
                <SummaryTile label="לברר" value={summary.noContact} color="text-gray-500" />
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
