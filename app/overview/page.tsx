'use client'

import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/CopyButton'
import { ClickToCallButton } from '@/components/ClickToCallButton'
import { Label } from '@/components/ui/label'
import { Loader2, BarChart2, Phone, MapPin, Plus, CalendarClock, Mail } from 'lucide-react'
import { saveNavList } from '@/components/PrevNextNav'
import { ResidentRemindersDialog } from '@/components/ResidentRemindersDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Link from 'next/link'
import { MultiSelect } from '@/components/MultiSelect'
import { NotesSection } from '@/components/NotesSection'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, getDebtStatus, formatStatusDate, stampNewNoteLines, digitsOnly, phoneSearchDigits, type DebtStatus } from '@/lib/utils'

// ערכי "סינטינל" לבחירת "כל הערים" / "כל הפרויקטים" בבוררים, כדי לאפשר
// תצוגה חוצת ערים/פרויקטים (למשל כל מי שרוצה וילונות, מכל המערכת)
const ALL_CITIES = '__ALL_CITIES__'
const ALL_PROJECTS = '__ALL_PROJECTS__'
// מפתח לשמירת החיפוש האחרון בין מסכים
const LAST_SEARCH_KEY = 'overview-last-search'

type City = { id: string; name: string }
type Project = { id: string; city_id: string; name: string }
type Category = { id: string; name: string }

type Resident = {
  id: string
  name: string
  phone: string
  phone2?: string | null
  email?: string | null
  address: string
  project_id: string
  last_updated_at?: string | null
  projects: { name: string; cities: { name: string } } | null
}

type Order = {
  id: string
  resident_id: string
  category_id: string
  status: string
  status_updated_at: string | null
  payment_status: string
  measured_at: string | null
  total_price: number | null
  notes: string | null
  measurements: string | null
  details: Record<string, string> | null
  order_payments: { amount: number; paid_at: string | null; note: string | null }[]
  order_items: { description: string; model: string }[]
}

type ResidentRow = {
  resident: Resident
  order: Order | null
}

type StatusValue = typeof STATUS_ORDER[number]
type PaymentStatusFilter = DebtStatus

const PAYMENT_STATUS_FILTER_OPTIONS: { value: PaymentStatusFilter; label: string }[] = [
  { value: 'not_paid', label: PAYMENT_STATUS_LABELS.not_paid },
  { value: 'partial', label: PAYMENT_STATUS_LABELS.partial },
  { value: 'paid_full', label: PAYMENT_STATUS_LABELS.paid_full },
]

// תאריך מקומי בפורמט YYYY-MM-DD מתוך חותמת זמן (להשוואה לשדות date)
function toLocalDateKey(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ההערה האחרונה שנוספה: כל שורה בהערות היא הערה נפרדת, והחדשה נוספת בסוף
function lastNoteLine(notes: string | null) {
  const lines = (notes || '').split('\n').map((l) => l.trim()).filter(Boolean)
  return lines[lines.length - 1] || ''
}

// הערות התשלומים של ההזמנה (מזומן, העברה וכו') ללא כפילויות, לתצוגה בטבלה
function paymentNotesText(order: Order) {
  const notes = (order.order_payments || []).map((p) => (p.note || '').trim()).filter(Boolean)
  return Array.from(new Set(notes)).join(', ')
}

// סטטוס התשלום נלקח מהעמודה השמורה (order.payment_status) כדי שעריכה ישירה
// מהטבלה תישמר; אם אין ערך שמור — מחושב ממחיר ותשלומים בפועל
function getEffectivePaymentStatus(order: Order) {
  if (order.payment_status) return order.payment_status
  const totalPaid = (order.order_payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
  return getDebtStatus(order.total_price || 0, totalPaid)
}

const selectClass = 'border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60'

const STATUS_FILTER_OPTIONS: { value: StatusValue; label: string }[] =
  STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))

