'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users, Loader2, Pencil, Trash2, ShoppingCart, Phone } from 'lucide-react'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/lib/utils'
import Link from 'next/link'

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
}
type OrderItem = { id: string; description: string; model: string; customer_price: number; supplier_price: number }

type SimpleOrder = {
  id: string
  status: string
  payment_status: string
  categories: { name: string }
  suppliers: { name: string } | null
  order_items: OrderItem[]
}

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
  const [newResident, setNewResident] = useState({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '' })
  const [editingResident, setEditingResident] = useState<Resident | null>(null)

  // Orders dialog state
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false)
  const [ordersResident, setOrdersResident] = useState<Resident | null>(null)
  const [residentOrders, setResidentOrders] = useState<SimpleOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Filter persistence
  const pendingProjectIdRef = useRef('')
  const pendingAddDialogRef = useRef(false)
  // Delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  // Name search
  const [nameSearch, setNameSearch] = useState('')
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
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (selectedCityId) {
      ;(async () => {
        const { data } = await supabase
          .from('projects')
          .select('id, city_id, name, address')
          .eq('city_id', selectedCityId)
          .order('name')
        const projectsData = data || []
        setProjects(projectsData)
        const pending = pendingProjectIdRef.current
        if (pending && projectsData.some((p) => p.id === pending)) {
          setSelectedProjectId(pending)
          if (pendingAddDialogRef.current) {
            pendingAddDialogRef.current = false
            setAddDialogOpen(true)
          }
        } else {
          setSelectedProjectId('')
          setResidents([])
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
    if (selectedProjectId) fetchResidents(selectedProjectId)
    else setResidents([])
  }, [selectedProjectId])

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

  async function fetchResidents(projectId: string) {
    setLoadingResidents(true)
    const { data } = await supabase
      .from('residents')
      .select('id, project_id, name, address, phone, phone2, email, key_location')
      .eq('project_id', projectId)
      .order('name')
    setResidents(data || [])
    setLoadingResidents(false)
  }

  function isValidPhone(phone: string) {
    const cleaned = phone.replace(/[\s\-()]/g, '')
    return /^0\d{8,9}$/.test(cleaned)
  }

  async function addResident() {
    if (!newResident.name.trim() || !selectedProjectId) return
    const phone = newResident.phone.trim()
    if (!phone) { setPhoneError('יש להזין מספר טלפון'); return }
    if (!isValidPhone(phone)) { setPhoneError('מספר טלפון לא תקין (לדוגמה: 050-1234567)'); return }
    setPhoneError('')
    setSaving(true)
    const { error } = await supabase.from('residents').insert({
      project_id: selectedProjectId,
      name: newResident.name.trim(),
      address: newResident.address.trim(),
      phone: phone,
      phone2: newResident.phone2.trim(),
      email: newResident.email.trim(),
      key_location: newResident.key_location.trim(),
    })
    if (!error) {
      setNewResident({ name: '', address: '', phone: '', phone2: '', email: '', key_location: '' })
      setAddDialogOpen(false)
      fetchResidents(selectedProjectId)
    }
    setSaving(false)
  }

  async function saveEditResident() {
    if (!editingResident || !editingResident.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('residents')
      .update({
        name: editingResident.name.trim(),
        address: editingResident.address.trim(),
        phone: editingResident.phone.trim(),
        phone2: editingResident.phone2.trim(),
        email: editingResident.email.trim(),
        key_location: editingResident.key_location.trim(),
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
      .select('id, status, payment_status, categories(name), suppliers(name), order_items(id, description, model, customer_price, supplier_price)')
      .eq('resident_id', resident.id)
      .order('created_at', { ascending: false })

    setResidentOrders((data as unknown as SimpleOrder[]) || [])
    setLoadingOrders(false)
  }

  const filteredProjects = projects.filter((p) => p.city_id === selectedCityId)

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">דיירים</h1>
          <p className="text-gray-500 mt-1">ניהול דיירים לפי פרויקט</p>
        </div>
        {selectedProjectId && (
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 ml-2" />
            הוסף דייר
          </Button>
        )}
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
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- בחר עיר --</option>
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
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!selectedCityId}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר פרויקט --</option>
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
      ) : loadingResidents ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : residents.length === 0 ? (
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
              <CardTitle className="text-lg">דיירים ({residents.length})</CardTitle>
              <Input
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="חיפוש לפי שם..."
                className="w-44 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-right py-3 px-4 font-medium">שם</th>
                    <th className="text-right py-3 px-4 font-medium">כתובת</th>
                    <th className="text-right py-3 px-4 font-medium">טלפון</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {(nameSearch.trim() ? residents.filter(r => r.name.includes(nameSearch.trim())) : residents).map((resident) => (
                    <tr key={resident.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          onClick={() => router.push('/residents/' + resident.id)}
                          className="font-medium text-blue-700 hover:underline text-right"
                        >
                          {resident.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{resident.address || '—'}</td>
                      <td className="py-3 px-4">
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
          </CardContent>
        </Card>
      )}

      {/* Add Resident Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת דייר חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div className="space-y-2">
              <Label htmlFor="residentName">שם הדייר</Label>
              <Input
                id="residentName"
                value={newResident.name}
                onChange={(e) => setNewResident({ ...newResident, name: e.target.value })}
                placeholder="לדוגמה: ישראל ישראלי"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentAddress">כתובת</Label>
              <Input
                id="residentAddress"
                value={newResident.address}
                onChange={(e) => setNewResident({ ...newResident, address: e.target.value })}
                placeholder="לדוגמה: רחוב הרצל 1, דירה 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentPhone">טלפון *</Label>
              <Input
                id="residentPhone"
                value={newResident.phone}
                onChange={(e) => { setNewResident({ ...newResident, phone: e.target.value }); setPhoneError('') }}
                placeholder="לדוגמה: 050-1234567"
                dir="ltr"
                className={phoneError ? 'border-red-500' : ''}
              />
              {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentPhone2">נייד נוסף</Label>
              <Input
                id="residentPhone2"
                value={newResident.phone2}
                onChange={(e) => setNewResident({ ...newResident, phone2: e.target.value })}
                placeholder="לדוגמה: 050-1234567"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentEmail">מייל</Label>
              <Input
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
                id="residentKeyLocation"
                value={newResident.key_location}
                onChange={(e) => setNewResident({ ...newResident, key_location: e.target.value })}
                placeholder="לדוגמה: לברר מול לקוח / גר שם"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>ביטול</Button>
              <Button onClick={addResident} disabled={saving || !newResident.name.trim() || !newResident.phone.trim()}>
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
                  onChange={(e) => setEditingResident({ ...editingResident, phone: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone2">נייד נוסף</Label>
                <Input
                  id="editPhone2"
                  value={editingResident.phone2 || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, phone2: e.target.value })}
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
                <Button onClick={saveEditResident} disabled={saving || !editingResident.name.trim()}>
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

      {/* Orders Dialog */}
      <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              הזמנות — {ordersResident?.name}
            </DialogTitle>
          </DialogHeader>

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
