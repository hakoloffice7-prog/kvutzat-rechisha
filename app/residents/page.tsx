'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users, Loader2, Pencil, Trash2, ShoppingCart, X, ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/utils'
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
type Category = { id: string; name: string }
type Supplier = { id: string; name: string; category_id: string }

type OrderStatus = typeof STATUS_ORDER[number]
type PaymentStatus = 'not_paid' | 'advance' | 'paid_full'

type OrderItem = {
  id: string
  order_id: string
  description: string
  model: string
  customer_price: number
  supplier_price: number
}

type OrderItemDraft = Omit<OrderItem, 'id' | 'order_id'> & { id?: string; saving?: boolean }

type OrderRow = {
  id: string | null
  category_id: string
  status: OrderStatus
  payment_status: PaymentStatus
  supplier_id: string | null
  total_price: number
  deposit: number
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] =
  STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))

const PAYMENT_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'not_paid', label: 'לא שילם' },
  { value: 'advance', label: 'מקדמה' },
  { value: 'paid_full', label: 'שילם הכל' },
]

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
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orderRows, setOrderRows] = useState<OrderRow[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)

  // Expanded category for order items panel
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemDrafts, setItemDrafts] = useState<OrderItemDraft[]>([])

  useEffect(() => { fetchCities() }, [])

  useEffect(() => {
    if (selectedCityId) {
      fetchProjects(selectedCityId)
      setSelectedProjectId('')
      setResidents([])
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

  async function addResident() {
    if (!newResident.name.trim() || !selectedProjectId) return
    setSaving(true)
    const { error } = await supabase.from('residents').insert({
      project_id: selectedProjectId,
      name: newResident.name.trim(),
      address: newResident.address.trim(),
      phone: newResident.phone.trim(),
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

  async function deleteResident(id: string) {
    if (!confirm('האם למחוק דייר זה?')) return
    await supabase.from('residents').delete().eq('id', id)
    fetchResidents(selectedProjectId)
  }

  // ──────────────────────────────────────────────────
  // Orders Dialog
  // ──────────────────────────────────────────────────

  async function openOrdersDialog(resident: Resident) {
    setOrdersResident(resident)
    setOrdersDialogOpen(true)
    setExpandedCategoryId(null)
    setOrderItems([])
    setItemDrafts([])
    setLoadingOrders(true)

    const [{ data: cats }, { data: sups }, { data: existingOrders }] = await Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('suppliers').select('id, name, category_id').order('name'),
      supabase.from('orders')
        .select('id, category_id, status, payment_status, supplier_id, total_price, deposit')
        .eq('resident_id', resident.id),
    ])

    const catsData: Category[] = cats || []
    const supsData: Supplier[] = sups || []
    const ordersData = existingOrders || []

    setCategories(catsData)
    setSuppliers(supsData)

    const rows: OrderRow[] = catsData.map(cat => {
      const existing = ordersData.find(o => o.category_id === cat.id)
      return {
        id: existing?.id || null,
        category_id: cat.id,
        status: (existing?.status as OrderStatus) || 'lead',
        payment_status: (existing?.payment_status as PaymentStatus) || 'not_paid',
        supplier_id: existing?.supplier_id || null,
        total_price: existing?.total_price || 0,
        deposit: existing?.deposit || 0,
      }
    })
    setOrderRows(rows)
    setLoadingOrders(false)
  }

  async function saveOrderRow(categoryId: string) {
    if (!ordersResident) return
    setSavingOrderId(categoryId)

    const row = orderRows.find(r => r.category_id === categoryId)
    if (!row) { setSavingOrderId(null); return }

    if (row.id) {
      // UPDATE
      await supabase.from('orders').update({
        status: row.status,
        payment_status: row.payment_status,
        supplier_id: row.supplier_id || null,
        total_price: row.total_price || 0,
        deposit: row.deposit || 0,
      }).eq('id', row.id)
    } else {
      // INSERT
      const { data } = await supabase.from('orders').insert({
        resident_id: ordersResident.id,
        category_id: categoryId,
        status: row.status,
        payment_status: row.payment_status,
        supplier_id: row.supplier_id || null,
        total_price: row.total_price || 0,
        deposit: row.deposit || 0,
      }).select('id').single()

      if (data?.id) {
        setOrderRows(prev => prev.map(r =>
          r.category_id === categoryId ? { ...r, id: data.id } : r
        ))
      }
    }
    setSavingOrderId(null)
  }

  function updateOrderRow(categoryId: string, patch: Partial<OrderRow>) {
    setOrderRows(prev => prev.map(r =>
      r.category_id === categoryId ? { ...r, ...patch } : r
    ))
  }

  // ──────────────────────────────────────────────────
  // Order Items Panel
  // ──────────────────────────────────────────────────

  async function openItemsPanel(category: Category) {
    if (expandedCategoryId === category.id) {
      setExpandedCategoryId(null)
      return
    }
    setExpandedCategoryId(category.id)
    setOrderItems([])
    setItemDrafts([])

    const row = orderRows.find(r => r.category_id === category.id)
    if (!row?.id) return

    setLoadingItems(true)
    const { data } = await supabase
      .from('order_items')
      .select('id, order_id, description, model, customer_price, supplier_price')
      .eq('order_id', row.id)
      .order('id')
    setOrderItems(data || [])
    setLoadingItems(false)
  }

  function addItemDraft() {
    setItemDrafts(prev => [...prev, {
      description: '',
      model: '',
      customer_price: 0,
      supplier_price: 0,
    }])
  }

  async function saveItemDraft(draftIndex: number) {
    if (!ordersResident || expandedCategoryId === null) return
    const draft = itemDrafts[draftIndex]
    if (!draft.description.trim()) return

    // Ensure the order exists first
    let row = orderRows.find(r => r.category_id === expandedCategoryId)
    if (!row) return

    if (!row.id) {
      await saveOrderRow(expandedCategoryId)
      // re-read updated row
      row = orderRows.find(r => r.category_id === expandedCategoryId)
      if (!row?.id) return
    }

    setItemDrafts(prev => prev.map((d, i) => i === draftIndex ? { ...d, saving: true } : d))

    const { data, error } = await supabase.from('order_items').insert({
      order_id: row.id,
      description: draft.description.trim(),
      model: draft.model.trim(),
      customer_price: Number(draft.customer_price) || 0,
      supplier_price: Number(draft.supplier_price) || 0,
    }).select('id, order_id, description, model, customer_price, supplier_price').single()

    if (!error && data) {
      setOrderItems(prev => [...prev, data])
      setItemDrafts(prev => prev.filter((_, i) => i !== draftIndex))
    } else {
      setItemDrafts(prev => prev.map((d, i) => i === draftIndex ? { ...d, saving: false } : d))
    }
  }

  async function saveExistingItem(item: OrderItem) {
    await supabase.from('order_items').update({
      description: item.description,
      model: item.model,
      customer_price: Number(item.customer_price) || 0,
      supplier_price: Number(item.supplier_price) || 0,
    }).eq('id', item.id)
    // optimistic — already updated in state
  }

  async function deleteItem(itemId: string) {
    if (!confirm('למחוק פריט זה?')) return
    await supabase.from('order_items').delete().eq('id', itemId)
    setOrderItems(prev => prev.filter(i => i.id !== itemId))
  }

  function updateExistingItem(id: string, patch: Partial<OrderItem>) {
    setOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  const totalProfit = orderItems.reduce((sum, i) =>
    sum + ((Number(i.customer_price) || 0) - (Number(i.supplier_price) || 0)), 0)

  const filteredProjects = projects.filter((p) => p.city_id === selectedCityId)

  const expandedCategory = categories.find(c => c.id === expandedCategoryId)
  const expandedRow = orderRows.find(r => r.category_id === expandedCategoryId)

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
            <CardTitle className="text-lg">דיירים ({residents.length})</CardTitle>
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
                            onClick={() => deleteResident(resident.id)}
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
              <Label htmlFor="residentPhone">טלפון</Label>
              <Input
                id="residentPhone"
                value={newResident.phone}
                onChange={(e) => setNewResident({ ...newResident, phone: e.target.value })}
                placeholder="לדוגמה: 050-1234567"
                dir="ltr"
              />
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
              <Button onClick={addResident} disabled={saving || !newResident.name.trim()}>
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

      {/* Orders Dialog */}
      <Dialog open={ordersDialogOpen} onOpenChange={(open) => {
        setOrdersDialogOpen(open)
        if (!open) {
          setExpandedCategoryId(null)
          setOrderItems([])
          setItemDrafts([])
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              הזמנות — {ordersResident?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingOrders ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Categories table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-600">
                      <th className="text-right py-3 px-4 font-medium">קטגוריה</th>
                      <th className="text-right py-3 px-4 font-medium">סטטוס</th>
                      <th className="text-right py-3 px-4 font-medium">תשלום</th>
                      <th className="text-right py-3 px-4 font-medium">ספק</th>
                      <th className="text-right py-3 px-4 font-medium">מחיר ₪</th>
                      <th className="text-right py-3 px-4 font-medium">מקדמה ₪</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => {
                      const row = orderRows.find(r => r.category_id === cat.id)
                      if (!row) return null
                      const catSuppliers = suppliers.filter(s => s.category_id === cat.id)
                      const isExpanded = expandedCategoryId === cat.id
                      const isSaving = savingOrderId === cat.id

                      return (
                        <tr
                          key={cat.id}
                          className={`border-b transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="py-3 px-4 font-medium">{cat.name}</td>
                          <td className="py-3 px-4">
                            <select
                              value={row.status}
                              onChange={(e) => updateOrderRow(cat.id, { status: e.target.value as OrderStatus })}
                              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={row.payment_status}
                              onChange={(e) => updateOrderRow(cat.id, { payment_status: e.target.value as PaymentStatus })}
                              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {PAYMENT_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={row.supplier_id || ''}
                              onChange={(e) => updateOrderRow(cat.id, { supplier_id: e.target.value || null })}
                              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— ללא ספק —</option>
                              {catSuppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              value={row.total_price || ''}
                              onChange={(e) => updateOrderRow(cat.id, { total_price: Number(e.target.value) })}
                              className="h-8 text-sm w-24"
                              dir="ltr"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              value={row.deposit || ''}
                              onChange={(e) => updateOrderRow(cat.id, { deposit: Number(e.target.value) })}
                              className="h-8 text-sm w-24"
                              dir="ltr"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-1 justify-end items-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => saveOrderRow(cat.id)}
                                disabled={isSaving}
                                className="text-xs"
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'שמור'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openItemsPanel(cat)}
                                className={`text-xs ${isExpanded ? 'text-blue-600' : 'text-gray-500'}`}
                                title="פריטים"
                              >
                                פריטים
                                {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                              </Button>
                              {row.id && (
                                <Link href={`/orders/${row.id}`}>
                                  <Button size="sm" variant="ghost" className="text-xs text-gray-500" title="פרטים מלאים (מדידות, אישור, התקנה)">
                                    פרטים מלאים
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Order Items Panel */}
              {expandedCategoryId && expandedCategory && (
                <div className="border rounded-lg p-4 bg-white space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 text-base">
                      פרטי הזמנה — {expandedCategory.name} | {ordersResident?.name}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setExpandedCategoryId(null); setOrderItems([]); setItemDrafts([]) }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {!expandedRow?.id && (
                    <p className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                      שמור תחילה את הסטטוס כדי להוסיף פריטים
                    </p>
                  )}

                  {loadingItems ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-gray-500 bg-gray-50">
                              <th className="text-right py-2 px-3 font-medium">#</th>
                              <th className="text-right py-2 px-3 font-medium">תיאור</th>
                              <th className="text-right py-2 px-3 font-medium">דגם</th>
                              <th className="text-right py-2 px-3 font-medium">מחיר לקוח ₪</th>
                              <th className="text-right py-2 px-3 font-medium">מחיר ספק ₪</th>
                              <th className="text-right py-2 px-3 font-medium">רווח ₪</th>
                              <th className="py-2 px-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Existing items */}
                            {orderItems.map((item, idx) => {
                              const profit = (Number(item.customer_price) || 0) - (Number(item.supplier_price) || 0)
                              return (
                                <tr key={item.id} className="border-b hover:bg-gray-50">
                                  <td className="py-2 px-3 text-gray-500">{idx + 1}</td>
                                  <td className="py-2 px-3">
                                    <Input
                                      value={item.description}
                                      onChange={(e) => updateExistingItem(item.id, { description: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input
                                      value={item.model}
                                      onChange={(e) => updateExistingItem(item.id, { model: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input
                                      type="number"
                                      value={item.customer_price}
                                      onChange={(e) => updateExistingItem(item.id, { customer_price: Number(e.target.value) })}
                                      className="h-7 text-sm w-24"
                                      dir="ltr"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input
                                      type="number"
                                      value={item.supplier_price}
                                      onChange={(e) => updateExistingItem(item.id, { supplier_price: Number(e.target.value) })}
                                      className="h-7 text-sm w-24"
                                      dir="ltr"
                                    />
                                  </td>
                                  <td className={`py-2 px-3 font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {profit.toLocaleString('he-IL')}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => saveExistingItem(item)}
                                        className="h-7 text-xs px-2"
                                      >
                                        שמור
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => deleteItem(item.id)}
                                        className="h-7 text-red-500 hover:text-red-700 px-2"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}

                            {/* Draft rows */}
                            {itemDrafts.map((draft, draftIdx) => (
                              <tr key={`draft-${draftIdx}`} className="border-b bg-blue-50">
                                <td className="py-2 px-3 text-gray-400">—</td>
                                <td className="py-2 px-3">
                                  <Input
                                    value={draft.description}
                                    onChange={(e) => setItemDrafts(prev => prev.map((d, i) => i === draftIdx ? { ...d, description: e.target.value } : d))}
                                    placeholder="תיאור"
                                    className="h-7 text-sm"
                                    autoFocus
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    value={draft.model}
                                    onChange={(e) => setItemDrafts(prev => prev.map((d, i) => i === draftIdx ? { ...d, model: e.target.value } : d))}
                                    placeholder="דגם"
                                    className="h-7 text-sm"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    value={draft.customer_price}
                                    onChange={(e) => setItemDrafts(prev => prev.map((d, i) => i === draftIdx ? { ...d, customer_price: Number(e.target.value) } : d))}
                                    className="h-7 text-sm w-24"
                                    dir="ltr"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <Input
                                    type="number"
                                    value={draft.supplier_price}
                                    onChange={(e) => setItemDrafts(prev => prev.map((d, i) => i === draftIdx ? { ...d, supplier_price: Number(e.target.value) } : d))}
                                    className="h-7 text-sm w-24"
                                    dir="ltr"
                                  />
                                </td>
                                <td className="py-2 px-3 text-gray-400 font-medium">
                                  {((Number(draft.customer_price) || 0) - (Number(draft.supplier_price) || 0)).toLocaleString('he-IL')}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => saveItemDraft(draftIdx)}
                                      disabled={draft.saving || !draft.description.trim()}
                                      className="h-7 text-xs px-2"
                                    >
                                      {draft.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'שמור'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setItemDrafts(prev => prev.filter((_, i) => i !== draftIdx))}
                                      className="h-7 text-red-500 hover:text-red-700 px-2"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={addItemDraft}
                          disabled={!expandedRow?.id}
                        >
                          <Plus className="h-3.5 w-3.5 ml-1" />
                          הוסף פריט
                        </Button>
                        <div className="text-sm font-semibold text-gray-700">
                          סה"כ רווח:{' '}
                          <span className={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ₪{totalProfit.toLocaleString('he-IL')}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
