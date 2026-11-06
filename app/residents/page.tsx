'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/CopyButton'
import { ClickToCallButton } from '@/components/ClickToCallButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users, Loader2, Pencil, Trash2, ShoppingCart, Phone, CalendarClock } from 'lucide-react'
import { ResidentRemindersDialog } from '@/components/ResidentRemindersDialog'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, digitsOnly, phoneSearchDigits, phoneIlikePatterns } from '@/lib/utils'
import Link from 'next/link'
import { AddOrderDialog } from '@/components/AddOrderDialog'
import { ResidentProjectPicker } from '@/components/ResidentProjectPicker'
import { OrderNumber } from '@/components/OrderNumber'

type City = { id: string; name: string }
type Project = { id: string; city_id: string; name: string; address: string }
type Resident = {
  id: string
  project_id: string
  name: string
  address: string
  phone: string
  phone2: string
  email: string
  key_location: string
  projects?: { name: string; city_id: string } | null
}
type OrderItem = { id: string; description: string; model: string; customer_price: number }

type SimpleOrder = {
  id: string
  order_number: number | null
  status: string
  payment_status: string
  categories: { name: string }
  suppliers: { name: string } | null
  order_items: OrderItem[]
}

const ALL = 'all'
const PAGE_SIZE = 25

export default function ResidentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [selectedCityId, setSelectedCityId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingCities, setLoadingCities] = useState(true)
  const [loadingResidents, setLoadingResidents] = useState(false)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newResident, setNewResident] = useState({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '', project_id: '' })
  const [editingResident, setEditingResident] = useState<Resident | null>(null)

  const [remindersResident, setRemindersResident] = useState<{ id: string; name: string } | null>(null)

  // Orders dialog state
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false)
  const [ordersResident, setOrdersResident] = useState<Resident | null>(null)
  const [residentOrders, setResidentOrders] = useState<SimpleOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [addOrderOpen, setAddOrderOpen] = useState(false)

  // Filter persistence
  const pendingProjectIdRef = useRef('')
  const pendingAddDialogRef = useRef(false)
  // Delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  // חיפוש חופשי לפי שם / טלפון / כתובת
  const [nameSearch, setNameSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const fetchSeqRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Phone validation
  const [phoneError, setPhoneError] = useState('')

  useEffect(() => {
    fetchCities()
    try {
      if (sessionStorage.getItem('residents-pending-add') === '1') {
        sessionStorage.removeItem('residents-pending-add')
        pendingAddDialogRef.current = true
      }
      const saved = sessionStorage.getItem('residents-filter')
      if (saved) {
        const { cityId, projectId } = JSON.parse(saved)
        if (cityId) {
          pendingProjectIdRef.current = projectId || ''
          setSelectedCityId(cityId)
        } else {
          pendingProjectIdRef.current = ALL
          setSelectedCityId(ALL)
        }
      } else {
        pendingProjectIdRef.current = ALL
        setSelectedCityId(ALL)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (selectedCityId) {
      ;(async () => {
        let q = supabase.from('projects').select('id, city_id, name, address').order('name')
        if (selectedCityId !== ALL) q = q.eq('city_id', selectedCityId)
        const { data } = await q
        const projectsData = data || []
        setProjects(projectsData)
        const pending = pendingProjectIdRef.current
        if (pending && (pending === ALL || projectsData.some((p) => p.id === pending))) {
          setSelectedProjectId(pending)
          if (pendingAddDialogRef.current) {
            pendingAddDialogRef.current = false
            setNewResident({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '', project_id: pending !== ALL ? pending : '' })
            setPhoneError('')
            setAddDialogOpen(true)
          }
        } else {
          // אין פרויקט שמור / הפרויקט לא שייך לעיר — ברירת מחדל "כל הפרויקטים"
          setSelectedProjectId(ALL)
        }
        pendingProjectIdRef.current = ''
      })()
    } else {
      setProjects([])
      setSelectedProjectId('')
      setResidents([])
    }
  }, [selectedCityId])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(nameSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [nameSearch])

  useEffect(() => {
    fetchResidents()
  }, [selectedCityId, selectedProjectId, page, debouncedSearch])

  useEffect(() => {
    try {
      sessionStorage.setItem('residents-filter', JSON.stringify({
        cityId: selectedCityId,
        projectId: selectedProjectId,
      }))
    } catch {}
  }, [selectedCityId, selectedProjectId])

  async function fetchCities() {
    setLoadingCities(true)
    const { data } = await supabase.from('cities').select('id, name').order('name')
    setCities(data || [])
    setLoadingCities(false)
  }

  async function fetchProjects(cityId: string) {
    const { data } = await supabase
      .from('projects')
      .select('id, city_id, name, address')
      .eq('city_id', cityId)
      .order('name')
    setProjects(data || [])
  }

  async function fetchResidents(_projectId?: string) {
    if (!selectedProjectId || !selectedCityId) {
      setResidents([])
      setTotalCount(0)
      return
    }
    const seq = ++fetchSeqRef.current
    setLoadingResidents(true)
    const cityFiltered = selectedProjectId === ALL && selectedCityId !== ALL
    let q = supabase
      .from('residents')
      .select(
        cityFiltered
          ? 'id, project_id, name, address, phone, phone2, email, key_location, projects!inner(name, city_id)'
          : 'id, project_id, name, address, phone, phone2, email, key_location, projects(name, city_id)',
        { count: 'exact' }
      )
    if (selectedProjectId !== ALL) q = q.eq('project_id', selectedProjectId)
    else if (cityFiltered) q = q.eq('projects.city_id', selectedCityId)
    const term = debouncedSearch.replace(/[,()%*]/g, ' ').trim()
    if (term) {
      // טלפון: מתעלמים מ-"-" — מחפשים את הספרות גם עם מקף בכל מיקום, בשני שדות הטלפון
      const phonePatterns = phoneIlikePatterns(phoneSearchDigits(term))
      const phoneClauses = phonePatterns.length > 0
        ? phonePatterns.flatMap((p) => [`phone.ilike.${p}`, `phone2.ilike.${p}`])
        : [`phone.ilike.%${term}%`, `phone2.ilike.%${term}%`]
      q = q.or([`name.ilike.%${term}%`, `address.ilike.%${term}%`, ...phoneClauses].join(','))
    }
    const { data, count } = await q
      .order('name')
      .order('id')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (seq !== fetchSeqRef.current) return
    if (page > 0 && (!data || data.length === 0)) { setPage(Math.max(0, Math.ceil((count || 0) / PAGE_SIZE) - 1)); return }
    setResidents((data as unknown as Resident[]) || [])
    setTotalCount(count || 0)
    setLoadingResidents(false)
  }

  function isValidPhone(phone: string) {
    const cleaned = phone.replace(/[\s\-()]/g, '')
    return /^0\d{8,9}$/.test(cleaned)
  }

  function openAddDialog() {
    // אם כבר נבחר פרויקט מסוים בסינון - מציעים אותו כברירת מחדל; אחרת הכל נעול עד בחירת עיר ופרויקט
    setNewResident({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '', project_id: selectedProjectId && selectedProjectId !== ALL ? selectedProjectId : '' })
    setPhoneError('')
    setAddDialogOpen(true)
  }

  async function addResident() {
    if (!newResident.name.trim() || !newResident.project_id) return
    const phone = newResident.phone.trim()
    if (!phone) { setPhoneError('יש להזין מספר טלפון'); return }
    if (!isValidPhone(phone)) { setPhoneError('מספר טלפון לא תקין (לדוגמה: 050-1234567)'); return }
    setPhoneError('')
    setSaving(true)

    // טלפון שכבר קיים במערכת (בכל אחד משני שדות הטלפון, בלי תלות ב-"-") — חסום
    const newPhones = [phone, newResident.phone2.trim()].map(digitsOnly).filter(Boolean)
    const phoneClauses = newPhones.flatMap((d) =>
      phoneIlikePatterns(d).flatMap((p) => [`phone.ilike.${p}`, `phone2.ilike.${p}`])
    )
    const { data: phoneMatches } = await supabase
      .from('residents')
      .select('name, phone, phone2')
      .or(phoneClauses.join(','))
    const phoneTaken = (phoneMatches || []).find((r) =>
      [r.phone, r.phone2].some((p) => p && newPhones.includes(digitsOnly(p)))
    )
    if (phoneTaken) {
      setPhoneError(`הטלפון כבר קיים במערכת אצל הדייר "${phoneTaken.name}"`)
      setSaving(false)
      return
    }

    // שם זהה לדייר קיים — מבקשים אישור לפני היצירה
    const { count: sameNameCount } = await supabase
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .ilike('name', newResident.name.trim().replace(/[\\%_]/g, '\\$&'))
    if ((sameNameCount || 0) > 0 && !confirm(`כבר קיים במערכת דייר בשם "${newResident.name.trim()}". ליצור דייר נוסף עם אותו שם?`)) {
      setSaving(false)
      return
    }

    const { data: created, error } = await supabase.from('residents').insert({
      project_id: newResident.project_id,
      name: newResident.name.trim(),
      address: newResident.address.trim(),
      phone: phone,
      phone2: newResident.phone2.trim(),
      email: newResident.email.trim(),
      key_location: newResident.key_location.trim(),
    }).select('id').single()
    if (!error && created) {
      setNewResident({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '', project_id: '' })
      setAddDialogOpen(false)
      router.refresh()
      setSaving(false)
      router.push('/residents/' + created.id)
      return
    }
    setSaving(false)
  }

  async function saveEditResident() {
    if (!editingResident || !editingResident.name.trim() || !editingResident.project_id) return
    setSaving(true)
    const { error } = await supabase
      .from('residents')
      .update({
        name: editingResident.name.trim(),
        address: (editingResident.address || '').trim(),
        phone: (editingResident.phone || '').trim(),
        phone2: (editingResident.phone2 || '').trim(),
        email: (editingResident.email || '').trim(),
        key_location: (editingResident.key_location || '').trim(),
        project_id: editingResident.project_id,
      })
      .eq('id', editingResident.id)
    if (!error) {
      setEditDialogOpen(false)
      setEditingResident(null)
      fetchResidents(selectedProjectId)
    }
    setSaving(false)
  }

  function openDeleteConfirm(resident: Resident) {
    setDeleteConfirmId(resident.id)
    setDeleteConfirmName(resident.name)
    setDeleteConfirmOpen(true)
  }

  async function confirmDeleteResident() {
    if (!deleteConfirmId) return
    await supabase.from('residents').delete().eq('id', deleteConfirmId)
    setDeleteConfirmOpen(false)
    setDeleteConfirmId('')
    setDeleteConfirmName('')
    fetchResidents(selectedProjectId)
    router.refresh()
  }

  // ──────────────────────────────────────────────────
  // Orders Dialog
  // ──────────────────────────────────────────────────

  async function openOrdersDialog(resident: Resident) {
    setOrdersResident(resident)
    setOrdersDialogOpen(true)
    setLoadingOrders(true)

    const { data } = await supabase
      .from('orders')
      .select('id, order_number, status, payment_status, categories(name), suppliers(name), order_items(id, description, model, customer_price)')
      .eq('resident_id', resident.id)
      .order('created_at', { ascending: false })

    setResidentOrders((data as unknown as SimpleOrder[]) || [])
    setLoadingOrders(false)
  }

  // כשהשדה בפוקוס לא מחליפים את הכרטיס בספינר, אחרת השדה נמחק מה-DOM ומאבד פוקוס באמצע הקלדה
  const searchFocused = typeof document !== 'undefined' && !!searchInputRef.current && document.activeElement === searchInputRef.current
  const filteredProjects = selectedCityId === ALL ? projects : projects.filter((p) => p.city_id === selectedCityId)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">דיירים</h1>
          <p className="text-gray-500 mt-1">ניהול דיירים לפי פרויקט</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף דייר
        </Button>
      </div>

      {/* Dropdowns */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="citySelect">בחר עיר</Label>
              {loadingCities ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  טוען ערים...
                </div>
              ) : (
                <select
                  id="citySelect"
                  value={selectedCityId}
                  onChange={(e) => { setSelectedCityId(e.target.value); setPage(0) }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={ALL}>כל הערים</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="projectSelect">בחר פרויקט</Label>
              <select
                id="projectSelect"
                value={selectedProjectId}
                onChange={(e) => { setSelectedProjectId(e.target.value); setPage(0) }}
                disabled={!selectedCityId}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value={ALL}>כל הפרויקטים</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Residents table */}
      {!selectedProjectId ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">בחר פרויקט לצפייה בדיירים</p>
          </CardContent>
        </Card>
      ) : loadingResidents && !searchFocused ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : totalCount === 0 && !debouncedSearch && !searchFocused ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין דיירים בפרויקט זה</p>
            <p className="text-gray-400 text-sm mt-1">לחץ על "הוסף דייר" להוספת דייר ראשון</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">דיירים ({totalCount})</CardTitle>
              <Input
                ref={searchInputRef}
                value={nameSearch}
                onChange={(e) => { setNameSearch(e.target.value); setPage(0) }}
                placeholder="חיפוש לפי שם / טלפון / כתובת..."
                className="w-64 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-right py-3 px-4 font-medium">שם</th>
                    {selectedProjectId === ALL && <th className="text-right py-3 px-4 font-medium">פרויקט</th>}
                    <th className="text-right py-3 px-4 font-medium">כתובת</th>
                    <th className="text-right py-3 px-4 font-medium">טלפון</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map((resident) => (
                    <tr key={resident.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          onClick={() => router.push('/residents/' + resident.id)}
                          className="font-medium text-blue-700 hover:underline text-right"
                        >
                          {resident.name}
                        </button>
                      </td>
                      {selectedProjectId === ALL && (
                        <td className="py-3 px-4 text-gray-600">{resident.projects?.name || '—'}</td>
                      )}
                      <td className="py-3 px-4 text-gray-600">{resident.address || '—'}</td>
                      <td className="py-3 px-4">
                        {resident.phone
                          ? <div className="flex items-center gap-2">
                              <span className="text-gray-600" dir="ltr">{resident.phone}</span>
                              <ClickToCallButton phone={resident.phone} name={resident.name} className="p-1" />
                              <CopyButton value={resident.phone} title="העתק טלפון" />
                            </div>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openOrdersDialog(resident)}
                            className="text-green-600 hover:text-green-800 hover:bg-green-50"
                            title="הזמנות"
                          >
                            <ShoppingCart className="h-4 w-4" />
                            <span className="mr-1 text-xs">הזמנות</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemindersResident({ id: resident.id, name: resident.name })}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            title="תזכורות"
                          >
                            <CalendarClock className="h-4 w-4" />
                            <span className="mr-1 text-xs">תזכורות</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingResident({ ...resident })
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteConfirm(resident)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 text-sm text-gray-600">
                <span>
                  מציג {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} מתוך {totalCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    הקודם
                  </Button>
                  <span>עמוד {page + 1} מתוך {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    הבא
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Resident Dialog */}
      <ResidentRemindersDialog resident={remindersResident} onClose={() => setRemindersResident(null)} />

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת דייר חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div className="grid grid-cols-2 gap-3">
              <ResidentProjectPicker
                projectId={newResident.project_id}
                onChange={(project_id) => setNewResident({ ...newResident, project_id })}
                idPrefix="add"
              />
            </div>
            {!newResident.project_id && (
              <p className="text-xs text-gray-500">יש לבחור עיר ופרויקט מהרשימה כדי למלא את פרטי הדייר</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="residentName">שם הדייר</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentName"
                value={newResident.name}
                onChange={(e) => setNewResident({ ...newResident, name: e.target.value })}
                placeholder="לדוגמה: ישראל ישראלי"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentAddress">כתובת</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentAddress"
                value={newResident.address}
                onChange={(e) => setNewResident({ ...newResident, address: e.target.value })}
                placeholder="לדוגמה: רחוב הרצל 1, דירה 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentPhone">טלפון *</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentPhone"
                value={newResident.phone}
                onChange={(e) => { setNewResident({ ...newResident, phone: digitsOnly(e.target.value) }); setPhoneError('') }}
                placeholder="לדוגמה: 0501234567"
                inputMode="numeric"
                dir="ltr"
                className={phoneError ? 'border-red-500' : ''}
              />
              {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentPhone2">נייד נוסף</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentPhone2"
                value={newResident.phone2}
                onChange={(e) => setNewResident({ ...newResident, phone2: digitsOnly(e.target.value) })}
                placeholder="לדוגמה: 0501234567"
                inputMode="numeric"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentEmail">מייל</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentEmail"
                value={newResident.email}
                onChange={(e) => setNewResident({ ...newResident, email: e.target.value })}
                placeholder="example@gmail.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentKeyLocation">מיקום מפתח</Label>
              <Input
                disabled={!newResident.project_id}
                id="residentKeyLocation"
                value={newResident.key_location}
                onChange={(e) => setNewResident({ ...newResident, key_location: e.target.value })}
                placeholder="לדוגמה: לברר מול לקוח / גר שם"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>ביטול</Button>
              <Button onClick={addResident} disabled={saving || !newResident.project_id || !newResident.name.trim() || !newResident.phone.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף דייר'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Resident Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת דייר</DialogTitle>
          </DialogHeader>
          {editingResident && (
            <div className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label htmlFor="editName">שם הדייר</Label>
                <Input
                  id="editName"
                  value={editingResident.name}
                  onChange={(e) => setEditingResident({ ...editingResident, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ResidentProjectPicker
                  projectId={editingResident.project_id}
                  onChange={(project_id) => setEditingResident({ ...editingResident, project_id })}
                  idPrefix="edit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editAddress">כתובת</Label>
                <Input
                  id="editAddress"
                  value={editingResident.address}
                  onChange={(e) => setEditingResident({ ...editingResident, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone">טלפון</Label>
                <Input
                  id="editPhone"
                  value={editingResident.phone}
                  onChange={(e) => setEditingResident({ ...editingResident, phone: digitsOnly(e.target.value) })}
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone2">נייד נוסף</Label>
                <Input
                  id="editPhone2"
                  value={editingResident.phone2 || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, phone2: digitsOnly(e.target.value) })}
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEmail">מייל</Label>
                <Input
                  id="editEmail"
                  value={editingResident.email || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, email: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editKeyLocation">מיקום מפתח</Label>
                <Input
                  id="editKeyLocation"
                  value={editingResident.key_location || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, key_location: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>ביטול</Button>
                <Button onClick={saveEditResident} disabled={saving || !editingResident.name.trim() || !editingResident.project_id}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור שינויים'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת דייר</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק את <strong>{deleteConfirmName}</strong>?</p>
            <p className="text-sm text-red-600">פעולה זו תמחק את כל ההזמנות של הדייר ולא ניתן לבטלה.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>ביטול</Button>
              <Button variant="destructive" onClick={confirmDeleteResident}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {ordersResident && (
        <AddOrderDialog
          residentId={ordersResident.id}
          open={addOrderOpen}
          onOpenChange={setAddOrderOpen}
        />
      )}

      {/* Orders Dialog */}
      <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              הזמנות — {ordersResident?.name}
            </DialogTitle>
          </DialogHeader>

          <Button
            onClick={() => { setOrdersDialogOpen(false); setAddOrderOpen(true) }}
            className="w-fit"
          >
            <Plus className="h-4 w-4 ml-2" />
            הוסף הזמנה
          </Button>

          {loadingOrders ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : residentOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p>אין הזמנות</p>
            </div>
          ) : (
            <div className="space-y-3">
              {residentOrders.map((order) => (
                <div key={order.id} className="border rounded-lg overflow-hidden">
                  {/* Order row */}
                  <div className="flex items-center justify-between p-3 bg-white">
                    <div className="flex items-center gap-2 flex-wrap">
                      <OrderNumber orderNumber={order.order_number} />
                      <span className="font-medium text-gray-900">{order.categories?.name}</span>
                      <Badge variant={STATUS_COLORS[order.status] as any}>
                        {STATUS_LABELS[order.status]}
                      </Badge>
                      <Badge variant={PAYMENT_STATUS_COLORS[order.payment_status] as any}>
                        {PAYMENT_STATUS_LABELS[order.payment_status]}
                      </Badge>
                      {order.suppliers && (
                        <span className="text-sm text-gray-500">{order.suppliers.name}</span>
                      )}
                    </div>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="outline" size="sm">ערוך</Button>
                    </Link>
                  </div>
                  {/* Items sub-list */}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="border-t bg-gray-50 px-4 py-2 space-y-1">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">
                            {item.description}
                            {item.model ? <span className="text-gray-400 mr-1"> — {item.model}</span> : null}
                          </span>
                          <span className="text-gray-500 text-xs mr-4">
                            ₪{(item.customer_price || 0).toLocaleString('he-IL')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
