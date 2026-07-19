'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, BarChart2, Phone } from 'lucide-react'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS } from '@/lib/utils'

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
}

type ResidentRow = {
  resident: Resident
  order: Order | null
}

type StatusFilter = 'all' | typeof STATUS_ORDER[number]

const PAYMENT_BADGE_VARIANT: Record<string, 'destructive' | 'warning' | 'success'> = {
  not_paid: 'destructive',
  advance: 'warning',
  paid_full: 'success',
}

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  ...STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] })),
]

export default function OverviewPage() {
  const supabase = createClient()

  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [selectedCityId, setSelectedCityId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

  // Load projects when city changes
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
        setProjects(data || [])
        setSelectedProjectId('')
      })
  }, [selectedCityId])

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
          .select('id, resident_id, category_id, status, payment_status')
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

  // Merge residents + orders
  const rows = useMemo<ResidentRow[]>(() => {
    return residents.map((resident) => {
      const order = orders.find((o) => o.resident_id === resident.id) || null
      return { resident, order }
    })
  }, [residents, orders])

  // Apply status filter
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((row) => {
      const effectiveStatus = row.order?.status || 'lead'
      return effectiveStatus === statusFilter
    })
  }, [rows, statusFilter])

  // Summary counts
  const summary = useMemo(() => {
    const total = rows.length
    const ordered = rows.filter((r) => r.order?.status === 'ordered').length
    const quoted = rows.filter((r) => r.order?.status === 'quoted').length
    const interested = rows.filter((r) => r.order?.status === 'interested').length
    const considering = rows.filter((r) => r.order?.status === 'considering').length
    const noContact = rows.filter((r) => !r.order || r.order.status === 'lead').length
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

              {/* Status filter */}
              <div className="space-y-2">
                <Label htmlFor="statusFilter">סנן לפי סטטוס</Label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
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
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                דיירים ({filteredRows.length}{statusFilter !== 'all' ? ` מתוך ${rows.length}` : ''})
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
                      const effectiveStatus = order?.status || 'lead'
                      const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus
                      const statusVariant = STATUS_COLORS[effectiveStatus] || 'outline'

                      return (
                        <tr key={resident.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-medium text-gray-900">{resident.name}</td>
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
                              <Badge variant={PAYMENT_BADGE_VARIANT[order.payment_status] || 'outline'}>
                                {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
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