const STATUS_FILTER_VALUES = new Set<string>(STATUS_ORDER)
const PAYMENT_STATUS_FILTER_VALUES = new Set<string>(['not_paid', 'partial', 'paid_full'])

const TILE_COLOR: Record<string, string> = {
  interested: 'text-blue-600',
  measurement_scheduled: 'text-blue-600',
  measured: 'text-blue-600',
  awaiting_selection: 'text-yellow-600',
  selection_approved: 'text-blue-600',
  awaiting_quote: 'text-yellow-600',
  awaiting_approval: 'text-yellow-600',
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
  // כשנכנסים למסך בלי פילטרים ב-URL (למשל מהתפריט) משחזרים את החיפוש האחרון שנשמר
  const [filterSource] = useState<URLSearchParams>(() => {
    const keys = ['city', 'project', 'category', 'status', 'payment', 'measuredFrom', 'measuredTo', 'updatedFrom', 'updatedTo', 'q']
    if (keys.some((k) => searchParams.get(k))) return new URLSearchParams(searchParams.toString())
    try {
      return new URLSearchParams(localStorage.getItem(LAST_SEARCH_KEY) || '')
    } catch {
      return new URLSearchParams()
    }
  })
  // ברירת מחדל: כל הערים וכל הפרויקטים
  const initialCityId = filterSource.get('city') || ALL_CITIES
  const initialProjectId = filterSource.get('project') || ALL_PROJECTS
  const initialCategoryIds = (filterSource.get('category') || '').split(',').filter(Boolean)
  const initialStatusFilters = (filterSource.get('status') || '')
    .split(',')
    .filter((s) => STATUS_FILTER_VALUES.has(s)) as StatusValue[]
  const initialPaymentStatusFilters = (filterSource.get('payment') || '')
    .split(',')
    .filter((v) => PAYMENT_STATUS_FILTER_VALUES.has(v)) as PaymentStatusFilter[]
  const initialMeasuredFrom = filterSource.get('measuredFrom') || ''
  const initialMeasuredTo = filterSource.get('measuredTo') || ''
  const initialUpdatedFrom = filterSource.get('updatedFrom') || ''
  const initialUpdatedTo = filterSource.get('updatedTo') || ''
  const initialSearch = filterSource.get('q') || ''

  const [returnRowId] = useState(searchParams.get('row') || '')

  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const pendingProjectIdRef = useRef(initialProjectId)

  const [selectedCityId, setSelectedCityId] = useState(initialCityId)
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(initialCategoryIds)
  const [statusFilters, setStatusFilters] = useState<StatusValue[]>(initialStatusFilters)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const [paymentStatusFilters, setPaymentStatusFilters] = useState<PaymentStatusFilter[]>(initialPaymentStatusFilters)
  const [measuredFrom, setMeasuredFrom] = useState(initialMeasuredFrom)
  const [measuredTo, setMeasuredTo] = useState(initialMeasuredTo)
  const [updatedFrom, setUpdatedFrom] = useState(initialUpdatedFrom)
  const [updatedTo, setUpdatedTo] = useState(initialUpdatedTo)
  const [search, setSearch] = useState(initialSearch)

  const [residents, setResidents] = useState<Resident[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  // אפשר לפתוח כמה דיירים במקביל — פתיחת שורה לא סוגרת את האחרות
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [remindersResident, setRemindersResident] = useState<{ id: string; name: string } | null>(null)
  const [notesDialog, setNotesDialog] = useState<{ name: string; orderId: string } | null>(null)
  const [savingOrderIds, setSavingOrderIds] = useState<Set<string>>(new Set())

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
        setSelectedProjectId(ALL_PROJECTS)
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
    if (selectedCategoryIds.length > 0) params.set('category', selectedCategoryIds.join(','))
    if (statusFilters.length > 0) params.set('status', statusFilters.join(','))
    if (paymentStatusFilters.length > 0) params.set('payment', paymentStatusFilters.join(','))
    if (measuredFrom) params.set('measuredFrom', measuredFrom)
    if (measuredTo) params.set('measuredTo', measuredTo)
    if (updatedFrom) params.set('updatedFrom', updatedFrom)
    if (updatedTo) params.set('updatedTo', updatedTo)
    if (search.trim()) params.set('q', search.trim())
    const query = params.toString()
    try { localStorage.setItem(LAST_SEARCH_KEY, query) } catch {}
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [selectedCityId, selectedProjectId, selectedCategoryIds, statusFilters, paymentStatusFilters, measuredFrom, measuredTo, updatedFrom, updatedTo, search, pathname, router])

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

  // עדכון סטטוס הזמנה / תשלום ישירות מהטבלה — שמירה אוטומטית עם עדכון מיידי
  // במסך, ושחזור הערך הקודם אם השמירה נכשלה
  function touchResidentOfOrder(orderId: string) {
    const rid = orders.find((o) => o.id === orderId)?.resident_id
    if (!rid) return
    const nowIso = new Date().toISOString()
    setResidents((prev) => prev.map((r) => (r.id === rid ? { ...r, last_updated_at: nowIso } : r)))
  }

  async function updateOrderField(orderId: string, field: 'status' | 'payment_status', value: string) {
    const previous = orders.find((o) => o.id === orderId)?.[field]
    const previousStatusDate = orders.find((o) => o.id === orderId)?.status_updated_at ?? null
    setSavingOrderIds((prev) => new Set(prev).add(orderId))
    const nowIso = new Date().toISOString()
    setOrders((prev) => prev.map((o) => (o.id === orderId
      ? { ...o, [field]: value, ...(field === 'status' ? { status_updated_at: nowIso } : {}) }
      : o)))
    const { error } = await supabase
      .from('orders')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) {
      setOrders((prev) => prev.map((o) => (o.id === orderId
        ? { ...o, [field]: previous ?? '', ...(field === 'status' ? { status_updated_at: previousStatusDate } : {}) }
        : o)))
      alert('השמירה נכשלה, נסה שוב')
    } else {
      touchResidentOfOrder(orderId)
    }
    setSavingOrderIds((prev) => {
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
  }

  // הערות להזמנה מתוך סקירת הפרויקט: מצרפים להערות העדכניות ביותר שנשמרו כדי לא לדרוס הערות של עובד אחר
  async function addOrderNote(orderId: string, text: string) {
    const { data: current } = await supabase.from('orders').select('notes').eq('id', orderId).single()
    const previous = current?.notes || ''
    const next = stampNewNoteLines(previous, previous ? previous + '\n' + text : text)
    const { error } = await supabase.from('orders').update({ notes: next }).eq('id', orderId)
    if (error) return false
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, notes: next } : o)))
    touchResidentOfOrder(orderId)
    return true
  }

  async function replaceOrderNotes(orderId: string, next: string) {
    const { error } = await supabase.from('orders').update({ notes: next }).eq('id', orderId)
    if (error) return false
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, notes: next } : o)))
    touchResidentOfOrder(orderId)
    return true
  }

  // מעבר למסך דיירים עם דיאלוג "הוסף דייר" פתוח, כשהעיר/הפרויקט שנבחרו כאן מסומנים שם
  function goAddResident() {
    try {
      const project = projects.find((p) => p.id === selectedProjectId)
      const cityId = project ? project.city_id : selectedCityId !== ALL_CITIES ? selectedCityId : ''
      const projectId = project ? project.id : ''
      sessionStorage.setItem('residents-pending-add', '1')
      sessionStorage.setItem('residents-filter', JSON.stringify({ cityId, projectId }))
    } catch {}
    router.push('/residents')
  }

  // קישור לעמוד הדייר שזוכר את מצב המסך (פילטרים + השורה שנלחצה), כדי
  // שכפתור "חזור" יחזיר בדיוק למקום שבו היינו
  // לחיצה על שורה: פותחת את ההזמנה עצמה, ושומרת את סדר הרשימה לכפתורי קודם/הבא
  function openOrder(orderId: string) {
    const params = new URLSearchParams(window.location.search)
    params.set('row', orderId)
    const from = `${pathname}?${params.toString()}`
    saveNavList('orders', filteredRows.map((r) => r.order!.id), from)
    router.push(`/orders/${orderId}?from=${encodeURIComponent(from)}`)
  }

  function residentHref(residentId: string, orderId: string) {
    const params = new URLSearchParams(window.location.search)
    params.set('row', orderId)
    return `/residents/${residentId}?from=${encodeURIComponent(`${pathname}?${params.toString()}`)}`
  }

  // גלילה לשורה שממנה יצאנו, אחרי שהנתונים נטענו
  // רק פעם אחת — אחרת כל עדכון/חיפוש היה "מקפיץ" את המסך חזרה לשורה הזו
  const scrolledToReturnRow = useRef(false)
  useEffect(() => {
    if (!returnRowId || loadingData || scrolledToReturnRow.current) return
    const el = document.getElementById(`row-${returnRowId}`)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      scrolledToReturnRow.current = true
    }
  }, [returnRowId, loadingData, orders])

  // כפתור "הצג הכל": כל הערים, הפרויקטים, המוצרים, הסטטוסים וסוגי התשלום,
  // ומנקה גם את חיפוש הדייר החופשי (התאריכים נשארים)
  function showAll() {
    pendingProjectIdRef.current = ALL_PROJECTS
    setSelectedCityId(ALL_CITIES)
    setSelectedProjectId(ALL_PROJECTS)
    setSelectedCategoryIds(categories.map((c) => c.id))
    setStatusFilters(STATUS_FILTER_OPTIONS.map((o) => o.value))
    setPaymentStatusFilters(PAYMENT_STATUS_FILTER_OPTIONS.map((o) => o.value) as PaymentStatusFilter[])
    setSearch('')
  }

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
    if (!effectiveProjectIds || effectiveProjectIds.length === 0 || selectedCategoryIds.length === 0) {
      setResidents([])
      setOrders([])
      return
    }

    async function fetchData() {
      setLoadingData(true)
      const residentsQuery = supabase
        .from('residents')
        .select('id, name, phone, phone2, email, address, project_id, last_updated_at, projects(name, cities(name))')
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
          .select('id, resident_id, category_id, status, status_updated_at, payment_status, measured_at, total_price, notes, measurements, details, order_payments(amount, paid_at, note), order_items(description, model)')
          .in('resident_id', residentIds)
          .in('category_id', selectedCategoryIds)

        setOrders((ordersData || []) as unknown as Order[])
      } else {
        setOrders([])
      }

      setLoadingData(false)
    }

    fetchData()
  }, [effectiveProjectIds, selectedCategoryIds])

  // Merge residents + orders — residents with no order (no status yet) in this
  // category are left out entirely, instead of being treated as "לברר"
  const rows = useMemo<ResidentRow[]>(() => {
    // שורה לכל הזמנה (דייר עם הזמנות בכמה קטגוריות מופיע בכל אחת מהן)
    const byId = new Map(residents.map((r) => [r.id, r]))
    return orders
      .filter((o) => byId.has(o.resident_id))
      .map((order) => ({ resident: byId.get(order.resident_id)!, order }))
      .sort((a, b) => a.resident.name.localeCompare(b.resident.name, 'he'))
  }, [residents, orders])

  // Apply status filter (multi-select — empty selection means "all")
  const filteredRows = useMemo(() => {
    let result = rows
    if (statusFilters.length > 0) {
      result = result.filter((row) => row.order && statusFilters.includes(row.order.status as StatusValue))
    }
    if (paymentStatusFilters.length > 0) {
      result = result.filter((row) => row.order && paymentStatusFilters.includes(getEffectivePaymentStatus(row.order) as PaymentStatusFilter))
    }
    // סינון לפי תאריך מדידה (בכל סטטוס, כי התאריך נשמר גם אחרי שינוי סטטוס)
    if (measuredFrom || measuredTo) {
      result = result.filter((row) => {
        const d = row.order?.measured_at
        if (!d) return false
        return (!measuredFrom || d >= measuredFrom) && (!measuredTo || d <= measuredTo)
      })
    }
    // סינון לפי תאריך עדכון אחרון של הדייר
    if (updatedFrom || updatedTo) {
      result = result.filter((row) => {
        const d = toLocalDateKey(row.resident.last_updated_at)
        if (!d) return false
        return (!updatedFrom || d >= updatedFrom) && (!updatedTo || d <= updatedTo)
      })
    }
    const term = search.trim().toLowerCase()
    if (term) {
      // חיפוש חופשי לפי שם / טלפון / כתובת; בטלפון מתעלמים מ-"-" ורווחים
      const termDigits = phoneSearchDigits(term)
      result = result.filter(({ resident }) => {
        if (resident.name.toLowerCase().includes(term) || (resident.address || '').toLowerCase().includes(term)) return true
        return [resident.phone, resident.phone2].some((p) => {
          if (!p) return false
          return termDigits ? digitsOnly(p).includes(termDigits) : p.toLowerCase().includes(term)
        })
      })
    }
    return result
  }, [rows, statusFilters, paymentStatusFilters, measuredFrom, measuredTo, updatedFrom, updatedTo, search])

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
  const showTable = !!(selectedProjectId && selectedCategoryIds.length > 0)
  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const multiCategory = selectedCategoryIds.length > 1

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">סקירת פרויקט</h1>
            <p className="text-gray-500 mt-1">הצג את כל הדיירים בפרויקט (או בכל הערים/פרויקטים) עם סטטוס הזמנה לפי קטגוריה</p>
          </div>
        </div>
        <Button onClick={goAddResident}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף דייר
        </Button>
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={ALL_PROJECTS}>
                    {selectedCityId === ALL_CITIES ? 'כל הפרויקטים' : 'כל הפרויקטים בעיר'}
                  </option>

                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <MultiSelect
                label="בחר קטגוריה"
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                selected={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
                emptyLabel="-- בחר קטגוריה --"
                pluralLabel="קטגוריות"
                clearLabel="נקה בחירה"
                selectAllLabel="בחר את כל המוצרים"
              />

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
                        onClick={() => setStatusFilters(STATUS_FILTER_OPTIONS.map((o) => o.value))}
                        className="w-full text-right px-3 py-1.5 text-sm hover:bg-gray-50 text-blue-600 font-medium"
                      >
                        בחר הכל
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilters([])}
                        className="w-full text-right px-3 py-1.5 text-sm hover:bg-gray-50 text-blue-600"
                      >
                        נקה בחירה
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

              <MultiSelect
                label="סנן לפי סטטוס תשלום"
                options={PAYMENT_STATUS_FILTER_OPTIONS}
                selected={paymentStatusFilters}
                onChange={(v) => setPaymentStatusFilters(v as PaymentStatusFilter[])}
                emptyLabel="הכל"
                pluralLabel="סטטוסים"
                clearLabel="נקה בחירה"
                selectAllLabel="בחר הכל"
              />

              {/* חיפוש דייר */}
              <div className="space-y-2">
                <Label htmlFor="residentSearch">חיפוש דייר</Label>
                <input
                  id="residentSearch"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="שם, טלפון או כתובת"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* תאריך מדידה (טווח) */}
              <div className="space-y-2 md:col-span-2 lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>תאריך מדידה</Label>
                  <button
                    type="button"
                    onClick={showAll}
                    className="text-xs border border-blue-600 text-blue-600 rounded-md px-3 py-1 hover:bg-blue-50"
                  >
                    הצג הכל (כל הפילטרים)
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="block text-xs text-gray-500">מתאריך</span>
                    <input type="date" value={measuredFrom} onChange={(e) => setMeasuredFrom(e.target.value)} dir="ltr"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs text-gray-500">עד תאריך</span>
                    <input type="date" value={measuredTo} onChange={(e) => setMeasuredTo(e.target.value)} dir="ltr"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* תאריך עדכון אחרון של הדייר (טווח) */}
              <div className="space-y-2 md:col-span-2 lg:col-span-2">
                <Label>תאריך עדכון אחרון</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="block text-xs text-gray-500">מתאריך</span>
                    <input type="date" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} dir="ltr"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-xs text-gray-500">עד תאריך</span>
                    <input type="date" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} dir="ltr"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table / States */}
      {!showTable ? (
        <Card>
          <CardContent className="text-center py-12">
            <BarChart2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">בחר פרויקט (או "כל הפרויקטים") וקטגוריה אחת או יותר לצפייה בסקירה</p>
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
            <p className="text-gray-500 text-lg">אין דיירים עם סטטוס בקטגוריות שנבחרו</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                דיירים ({filteredRows.length}{filteredRows.length !== rows.length ? ` מתוך ${rows.length}` : ''})
              </CardTitle>
              <p className="text-xs text-gray-400">לחיצה על השורה פותחת את ההזמנה · לחיצה על שם הדייר פותחת שורת פירוט (לצילום מסך ושליחה לבעל מקצוע)</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="text-right py-3 px-4 font-medium">#</th>
                      <th className="text-right py-3 px-4 font-medium">שם דייר</th>
                      {multiCategory && <th className="text-right py-3 px-4 font-medium">קטגוריה</th>}
                      <th className="text-right py-3 px-4 font-medium">כתובת</th>
                      <th className="text-right py-3 px-4 font-medium">טלפון</th>
                      <th className="text-right py-3 px-4 font-medium">מה הוזמן</th>
                      <th className="text-right py-3 px-4 font-medium">מחיר</th>
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
                      const isExpanded = expandedIds.has(order!.id)

                      return (
                        <Fragment key={order!.id}>
                          <tr
                            id={`row-${order!.id}`}
                            onClick={(e) => {
                              // לחיצה על כפתור/קישור/בחירה בתוך השורה ממשיכה לעבוד כרגיל
                              if ((e.target as HTMLElement).closest('button, a, select, input, textarea, label')) return
                              if (window.getSelection()?.toString()) return // סימון טקסט להעתקה — לא לנווט
                              openOrder(order!.id)
                            }}
                            className={`border-b hover:bg-gray-50 transition-colors cursor-pointer ${order!.id === returnRowId ? 'bg-yellow-50' : ''}`}
                            title="לחץ לפתיחת ההזמנה"
                          >
                            <td className="py-3 px-4 text-gray-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(order!.id)}
                                  className="flex items-center gap-1 text-blue-700 hover:underline text-right"
                                  title="הצג פרטי הזמנה"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                                  {resident.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRemindersResident({ id: resident.id, name: resident.name })}
                                  className="text-gray-400 hover:text-blue-600"
                                  title="תזכורות הדייר"
                                >
                                  <CalendarClock className="h-4 w-4" />
                                </button>
                                <Link href={residentHref(resident.id, order!.id)} className="text-gray-400 hover:text-blue-600 text-xs" title="לעמוד הדייר">
                                  ←
                                </Link>
                              </div>
                              {showAllScopeColumn && resident.projects && (
                                <div className="text-xs text-gray-400 mr-5">
                                  {resident.projects.cities?.name} · {resident.projects.name}
                                </div>
                              )}
                              {resident.last_updated_at && (
                                <div className="text-[11px] text-gray-400 mr-5" title="עדכון אחרון של הדייר">
                                  עדכון אחרון: {formatStatusDate(resident.last_updated_at)}
                                </div>
                              )}
                            </td>
                            {multiCategory && (
                              <td className="py-3 px-4 text-gray-600">{categoryNameById.get(order!.category_id) || '—'}</td>
                            )}
                            <td className="py-3 px-4 text-gray-600">{resident.address || '—'}</td>
                            <td className="py-3 px-4 text-left">
                              {resident.phone || resident.phone2
                                ? <div className="space-y-1">
                                    {[resident.phone, resident.phone2].filter(Boolean).map((ph, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className="text-gray-600" dir="ltr">{ph}</span>
                                        {i === 1 && resident.phone && <span className="text-[10px] text-gray-400">(נוסף)</span>}
                                        <ClickToCallButton phone={ph!} name={resident.name} className="p-1" />
                                        <CopyButton value={ph!} title="העתק טלפון" />
                                      </div>
                                    ))}
                                  </div>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="py-3 px-4 text-gray-600 max-w-[220px]">
                              {order!.order_items && order!.order_items.length > 0 ? (
                                <ul className="space-y-0.5 text-xs">
                                  {order!.order_items.map((it, i) => (
                                    <li key={i}>{it.description}{it.model ? ` — ${it.model}` : ''}</li>
                                  ))}
                                </ul>
                              ) : '—'}
                            </td>
                            <td className="py-3 px-4 text-gray-700 whitespace-nowrap">
                              {order!.total_price ? `₪${order!.total_price.toLocaleString('he-IL')}` : '—'}
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={effectiveStatus}
                                disabled={savingOrderIds.has(order!.id)}
                                onChange={(e) => updateOrderField(order!.id, 'status', e.target.value)}
                                className={selectClass}
                                title={statusLabel}
                              >
                                {!STATUS_LABELS[effectiveStatus] && <option value={effectiveStatus}>{effectiveStatus}</option>}
                                {STATUS_ORDER.map((s) => (
                                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                              {order!.status_updated_at && (
                                <div className="text-[11px] text-gray-400 mt-0.5" title="תאריך עדכון הסטטוס">
                                  עודכן: {formatStatusDate(order!.status_updated_at)}
                                </div>
                              )}
                              {order!.measured_at && (
                                <div className="text-[11px] text-gray-400" title="תאריך מדידה">
                                  נמדד: {formatStatusDate(order!.measured_at + 'T00:00:00')}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {order ? (
                                <div>
                                  <Badge variant={PAYMENT_STATUS_COLORS[getEffectivePaymentStatus(order)] as any}>
                                    {PAYMENT_STATUS_LABELS[getEffectivePaymentStatus(order)]}
                                  </Badge>
                                  {paymentNotesText(order) && (
                                    <div className="text-[11px] text-gray-500 mt-0.5" title="הערות תשלום">{paymentNotesText(order)}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-600 max-w-[200px]">
                              {order ? (
                                order.notes ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setNotesDialog({ name: resident.name, orderId: order.id })}
                                      className="block flex-1 min-w-0 text-right truncate hover:text-blue-700 hover:underline"
                                      title="לחץ לצפייה ולעריכת ההערות"
                                    >
                                      {lastNoteLine(order.notes)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setNotesDialog({ name: resident.name, orderId: order.id })}
                                      className="shrink-0 p-1 rounded-full text-blue-600 hover:bg-blue-50"
                                      title="הוסף הערה"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setNotesDialog({ name: resident.name, orderId: order.id })}
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    <Plus className="h-3 w-3" />
                                    הוסף הערה
                                  </button>
                                )
                              ) : '—'}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-blue-50/40 border-b">
                              <td></td>
                              <td colSpan={multiCategory ? 9 : 8} className="px-4 pb-4 pt-1">
                                <div className="rounded-md border bg-white p-3 space-y-2 text-sm">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-900">{resident.name} — {categoryNameById.get(order?.category_id || '') || ''}</span>
                                    {order && (
                                      <>
                                        <Badge variant={(STATUS_COLORS[order.status] || 'outline') as any}>
                                          {STATUS_LABELS[order.status] || order.status}
                                        </Badge>
                                        <Badge variant={PAYMENT_STATUS_COLORS[getEffectivePaymentStatus(order)] as any}>
                                          {PAYMENT_STATUS_LABELS[getEffectivePaymentStatus(order)]}
                                        </Badge>
                                      </>
                                    )}
                                  </div>
                                  {resident.address && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <MapPin className="h-4 w-4 shrink-0" />
                                      {resident.address}
                                    </div>
                                  )}
                                  {resident.phone && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <Phone className="h-4 w-4 shrink-0" />
                                      <span dir="ltr">{resident.phone}</span>
                                      <CopyButton value={resident.phone} title="העתק טלפון" />
                                    </div>
                                  )}
                                  {resident.phone2 && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <Phone className="h-4 w-4 shrink-0" />
                                      <span dir="ltr">{resident.phone2}</span>
                                      <span className="text-xs text-gray-400">(נוסף)</span>
                                      <CopyButton value={resident.phone2} title="העתק טלפון" />
                                    </div>
                                  )}
                                  {resident.email && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <Mail className="h-4 w-4 shrink-0" />
                                      <span dir="ltr">{resident.email}</span>
                                      <CopyButton value={resident.email} title="העתק מייל" />
                                    </div>
                                  )}
                                  {!!order?.total_price && (
                                    <div><span className="text-gray-500">מחיר לתשלום: </span>₪{order.total_price.toLocaleString('he-IL')}</div>
                                  )}
                                  {order?.measured_at && (
                                    <div><span className="text-gray-500">תאריך מדידה: </span>{order.measured_at}</div>
                                  )}
                                  {order?.measurements && (
                                    <div><span className="text-gray-500">מדידות: </span>{order.measurements}</div>
                                  )}
                                  {order?.notes && (
                                    <div><span className="text-gray-500">הערות: </span>{order.notes}</div>
                                  )}
                                  {order?.order_payments && order.order_payments.length > 0 && (
                                    <div className="pt-1 border-t">
                                      <div className="text-gray-500 mb-1">תשלומים:</div>
                                      <ul className="space-y-0.5">
                                        {order.order_payments.map((p, i) => (
                                          <li key={i}>
                                            ₪{(p.amount || 0).toLocaleString('he-IL')}
                                            {p.paid_at ? ` · ${formatStatusDate(p.paid_at)}` : ''}
                                            {p.note ? ` · ${p.note}` : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
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
                                  {!order?.total_price && !order?.measured_at && !order?.measurements && !order?.notes && (!order?.order_payments || order.order_payments.length === 0) && (!order?.order_items || order.order_items.length === 0) && (!order?.details || Object.keys(order.details).length === 0) && (
                                    <p className="text-gray-400">אין פרטי הזמנה נוספים מעבר לסטטוס ותשלום</p>
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
                <SummaryTile label={multiCategory ? 'סה״כ הזמנות' : 'סה״כ דיירים'} value={summary.total} color="text-gray-800" />
                {STATUS_ORDER.map((s) => (
                  <SummaryTile key={s} label={STATUS_LABELS[s]} value={summary.byStatus[s] || 0} color={TILE_COLOR[s] || 'text-gray-600'} />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <ResidentRemindersDialog resident={remindersResident} onClose={() => setRemindersResident(null)} />

      <Dialog open={!!notesDialog} onOpenChange={(open) => { if (!open) setNotesDialog(null) }}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>הערות — {notesDialog?.name}</DialogTitle>
          </DialogHeader>
          {notesDialog && (
            <NotesSection
              notes={orders.find((o) => o.id === notesDialog.orderId)?.notes}
              onAdd={(text) => addOrderNote(notesDialog.orderId, text)}
              onReplace={(next) => replaceOrderNotes(notesDialog.orderId, next)}
            />
          )}
        </DialogContent>
      </Dialog>
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
