'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, ShoppingCart, Loader2, Trash2, Phone, MapPin, ArrowLeft, Edit2, Mail, KeyRound, X, Save, Star, CalendarClock } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { STATUS_LABELS, STATUS_COLORS, STATUS_ORDER, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, formatCurrency, getDebtStatus, calcSupplierPrice } from '@/lib/utils'
import { useIsAdmin } from '@/components/RoleProvider'

type Resident = {
  id: string
  name: string
  address: string
  phone: string
  phone2: string | null
  email: string | null
  key_location: string | null
  projects: { id: string; name: string; cities: { name: string } }
}

type Order = {
  id: string
  status: string
  payment_status: string
  created_at: string
  notes: string
  total_price: number | null
  is_global_price: boolean
  global_supplier_price: number | null
  satisfaction_rating: number | null
  categories: { id: string; name: string }
  suppliers: { id: string; name: string } | null
  order_items: { customer_price: number; supplier_price: number }[]
  order_payments: { amount: number }[]
}

type Category = { id: string; name: string }
type Supplier = { id: string; name: string; category_id: string }
type NewOrderItem = {
  description: string
  model: string
  customer_price: string
  supplier_price: string
  profit_percent: string
  supplier_price_touched: boolean
}

export default function ResidentPage() {
  const params = useParams()
  const router = useRouter()
  const residentId = params.id as string
  const isAdmin = useIsAdmin()

  const [resident, setResident] = useState<Resident | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newOrder, setNewOrder] = useState({
    category_id: '',
    supplier_id: '',
    status: 'interested',
    payment_status: 'not_paid',
    notes: '',
    measured_at: '',
  })
  const [saving, setSaving] = useState(false)
  const [newOrderItems, setNewOrderItems] = useState<NewOrderItem[]>([])
  const [residentForm, setResidentForm] = useState({
    name: '', address: '', phone: '', phone2: '', email: '', key_location: '',
  })
  const [savingResident, setSavingResident] = useState(false)
  const [residentDirty, setResidentDirty] = useState(false)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [newReminder, setNewReminder] = useState({ message: '', remind_at: '' })
  const [savingReminder, setSavingReminder] = useState(false)
  const supabase = createClient()

  function addNewOrderItem() {
    setNewOrderItems(prev => [...prev, {
      description: '', model: '', customer_price: '', supplier_price: '',
      profit_percent: '10', supplier_price_touched: false,
    }])
  }
  function updateNewOrderItem(idx: number, field: keyof NewOrderItem, value: string) {
    setNewOrderItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (field === 'supplier_price') {
        return { ...item, supplier_price: value, supplier_price_touched: true }
      }
      if (field === 'customer_price' || field === 'profit_percent') {
        const updated = { ...item, [field]: value }
        if (!item.supplier_price_touched) {
          const customer = parseFloat(field === 'customer_price' ? value : item.customer_price) || 0
          const percent = parseFloat(field === 'profit_percent' ? value : item.profit_percent) || 0
          updated.supplier_price = String(calcSupplierPrice(customer, percent))
        }
        return updated
      }
      return { ...item, [field]: value }
    }))
  }
  function removeNewOrderItem(idx: number) {
    setNewOrderItems(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    fetchData()
  }, [residentId])

  async function fetchData() {
    setLoading(true)
    const [
      { data: residentData },
      { data: ordersData },
      { data: categoriesData },
      { data: suppliersData },
    ] = await Promise.all([
      supabase
        .from('residents')
        .select('*, projects(id, name, cities(name))')
        .eq('id', residentId)
        .single(),
      supabase
        .from('orders')
        .select('*, categories(id, name), suppliers(id, name), order_items(customer_price, order_item_costs(supplier_price)), order_payments(amount), order_costs(global_supplier_price)')
        .eq('resident_id', residentId)
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ])

    if (residentData) {
      setResident(residentData)
      setResidentForm({
        name: residentData.name || '',
        address: residentData.address || '',
        phone: residentData.phone || '',
        phone2: residentData.phone2 || '',
        email: residentData.email || '',
        key_location: residentData.key_location || '',
      })
      setResidentDirty(false)
    }
    if (ordersData) {
      setOrders(ordersData.map((order: any) => ({
        ...order,
        global_supplier_price: order.order_costs?.global_supplier_price ?? 0,
        order_items: (order.order_items || []).map((item: any) => ({
          ...item,
          supplier_price: item.order_item_costs?.supplier_price ?? 0,
        })),
      })))
    }
    if (categoriesData) setCategories(categoriesData)
    if (suppliersData) setSuppliers(suppliersData)
    setLoading(false)
  }

  async function addOrder() {
    if (!newOrder.category_id) return
    setSaving(true)

    const validItems = newOrderItems.filter(i => i.description.trim())
    const totalPrice = validItems.reduce((sum, i) => sum + (parseFloat(i.customer_price) || 0), 0)

    const { data: orderData, error } = await supabase.from('orders').insert({
      resident_id: residentId,
      category_id: newOrder.category_id,
      supplier_id: newOrder.supplier_id || null,
      status: newOrder.status,
      payment_status: newOrder.payment_status,
      notes: newOrder.notes,
      measured_at: newOrder.status === 'measured' ? (newOrder.measured_at || new Date().toISOString().slice(0, 10)) : null,
      total_price: totalPrice,
    }).select('id').single()

    if (!error && orderData) {
      if (validItems.length > 0) {
        const { data: insertedItems } = await supabase.from('order_items').insert(
          validItems.map(i => ({
            order_id: orderData.id,
            description: i.description.trim(),
            model: i.model.trim(),
            customer_price: parseFloat(i.customer_price) || 0,
          }))
        ).select('id')

        if (isAdmin && insertedItems) {
          await supabase.from('order_item_costs').insert(
            insertedItems.map((row, idx) => ({
              order_item_id: row.id,
              supplier_price: parseFloat(validItems[idx].supplier_price) || 0,
            }))
          )
        }
      }
      router.push(`/orders/${orderData.id}`)
    }
    setSaving(false)
  }

  function updateResidentField(field: keyof typeof residentForm, value: string) {
    setResidentForm((prev) => ({ ...prev, [field]: value }))
    setResidentDirty(true)
  }

  async function saveResident() {
    if (!residentForm.name.trim()) return
    setSavingResident(true)
    const { error } = await supabase
      .from('residents')
      .update({
        name: residentForm.name.trim(),
        address: residentForm.address.trim(),
        phone: residentForm.phone.trim(),
        phone2: residentForm.phone2.trim(),
        email: residentForm.email.trim(),
        key_location: residentForm.key_location.trim(),
      })
      .eq('id', residentId)
    if (!error) {
      setResidentDirty(false)
      fetchData()
    }
    setSavingResident(false)
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('האם למחוק הזמנה זו?')) return
    await supabase.from('orders').delete().eq('id', orderId)
    fetchData()
  }

  async function addReminder() {
    if (!newReminder.message.trim() || !newReminder.remind_at) return
    setSavingReminder(true)
    const { error } = await supabase.from('notifications').insert({
      type: 'manual_reminder',
      resident_id: residentId,
      message: newReminder.message.trim(),
      remind_at: newReminder.remind_at,
      is_read: false,
    })
    if (!error) {
      setReminderDialogOpen(false)
      setNewReminder({ message: '', remind_at: '' })
    }
    setSavingReminder(false)
  }

  // מחיר גלובלי נשמר ב-order.total_price/global_supplier_price ולא בפריטים
  // (הפריטים משמשים רק לתיאור במצב הזה) - אסור לחשב את הסכום מהפריטים בלבד
  const getOrderTotal = (order: Order) => {
    if (order.is_global_price) {
      const revenue = order.total_price || 0
      const cost = order.global_supplier_price || 0
      return { revenue, profit: revenue - cost }
    }
    const items = order.order_items
    if (!items || items.length === 0) return { revenue: 0, profit: 0 }
    const revenue = items.reduce((sum, item) => sum + (item.customer_price || 0), 0)
    const cost = items.reduce((sum, item) => sum + (item.supplier_price || 0), 0)
    return { revenue, profit: revenue - cost }
  }

  // סטטוס התשלום מחושב תמיד מחדש ממחיר ותשלומים בפועל, ולא נלקח מהעמודה
  // השמורה (order.payment_status) — היא יכולה להתיישן אם ההזמנה לא נשמרה מחדש.
  const getEffectivePaymentStatus = (order: Order) => {
    const totalPaid = (order.order_payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
    return getDebtStatus(getOrderTotal(order).revenue, totalPaid)
  }

  const filteredSuppliers = newOrder.category_id
    ? suppliers.filter(s => s.category_id === newOrder.category_id)
    : suppliers

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!resident) {
    return <div className="text-center py-12 text-gray-500">דייר לא נמצא</div>
  }

  return (
    <div className="space-y-6">
      {/* Back + Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          חזור
        </button>
        <span>/</span>
        <span>{resident.projects?.cities?.name}</span>
        <span>/</span>
        <Link href={`/projects/${resident.projects?.id}`} className="hover:text-blue-600">
          {resident.projects?.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{resident.name}</span>
      </div>

      {/* Resident Info — כל השדות תמיד ניתנים לעריכה, נשמר רק בלחיצה על "שמור שינויים" */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[280px] space-y-3">
              <div className="space-y-1">
                <Label htmlFor="residentFormName" className="text-xs text-gray-500">שם הדייר</Label>
                <Input
                  id="residentFormName"
                  value={residentForm.name}
                  onChange={(e) => updateResidentField('name', e.target.value)}
                  className="text-xl font-bold h-11"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="residentFormAddress" className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> כתובת
                  </Label>
                  <Input
                    id="residentFormAddress"
                    value={residentForm.address}
                    onChange={(e) => updateResidentField('address', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="residentFormPhone" className="text-xs text-gray-500 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> טלפון
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="residentFormPhone"
                      value={residentForm.phone}
                      onChange={(e) => updateResidentField('phone', e.target.value)}
                      dir="ltr"
                    />
                    {resident.phone && (
                      <a href={`tel:${resident.phone}`} className="inline-flex items-center justify-center p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors shrink-0" title="חייג">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="residentFormPhone2" className="text-xs text-gray-500 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> נייד נוסף
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="residentFormPhone2"
                      value={residentForm.phone2}
                      onChange={(e) => updateResidentField('phone2', e.target.value)}
                      dir="ltr"
                    />
                    {resident.phone2 && (
                      <a href={`tel:${resident.phone2}`} className="inline-flex items-center justify-center p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors shrink-0" title="חייג">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="residentFormEmail" className="text-xs text-gray-500 flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> מייל
                  </Label>
                  <Input
                    id="residentFormEmail"
                    value={residentForm.email}
                    onChange={(e) => updateResidentField('email', e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="residentFormKeyLocation" className="text-xs text-gray-500 flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" /> מיקום מפתח
                  </Label>
                  <Input
                    id="residentFormKeyLocation"
                    value={residentForm.key_location}
                    onChange={(e) => updateResidentField('key_location', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveResident} disabled={savingResident || !residentForm.name.trim() || !residentDirty}>
                  {savingResident ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                  שמור שינויים
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-end">
              <Dialog open={reminderDialogOpen} onOpenChange={(open) => {
                setReminderDialogOpen(open)
                if (!open) setNewReminder({ message: '', remind_at: '' })
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CalendarClock className="h-4 w-4 ml-2" />
                    תזכורת ידנית
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>יצירת תזכורת ל{resident.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>תזכורת *</Label>
                      <Input
                        value={newReminder.message}
                        onChange={(e) => setNewReminder({ ...newReminder, message: e.target.value })}
                        placeholder='לדוגמה: "להתקשר בעוד שבוע לבירור" או "לתאם מחר"'
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>תאריך יעד *</Label>
                      <Input
                        type="date"
                        value={newReminder.remind_at}
                        onChange={(e) => setNewReminder({ ...newReminder, remind_at: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>ביטול</Button>
                      <Button onClick={addReminder} disabled={savingReminder || !newReminder.message.trim() || !newReminder.remind_at}>
                        {savingReminder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'צור תזכורת'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open)
                if (!open) {
                  setNewOrder({ category_id: '', supplier_id: '', status: 'interested', payment_status: 'not_paid', notes: '', measured_at: '' })
                  setNewOrderItems([])
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 ml-2" />
                    הוסף הזמנה
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                  <DialogTitle>הוספת הזמנה חדשה</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>קטגוריה *</Label>
                      <Select
                        value={newOrder.category_id}
                        onChange={(e) => setNewOrder({ ...newOrder, category_id: e.target.value, supplier_id: '' })}
                      >
                        <option value="">בחר קטגוריה</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>ספק</Label>
                      <Select
                        value={newOrder.supplier_id}
                        onChange={(e) => setNewOrder({ ...newOrder, supplier_id: e.target.value })}
                      >
                        <option value="">ספק (אופציונלי)</option>
                        {filteredSuppliers.map(sup => (
                          <option key={sup.id} value={sup.id}>{sup.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>סטטוס</Label>
                      <Select
                        value={newOrder.status}
                        onChange={(e) => setNewOrder({ ...newOrder, status: e.target.value })}
                      >
                        {STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </Select>
                    </div>
                    {newOrder.status === 'measured' && (
                      <div className="space-y-2">
                        <Label>תאריך מדידה</Label>
                        <Input
                          type="date"
                          value={newOrder.measured_at}
                          onChange={(e) => setNewOrder({ ...newOrder, measured_at: e.target.value })}
                          dir="ltr"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>סטטוס תשלום</Label>
                      <Select
                        value={newOrder.payment_status}
                        onChange={(e) => setNewOrder({ ...newOrder, payment_status: e.target.value })}
                      >
                        <option value="not_paid">לא שילם</option>
                        <option value="advance">מקדמה</option>
                        <option value="paid_full">שילם הכל</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>הערות</Label>
                    <Input
                      value={newOrder.notes}
                      onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                      placeholder="הערות נוספות..."
                    />
                  </div>

                  {/* Items section */}
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">פריטים</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addNewOrderItem}>
                        <Plus className="h-3.5 w-3.5 ml-1" />
                        הוסף פריט
                      </Button>
                    </div>
                    {newOrderItems.length > 0 && (
                      <div className="space-y-2">
                        <div className={`grid ${isAdmin ? 'grid-cols-[2fr_1fr_0.7fr_1fr_auto]' : 'grid-cols-[2fr_1fr_auto]'} gap-2 text-xs text-gray-500 px-1`}>
                          <span>תיאור</span>
                          <span>מחיר לקוח ₪</span>
                          {isAdmin && <span>רווח %</span>}
                          {isAdmin && <span>מחיר ספק ₪</span>}
                          <span></span>
                        </div>
                        {newOrderItems.map((item, idx) => (
                          <div key={idx} className={`grid ${isAdmin ? 'grid-cols-[2fr_1fr_0.7fr_1fr_auto]' : 'grid-cols-[2fr_1fr_auto]'} gap-2 items-center`}>
                            <Input
                              value={item.description}
                              onChange={(e) => updateNewOrderItem(idx, 'description', e.target.value)}
                              placeholder="תיאור הפריט"
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number"
                              value={item.customer_price}
                              onChange={(e) => updateNewOrderItem(idx, 'customer_price', e.target.value)}
                              placeholder="0"
                              className="h-8 text-sm"
                              dir="ltr"
                            />
                            {isAdmin && (
                              <>
                                <Input
                                  type="number"
                                  value={item.profit_percent}
                                  onChange={(e) => updateNewOrderItem(idx, 'profit_percent', e.target.value)}
                                  placeholder="10"
                                  className="h-8 text-sm"
                                  dir="ltr"
                                />
                                <Input
                                  type="number"
                                  value={item.supplier_price}
                                  onChange={(e) => updateNewOrderItem(idx, 'supplier_price', e.target.value)}
                                  placeholder="0"
                                  className="h-8 text-sm"
                                  dir="ltr"
                                />
                              </>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                              onClick={() => removeNewOrderItem(idx)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end border-t pt-3">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
                    <Button onClick={addOrder} disabled={saving || !newOrder.category_id}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף הזמנה'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders by Category */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          הזמנות ({orders.length})
        </h2>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">אין הזמנות עדיין</p>
              <p className="text-gray-400 text-sm mt-1">הוסף הזמנה ראשונה לדייר זה</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const { revenue, profit } = getOrderTotal(order)
              return (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">
                              {order.categories?.name || 'ללא קטגוריה'}
                            </h3>
                            <Badge variant={STATUS_COLORS[order.status] as any}>
                              {STATUS_LABELS[order.status]}
                            </Badge>
                            <Badge variant={PAYMENT_STATUS_COLORS[getEffectivePaymentStatus(order)] as any}>
                              {PAYMENT_STATUS_LABELS[getEffectivePaymentStatus(order)]}
                            </Badge>
                            {order.satisfaction_rating && (
                              <div className="flex items-center gap-0.5" dir="ltr" title={`שביעות רצון: ${order.satisfaction_rating}/5`}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`h-3.5 w-3.5 ${
                                      star <= (order.satisfaction_rating || 0)
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          {order.suppliers && (
                            <p className="text-sm text-gray-500">
                              ספק: {order.suppliers.name}
                            </p>
                          )}
                          {order.order_items?.length > 0 && (
                            <p className="text-sm text-gray-500">
                              {order.order_items.length} פריטים | הכנסה: {formatCurrency(revenue)}
                              {isAdmin && (
                                <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {' | '}רווח: {formatCurrency(profit)}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="outline" size="sm">
                            <Edit2 className="h-4 w-4 ml-1" />
                            פרטים
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteOrder(order.id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
