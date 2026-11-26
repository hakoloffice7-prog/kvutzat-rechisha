'use client'

import { stampsMeasuredDate } from '@/lib/orderMetrics'
import { EmailLink } from '@/components/EmailLink'
import { requestOrderReminder } from "@/lib/sendOrderReminder"
import { useState, useEffect, useRef } from 'react'
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
import { Plus, Loader2, Trash2, ArrowLeft, Save, X, Star, Phone, MapPin, Mail, KeyRound } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useIsAdmin } from '@/components/RoleProvider'
import { NotesSection } from '@/components/NotesSection'
import { CopyButton } from '@/components/CopyButton'
import { ClickToCallButton } from '@/components/ClickToCallButton'
import { OrderNumber } from '@/components/OrderNumber'
import { PrevNextNav } from '@/components/PrevNextNav'
import { maybeCreateAdvanceReminder, createOrderReminder } from '@/lib/reminders'
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_ORDER,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  formatCurrency, formatDate, getDebtStatus, fullAddress, calcSupplierPrice, defaultProfitPercent, profitRuleFor, calcSupplierByRule,
  stampNewNoteLines,
  formatStatusDate,
  itemUnit,
  quantityLabel,
} from '@/lib/utils'

type OrderItem = {
  id: string
  description: string
  model: string
  quantity?: number | null
  customer_price: number
  supplier_price: number
}

type OrderPayment = {
  id: string
  amount: number
  paid_at: string
  note: string | null
  paid_to?: 'supplier' | 'company' | null
}

type Order = {
  id: string
  order_number: number | null
  status: string
  status_updated_at?: string | null
  payment_status: string
  notes: string
  measurements: string | null
  measured_at: string | null
  measurement_planned_time: string | null
  measurement_planned_time_to: string | null
  installation_planned_date: string | null
  installation_planned_time: string | null
  installation_planned_time_to: string | null
  total_price: number | null
  is_global_price: boolean
  global_supplier_price: number | null
  details: Record<string, string>
  satisfaction_rating: number | null
  satisfaction_note: string | null
  created_at: string
  residents: {
    id: string
    name: string
    address: string | null
    phone: string | null
    phone2: string | null
    email: string | null
    key_location: string | null
    floor?: string | null
    apartment?: string | null
    access_type?: string | null
    access_contact_name?: string | null
    access_contact_phone?: string | null
    projects: { id: string; name: string; cities: { name: string } }
  }
  categories: { id: string; name: string; profit_type?: string | null; profit_value?: number | null; unit_label?: string | null }
  suppliers: { id: string; name: string } | null
  order_items: OrderItem[]
  order_payments: OrderPayment[]
}

type Supplier = { id: string; name: string; category_id: string }

export default function OrderPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string
  const isAdmin = useIsAdmin()

  const updateTotalFromItemsRef = useRef(false)
  // העריכה זמינה תמיד, בלי כפתור "ערוך"
  const editMode = true
  const [order, setOrder] = useState<Order | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editedOrder, setEditedOrder] = useState({
    status: '',
    payment_status: '',
    supplier_id: '',
    notes: '',
    measurements: '',
    measured_at: '',
    measurement_planned_time: '',
    measurement_planned_time_to: '',
    installation_planned_date: '',
    installation_planned_time: '',
    installation_planned_time_to: '',
    total_price: '',
    is_global_price: false,
    global_supplier_price: '',
    global_profit_percent: '10',
    satisfaction_rating: 0,
    satisfaction_note: '',
  })
  const globalSupplierPriceTouchedRef = useRef(false)
  const [detailsRows, setDetailsRows] = useState<{ key: string; value: string }[]>([])
  const [newItem, setNewItem] = useState({
    description: '',
    model: '',
    quantity: '1',
    customer_price: '',
    supplier_price: '',
    profit_percent: '10',
  })
  const newItemSupplierPriceTouchedRef = useRef(false)
  // סוגי מוצר נוספים בקטגוריה (למשל ברשתות: חלון / דלת / אלומיניום), כל אחד עם רווח משלו
  const [categoryRules, setCategoryRules] = useState<{ name: string; profit_type: 'percent' | 'per_unit'; profit_value: number; unit_label: string | null }[]>([])
  const [itemRuleName, setItemRuleName] = useState('')
  const [deleteItemConfirmId, setDeleteItemConfirmId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState<{
    description: string
    model: string
    customer_price: string
    supplier_price: string
  }>({ description: '', model: '', customer_price: '', supplier_price: '' })

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [newPayment, setNewPayment] = useState({
    amount: '',
    paid_at: new Date().toISOString().slice(0, 10),
    note: '',
    paid_to: 'supplier' as 'supplier' | 'company', // ברירת מחדל: הלקוח משלם לספק
  })
  const [deletePaymentConfirmId, setDeletePaymentConfirmId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [orderId])

  async function fetchData() {
    setLoading(true)
    const [{ data: orderData }, { data: suppliersData }] = await Promise.all([
      supabase
        .from('orders')
        .select(`
          *,
          residents(id, name, address, floor, apartment, access_type, access_contact_name, access_contact_phone, phone, phone2, email, key_location, projects(id, name, cities(name))),
          categories(id, name, profit_type, profit_value, unit_label),
          suppliers(id, name),
          order_items(*, order_item_costs(supplier_price)),
          order_payments(*),
          order_costs(global_supplier_price)
        `)
        .eq('id', orderId)
        .single(),
      supabase.from('suppliers').select('*').order('name'),
    ])

    if (orderData) {
      const flattened = {
        ...orderData,
        global_supplier_price: (orderData as any).order_costs?.global_supplier_price ?? null,
        order_items: (orderData.order_items || []).map((item: any) => ({
          ...item,
          supplier_price: item.order_item_costs?.supplier_price ?? 0,
        })),
      }
      setOrder(flattened)
      const itemsRevenue = (flattened.order_items || []).reduce(
        (sum: number, item: OrderItem) => sum + (item.customer_price || 0), 0
      )
      setEditedOrder({
        status: flattened.status,
        payment_status: flattened.payment_status,
        supplier_id: flattened.suppliers?.id || '',
        notes: flattened.notes || '',
        measurements: flattened.measurements || '',
        measured_at: flattened.measured_at || '',
        measurement_planned_time: (flattened.measurement_planned_time || '').slice(0, 5),
        installation_planned_date: flattened.installation_planned_date || '',
        installation_planned_time: (flattened.installation_planned_time || '').slice(0, 5),
        measurement_planned_time_to: (flattened.measurement_planned_time_to || '').slice(0, 5),
        installation_planned_time_to: (flattened.installation_planned_time_to || '').slice(0, 5),
        // אם total_price בהזמנה תקוע על 0/ריק (הזמנה ישנה שנוצרה בלי סנכרון,
        // או שינוי בפריטים כרגע) - נופלים חזרה לסכום הפריטים בפועל, כדי לא
        // להציג "מחיר לתשלום: 0" כשיש פריטים עם מחיר אמיתי
        total_price: flattened.is_global_price
          ? (flattened.total_price ? String(flattened.total_price) : '')
          : (updateTotalFromItemsRef.current
              ? String(itemsRevenue)
              : String(flattened.total_price || itemsRevenue || '')),
        is_global_price: flattened.is_global_price || false,
        global_supplier_price: flattened.global_supplier_price ? String(flattened.global_supplier_price) : '',
        global_profit_percent: profitRuleFor(flattened.categories).type === 'percent' ? String(profitRuleFor(flattened.categories).value) : defaultProfitPercent(flattened.categories?.name),
        satisfaction_rating: flattened.satisfaction_rating || 0,
        satisfaction_note: flattened.satisfaction_note || '',
      })
      globalSupplierPriceTouchedRef.current = false
      setNewItem((prev) => ({ ...prev, profit_percent: String(profitRuleFor(flattened.categories).value) }))
      if (flattened.categories?.id) {
        supabase.from('category_profit_rules').select('name, profit_type, profit_value, unit_label').eq('category_id', flattened.categories.id).order('sort_order')
          .then(({ data }) => setCategoryRules((data || []) as any))
      }
      updateTotalFromItemsRef.current = false
      setDetailsRows(Object.entries(flattened.details || {}).map(([key, value]) => ({ key, value: String(value) })))
    }
    if (suppliersData) setSuppliers(suppliersData)
    setLoading(false)
  }

  async function saveOrder() {
    setSaving(true)
    const details = detailsRows.reduce((acc, row) => {
      if (row.key.trim()) acc[row.key.trim()] = row.value
      return acc
    }, {} as Record<string, string>)

    const newTotalPrice = parseFloat(editedOrder.total_price) || 0
    const { error } = await supabase
      .from('orders')
      .update({
        status: editedOrder.status,
        payment_status: getDebtStatus(newTotalPrice, totalPaid),
        supplier_id: editedOrder.supplier_id || null,
        measurements: editedOrder.measurements,
        measured_at: editedOrder.measured_at || null,
        measurement_planned_time: editedOrder.measurement_planned_time || null,
        installation_planned_date: editedOrder.installation_planned_date || null,
        installation_planned_time: editedOrder.installation_planned_time || null,
        measurement_planned_time_to: editedOrder.measurement_planned_time_to || null,
        installation_planned_time_to: editedOrder.installation_planned_time_to || null,
        // שינוי מועד מתוכנן מאפס את סימון "נשלחה תזכורת", כדי שתצא תזכורת למועד החדש
        ...(editedOrder.measured_at !== (order?.measured_at || '') ||
          editedOrder.measurement_planned_time !== (order?.measurement_planned_time || '').slice(0, 5) ||
          editedOrder.measurement_planned_time_to !== (order?.measurement_planned_time_to || '').slice(0, 5)
          ? { measurement_reminder_sent_at: null } : {}),
        ...(editedOrder.installation_planned_date !== (order?.installation_planned_date || '') ||
          editedOrder.installation_planned_time !== (order?.installation_planned_time || '').slice(0, 5) ||
          editedOrder.installation_planned_time_to !== (order?.installation_planned_time_to || '').slice(0, 5)
          ? { installation_reminder_sent_at: null } : {}),
        total_price: newTotalPrice,
        is_global_price: editedOrder.is_global_price,
        details,
        satisfaction_rating: editedOrder.satisfaction_rating || null,
        satisfaction_note: editedOrder.satisfaction_note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (!error && isAdmin) {
      await supabase.from('order_costs').upsert({
        order_id: orderId,
        global_supplier_price: parseFloat(editedOrder.global_supplier_price) || 0,
      })
    }

    if (!error) {
      // מדידה/התקנה למחר אחרי שה-Cron של היום רץ: תזכורת מיידית (השרת מחליט אם בכלל צריך)
      if (editedOrder.status === 'measurement_scheduled' || editedOrder.status === 'delivery_scheduled') {
        await requestOrderReminder(orderId)
      }
      // אחרי שמירה — חזרה אוטומטית לחלון הקודם (אם נפתח ישירות, בלי היסטוריה — למסך ההזמנות)
      setSaving(false)
      if (window.history.length > 1) router.back()
      else router.push('/orders')
      return
    }
    setSaving(false)
  }

  async function addOrderNote(text: string) {
    // מצרפים להערות העדכניות ביותר שנשמרו כדי לא לדרוס הערות של עובד אחר, בלי לאבד שינויים שלא נשמרו בשאר הטופס
    const { data: current } = await supabase.from('orders').select('notes').eq('id', orderId).single()
    const previous = current?.notes || ''
    const next = stampNewNoteLines(previous, previous ? previous + '\n' + text : text)
    // הערה חדשה מעדכנת "עודכן לאחרונה" (מפרט, סעיף 4)
    const { error } = await supabase.from('orders').update({ notes: next, updated_at: new Date().toISOString() }).eq('id', orderId)
    if (error) return false
    setOrder((prev) => (prev ? { ...prev, notes: next } : prev))
    setEditedOrder((prev) => ({ ...prev, notes: next }))
    maybeCreateAdvanceReminder(supabase, orderId, text)
    return true
  }

  async function replaceOrderNotes(next: string) {
    const { error } = await supabase.from('orders').update({ notes: next }).eq('id', orderId)
    if (error) return false
    setOrder((prev) => (prev ? { ...prev, notes: next } : prev))
    setEditedOrder((prev) => ({ ...prev, notes: next }))
    return true
  }

  async function addItem() {
    if (!newItem.description.trim()) return
    setSaving(true)

    // כמות יכולה להיות עשרונית (למשל 5.5 מטר)
    const qty = parseFloat(newItem.quantity) > 0 ? parseFloat(newItem.quantity) : 1
    const unitCustomer = parseFloat(newItem.customer_price) || 0
    const unitSupplier = parseFloat(newItem.supplier_price) || 0

    const { data: insertedItem, error } = await supabase.from('order_items').insert({
      order_id: orderId,
      description: newItem.description.trim(),
      model: newItem.model.trim(),
      customer_price: Math.round(unitCustomer * qty * 100) / 100,
      quantity: qty,
    }).select('id').single()

    if (!error && insertedItem && isAdmin) {
      await supabase.from('order_item_costs').upsert({
        order_item_id: insertedItem.id,
        supplier_price: Math.round(unitSupplier * qty * 100) / 100,
      })
    }

    if (!error) {
      setNewItem({ description: '', model: '', quantity: '1', customer_price: '', supplier_price: '', profit_percent: String(profitRuleFor(order?.categories).value) })
      setItemRuleName('')
      newItemSupplierPriceTouchedRef.current = false
      setItemDialogOpen(false)
      updateTotalFromItemsRef.current = true
      fetchData()
      router.refresh()
    }
    setSaving(false)
  }

  async function deleteItem(itemId: string) {
    await supabase.from('order_items').delete().eq('id', itemId)
    updateTotalFromItemsRef.current = true
    fetchData()
    router.refresh()
  }

  function startEditItem(item: OrderItem) {
    setEditingItemId(item.id)
    setEditingItemData({
      description: item.description,
      model: item.model || '',
      customer_price: String(item.customer_price ?? ''),
      supplier_price: String(item.supplier_price ?? ''),
    })
  }

  async function saveEditItem(itemId: string) {
    setSaving(true)
    const { error } = await supabase
      .from('order_items')
      .update({
        description: editingItemData.description.trim(),
        model: editingItemData.model.trim(),
        customer_price: parseFloat(editingItemData.customer_price) || 0,
      })
      .eq('id', itemId)

    if (!error && isAdmin) {
      await supabase.from('order_item_costs').upsert({
        order_item_id: itemId,
        supplier_price: parseFloat(editingItemData.supplier_price) || 0,
      })
    }

    if (!error) {
      setEditingItemId(null)
      updateTotalFromItemsRef.current = true
      fetchData()
    }
    setSaving(false)
  }

  async function addPayment() {
    const amount = parseFloat(newPayment.amount) || 0
    if (amount <= 0) return
    setSaving(true)

    const { error } = await supabase.from('order_payments').insert({
      order_id: orderId,
      amount,
      paid_at: newPayment.paid_at,
      note: newPayment.note.trim() || null,
      paid_to: newPayment.paid_to,
    })

    if (!error) {
      await syncPaymentStatus(totalPaid + amount)
      setNewPayment({ amount: '', paid_at: new Date().toISOString().slice(0, 10), note: '', paid_to: 'supplier' })
      setPaymentDialogOpen(false)
      fetchData()
    }
    setSaving(false)
  }

  async function deletePayment(paymentId: string) {
    const removedAmount = order?.order_payments.find(p => p.id === paymentId)?.amount || 0
    await supabase.from('order_payments').delete().eq('id', paymentId)
    await syncPaymentStatus(totalPaid - removedAmount)
    fetchData()
  }

  async function syncPaymentStatus(newTotalPaid: number) {
    const newStatus = getDebtStatus(totalRevenue, newTotalPaid)
    await supabase
      .from('orders')
      .update({ payment_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  const sortedPayments = [...(order?.order_payments || [])].sort(
    (a, b) => a.paid_at.localeCompare(b.paid_at) || a.id.localeCompare(b.id)
  )
  const totalPaid = sortedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  // כלל הרווח של הקטגוריה (אחוז / סכום ליחידה) — לחלון הוספת פריט
  const selectedSubRule = categoryRules.find((r) => r.name === itemRuleName)
  const itemRule = selectedSubRule
    ? { type: selectedSubRule.profit_type, value: Number(selectedSubRule.profit_value), unit: selectedSubRule.unit_label || selectedSubRule.name }
    : profitRuleFor(order?.categories)

  // בחירת סוג מוצר: מעדכנת את הרווח (ואת מחיר הספק אם לא נערך ידנית), ומשלימה תיאור אם ריק
  function chooseItemRule(name: string) {
    setItemRuleName(name)
    const sub = categoryRules.find((r) => r.name === name)
    const rule = sub
      ? { type: sub.profit_type, value: Number(sub.profit_value) }
      : profitRuleFor(order?.categories)
    setNewItem((prev) => ({
      ...prev,
      description: prev.description.trim() ? prev.description : (sub ? sub.name : prev.description),
      profit_percent: String(rule.value),
      supplier_price: newItemSupplierPriceTouchedRef.current
        ? prev.supplier_price
        : String(calcSupplierByRule(parseFloat(prev.customer_price) || 0, rule.value, rule.type)),
    }))
  }

  // totalRevenue/totalCost הם המקור האמיתי - order.total_price בטבלה יכול
  // להישאר תקוע על 0 בהזמנות ישנות שנוצרו לפני שהיה סנכרון אוטומטי, אז אסור
  // להשתמש בו ישירות ליתרה/סטטוס תשלום
  const totalRevenue = order?.is_global_price
    ? (order.total_price || 0)
    : (order?.order_items?.reduce((sum, item) => sum + (item.customer_price || 0), 0) || 0)
  const totalCost = order?.is_global_price
    ? (order.global_supplier_price || 0)
    : (order?.order_items?.reduce((sum, item) => sum + (item.supplier_price || 0), 0) || 0)
  const totalProfit = totalRevenue - totalCost

  const balanceDue = totalRevenue - totalPaid
  const computedPaymentStatus = getDebtStatus(totalRevenue, totalPaid)

  const filteredSuppliers = order?.categories?.id
    ? suppliers.filter(s => s.category_id === order.categories.id)
    : suppliers

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!order) {
    return <div className="text-center py-12 text-gray-500">הזמנה לא נמצאה</div>
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
        <Link href={`/residents/${order.residents?.id}`} className="hover:text-blue-600">
          {order.residents?.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{order.categories?.name}</span>
      </div>

      {/* Order Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {order.categories?.name} -{' '}
            <Link href={`/residents/${order.residents?.id}`} className="hover:text-blue-600 hover:underline" title="לתיק הדייר">
              {order.residents?.name}
            </Link>
          </h1>
          <OrderNumber orderNumber={order.order_number} className="text-sm" />
          <p className="text-gray-500 mt-1">
            {order.residents?.projects?.name}, {order.residents?.projects?.cities?.name}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <PrevNextNav kind="orders" currentId={orderId} basePath="/orders" label="הזמנה" />
          <Badge variant={STATUS_COLORS[order.status] as any} className="text-sm px-3 py-1">
            {STATUS_LABELS[order.status]}
          </Badge>
          {order.status_updated_at && (
            <span className="text-xs text-gray-500" title="תאריך עדכון הסטטוס">
              עודכן: {formatStatusDate(order.status_updated_at)}
            </span>
          )}
          <Badge variant={PAYMENT_STATUS_COLORS[computedPaymentStatus] as any} className="text-sm px-3 py-1">
            {PAYMENT_STATUS_LABELS[computedPaymentStatus]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Details (Editable) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Customer Details */}
          <Card>
            <CardHeader>
              <CardTitle>פרטי לקוח</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href={`/residents/${order.residents?.id}`}
                className="block font-semibold text-blue-700 text-base hover:underline"
                title="לתיק הדייר"
              >
                {order.residents?.name}
              </Link>
              {order.residents?.address && (
                <p className="text-gray-600 flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {fullAddress(order.residents)}
                  <CopyButton value={fullAddress(order.residents)} title="העתק כתובת" />
                </p>
              )}
              {order.residents?.phone && (
                <div className="text-gray-600 flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span dir="ltr">{order.residents.phone}</span>
                  <ClickToCallButton phone={order.residents.phone} name={order.residents.name} className="p-1" />
                  <CopyButton value={order.residents.phone} title="העתק טלפון" />
                </div>
              )}
              {order.residents?.phone2 && (
                <div className="text-gray-600 flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span dir="ltr">{order.residents.phone2}</span>
                  <span className="text-xs text-gray-400">(נוסף)</span>
                  <ClickToCallButton phone={order.residents.phone2} name={order.residents.name} className="p-1" />
                  <CopyButton value={order.residents.phone2} title="העתק טלפון" />
                </div>
              )}
              {order.residents?.email && (
                <p className="text-gray-600 flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" />
                  <EmailLink email={order.residents.email} />
                  <CopyButton value={order.residents.email} title="העתק מייל" />
                </p>
              )}
              {order.residents?.key_location && (
                <p className="text-gray-600 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {order.residents.key_location}
                  <CopyButton value={order.residents.key_location} title="העתק מיקום מפתח" />
                </p>
              )}
              {order.residents?.access_type && (
                <p className="text-gray-600 flex items-center gap-2 flex-wrap">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {order.residents.access_type}
                  {order.residents.access_contact_name && <span>· {order.residents.access_contact_name}</span>}
                  {order.residents.access_contact_phone && (
                    <>
                      <span dir="ltr">{order.residents.access_contact_phone}</span>
                      <ClickToCallButton phone={order.residents.access_contact_phone} name={order.residents.access_contact_name || undefined} className="p-1" />
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>פרטי הזמנה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <>
                  <div className="space-y-2">
                    <Label>סטטוס</Label>
                    <Select
                      value={editedOrder.status}
                      onChange={(e) => {
                        const newStatus = e.target.value
                        // תאריך של היום נכנס אוטומטית (לפי שעון מקומי) כשהשדה ריק — אפשר לשנות אותו
                        const today = new Date().toLocaleDateString('en-CA')
                        setEditedOrder(prev => ({
                          ...prev,
                          status: newStatus,
                          measured_at: ((newStatus === 'measured' || newStatus === 'measurement_scheduled' || stampsMeasuredDate(order?.categories?.name, newStatus)) && !prev.measured_at)
                            ? today
                            : prev.measured_at,
                          installation_planned_date: (newStatus === 'delivery_scheduled' && !prev.installation_planned_date)
                            ? today
                            : prev.installation_planned_date,
                        }))
                      }}
                    >
                      {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </Select>
                  </div>

                  {true && (
                    <div className="space-y-2">
                      <Label>תאריך מדידה</Label>
                      <Input
                        type="date"
                        value={editedOrder.measured_at}
                        onChange={(e) => setEditedOrder({ ...editedOrder, measured_at: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  )}

                  {editedOrder.status === 'measurement_scheduled' && (
                    <div className="space-y-2">
                      <Label>שעות המדידה (תזכורת קולית יום לפני, לפי "תאריך מדידה")</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">משעה</span>
                          <Input
                            type="time"
                            value={editedOrder.measurement_planned_time}
                            onChange={(e) => setEditedOrder({ ...editedOrder, measurement_planned_time: e.target.value })}
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">עד שעה</span>
                          <Input
                            type="time"
                            value={editedOrder.measurement_planned_time_to}
                            onChange={(e) => setEditedOrder({ ...editedOrder, measurement_planned_time_to: e.target.value })}
                            dir="ltr"
                          />
                        </div>
                      </div>
                      {order?.measured_at && (order as any).measurement_reminder_sent_at && (
                        <p className="text-xs text-green-600">נשלחה תזכורת ללקוח</p>
                      )}
                    </div>
                  )}

                  {editedOrder.status === 'delivery_scheduled' && (
                    <div className="space-y-2">
                      <Label>התקנה מתוכננת (תזכורת קולית יום לפני)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">תאריך</span>
                          <Input
                            type="date"
                            value={editedOrder.installation_planned_date}
                            onChange={(e) => setEditedOrder({ ...editedOrder, installation_planned_date: e.target.value })}
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">משעה</span>
                          <Input
                            type="time"
                            value={editedOrder.installation_planned_time}
                            onChange={(e) => setEditedOrder({ ...editedOrder, installation_planned_time: e.target.value })}
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-gray-500">עד שעה</span>
                          <Input
                            type="time"
                            value={editedOrder.installation_planned_time_to}
                            onChange={(e) => setEditedOrder({ ...editedOrder, installation_planned_time_to: e.target.value })}
                            dir="ltr"
                          />
                        </div>
                      </div>
                      {order?.installation_planned_date && (order as any).installation_reminder_sent_at && (
                        <p className="text-xs text-green-600">נשלחה תזכורת ללקוח</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>סטטוס תשלום</Label>
                    <div>
                      <Badge variant={PAYMENT_STATUS_COLORS[computedPaymentStatus] as any}>
                        {PAYMENT_STATUS_LABELS[computedPaymentStatus]}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1">מחושב אוטומטית לפי סכום התשלומים בפועל</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>ספק</Label>
                    <Select
                      value={editedOrder.supplier_id}
                      onChange={(e) => setEditedOrder({ ...editedOrder, supplier_id: e.target.value })}
                    >
                      <option value="">ללא ספק</option>
                      {filteredSuppliers.map(sup => (
                        <option key={sup.id} value={sup.id}>{sup.name}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>מדידות</Label>
                    <Input
                      value={editedOrder.measurements}
                      onChange={(e) => setEditedOrder({ ...editedOrder, measurements: e.target.value })}
                      placeholder="לדוגמה: 2 דלת 5 חלון"
                    />
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editedOrder.is_global_price}
                        onChange={(e) => {
                          const checked = e.target.checked
                          const itemsRevenue = (order.order_items || []).reduce((s, i) => s + (i.customer_price || 0), 0)
                          const itemsCost = (order.order_items || []).reduce((s, i) => s + (i.supplier_price || 0), 0)
                          setEditedOrder(prev => ({
                            ...prev,
                            is_global_price: checked,
                            // כשעוברים בין מצב גלובלי לפריטים, מסנכרנים את הסכומים לפי פריטי ההזמנה
                            // כדי שמחיר הלקוח/ספק לא יישארו "תקועים" על ערך ישן מהמצב הקודם
                            total_price: checked
                              ? (prev.total_price || String(itemsRevenue))
                              : String(itemsRevenue),
                            global_supplier_price: checked
                              ? (prev.global_supplier_price || String(itemsCost))
                              : prev.global_supplier_price,
                          }))
                          globalSupplierPriceTouchedRef.current = false
                        }}
                        className="h-4 w-4"
                      />
                      מחיר גלובלי להזמנה (לא לפי פריטים)
                    </label>
                    {editedOrder.is_global_price && (
                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div className={isAdmin ? 'space-y-2' : 'space-y-2 col-span-2'}>
                          <Label>מחיר לתשלום ללקוח (₪)</Label>
                          <Input
                            type="number"
                              step="any"
                            value={editedOrder.total_price}
                            onChange={(e) => {
                              const customer = parseFloat(e.target.value) || 0
                              const percent = parseFloat(editedOrder.global_profit_percent) || 0
                              setEditedOrder(prev => ({
                                ...prev,
                                total_price: e.target.value,
                                global_supplier_price: globalSupplierPriceTouchedRef.current
                                  ? prev.global_supplier_price
                                  : String(calcSupplierPrice(customer, percent)),
                              }))
                            }}
                            placeholder="0"
                            dir="ltr"
                          />
                        </div>
                        {isAdmin && (
                          <>
                            <div className="space-y-2">
                              <Label>אחוז רווח (%)</Label>
                              <Input
                                type="number"
                              step="any"
                                value={editedOrder.global_profit_percent}
                                onChange={(e) => {
                                  const percent = parseFloat(e.target.value) || 0
                                  const customer = parseFloat(editedOrder.total_price) || 0
                                  setEditedOrder(prev => ({
                                    ...prev,
                                    global_profit_percent: e.target.value,
                                    global_supplier_price: globalSupplierPriceTouchedRef.current
                                      ? prev.global_supplier_price
                                      : String(calcSupplierPrice(customer, percent)),
                                  }))
                                }}
                                placeholder="10"
                                dir="ltr"
                              />
                            </div>
                            <div className="space-y-2 col-span-2">
                              <Label>מחיר לתשלום לספק (₪)</Label>
                              <Input
                                type="number"
                              step="any"
                                value={editedOrder.global_supplier_price}
                                onChange={(e) => {
                                  globalSupplierPriceTouchedRef.current = true
                                  setEditedOrder({ ...editedOrder, global_supplier_price: e.target.value })
                                }}
                                placeholder="0"
                                dir="ltr"
                              />
                            </div>
                            <p className="text-xs text-gray-500 col-span-2">
                              פריטי ההזמנה ישמשו לתיאור בלבד, ללא מחיר ליחידה — הסכום הכולל מחושב מהשדות למעלה. מחיר הספק מחושב אוטומטית לפי אחוז הרווח, וניתן לשנותו ידנית.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <NotesSection
                    notes={editedOrder.notes}
                    onAdd={addOrderNote}
                    onReplace={replaceOrderNotes}
                    onRemind={(date, line) => createOrderReminder(supabase, orderId, date, line)}
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>פרטים נוספים</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => setDetailsRows(prev => [...prev, { key: '', value: '' }])}
                      >
                        <Plus className="h-3.5 w-3.5 ml-1" />
                        הוסף שדה
                      </Button>
                    </div>
                    {detailsRows.map((row, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={row.key}
                          onChange={(e) => setDetailsRows(prev => prev.map((r, i) => i === idx ? { ...r, key: e.target.value } : r))}
                          placeholder="שם שדה"
                          className="h-8 text-sm"
                        />
                        <Input
                          value={row.value}
                          onChange={(e) => setDetailsRows(prev => prev.map((r, i) => i === idx ? { ...r, value: e.target.value } : r))}
                          placeholder="ערך"
                          className="h-8 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-400 hover:text-red-600"
                          onClick={() => setDetailsRows(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button onClick={saveOrder} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                    שמור שינויים
                  </Button>
                </>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">סטטוס</span>
                    <span className="font-medium">{STATUS_LABELS[editedOrder.status]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">תשלום</span>
                    <span className="font-medium">{PAYMENT_STATUS_LABELS[computedPaymentStatus]}</span>
                  </div>
                  {editedOrder.supplier_id && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">ספק</span>
                      <span className="font-medium">{filteredSuppliers.find(s => s.id === editedOrder.supplier_id)?.name || '—'}</span>
                    </div>
                  )}
                  {editedOrder.measurements && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">מדידות</span>
                      <span className="font-medium">{editedOrder.measurements}</span>
                    </div>
                  )}
                  {editedOrder.measured_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">תאריך מדידה</span>
                      <span className="font-medium">{formatDate(editedOrder.measured_at)}</span>
                    </div>
                  )}
                  {editedOrder.total_price && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">מחיר לתשלום</span>
                      <span className="font-medium">₪{parseFloat(editedOrder.total_price).toLocaleString('he-IL')}</span>
                    </div>
                  )}
                  {editedOrder.notes && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">הערות</span>
                      <span className="font-medium text-left whitespace-pre-wrap">{editedOrder.notes}</span>
                    </div>
                  )}
                  {detailsRows.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      {detailsRows.map((row, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="text-gray-500">{row.key}</span>
                          <span className="font-medium">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Satisfaction Rating */}
          <Card>
            <CardHeader>
              <CardTitle>שביעות רצון</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editMode ? (
                <>
                  <div className="flex items-center gap-1" dir="ltr">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setEditedOrder(prev => ({
                          ...prev,
                          satisfaction_rating: prev.satisfaction_rating === star ? 0 : star,
                        }))}
                        className="p-0.5"
                        title={`${star} כוכבים`}
                      >
                        <Star
                          className={`h-6 w-6 ${
                            star <= editedOrder.satisfaction_rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>נימוק</Label>
                    <Input
                      value={editedOrder.satisfaction_note}
                      onChange={(e) => setEditedOrder({ ...editedOrder, satisfaction_note: e.target.value })}
                      placeholder="הערה לגבי שביעות הרצון..."
                    />
                  </div>
                </>
              ) : editedOrder.satisfaction_rating ? (
                <>
                  <div className="flex items-center gap-1" dir="ltr">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-5 w-5 ${
                          star <= editedOrder.satisfaction_rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  {editedOrder.satisfaction_note && (
                    <p className="text-sm text-gray-600">{editedOrder.satisfaction_note}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">טרם דורג</p>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>סיכום כספי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(totalRevenue || totalPaid > 0) ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">מחיר לתשלום (הזמנה)</span>
                    <span className="font-medium">{formatCurrency(totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">סה"כ שולם בפועל</span>
                    <span className="font-medium">{formatCurrency(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="text-gray-500">יתרה לתשלום</span>
                    <span className={`font-medium ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balanceDue)}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between">
                <span className="text-gray-500">{order.is_global_price ? 'מחיר לקוח (גלובלי)' : 'מחיר לקוח (פריטים)'}</span>
                <span className="font-medium">{formatCurrency(totalRevenue)}</span>
              </div>
              {isAdmin && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{order.is_global_price ? 'מחיר ספק (גלובלי)' : 'מחיר ספק (סך)'}</span>
                    <span className="font-medium">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between">
                    <span className="font-semibold">רווח</span>
                    <span className={`font-bold text-lg ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totalProfit)}
                    </span>
                  </div>
                  {totalRevenue > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">שולי רווח</span>
                      <span className="text-gray-700">
                        {((totalProfit / totalRevenue) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>פריטי הזמנה ({order.order_items?.length || 0})</CardTitle>
                <Dialog open={itemDialogOpen} onOpenChange={(open) => {
                  setItemDialogOpen(open)
                  if (open) newItemSupplierPriceTouchedRef.current = false
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 ml-1" />
                      הוסף פריט
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>הוספת פריט</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {categoryRules.length > 0 && (
                        <div className="space-y-2">
                          <Label>סוג מוצר</Label>
                          <select
                            value={itemRuleName}
                            onChange={(e) => chooseItemRule(e.target.value)}
                            className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                          >
                            <option value="">{order.categories?.name} (רגיל)</option>
                            {categoryRules.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>תיאור (כולל צורה ודגם) *</Label>
                        <Input
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder="למשל: סורג דקורטיבי, דגם 12"
                        />
                      </div>
                      {order.is_global_price ? (
                        <p className="text-xs text-gray-500">
                          ההזמנה במחיר גלובלי — הפריט ישמש לתיאור בלבד, ללא מחיר ליחידה.
                        </p>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>{itemRule.type === 'per_unit' ? `כמות (${itemRule.unit}) — אפשר עשרוני, למשל 5.5` : 'כמות (אפשר עשרוני, למשל 5.5)'}</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={newItem.quantity}
                              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                              placeholder="1"
                              dir="ltr"
                            />
                          </div>
                          <div className={isAdmin ? 'grid grid-cols-3 gap-4' : ''}>
                            <div className="space-y-2">
                              <Label>{itemRule.type === 'per_unit' ? `מחיר לקוח ל${itemRule.unit} (₪)` : 'מחיר לקוח ליחידה (₪)'}</Label>
                              <Input
                                type="number"
                              step="any"
                                value={newItem.customer_price}
                                onChange={(e) => {
                                  const customer = parseFloat(e.target.value) || 0
                                  const percent = parseFloat(newItem.profit_percent) || 0
                                  setNewItem(prev => ({
                                    ...prev,
                                    customer_price: e.target.value,
                                    supplier_price: newItemSupplierPriceTouchedRef.current
                                      ? prev.supplier_price
                                      : String(calcSupplierByRule(customer, percent, itemRule.type)),
                                  }))
                                }}
                                placeholder="0"
                                dir="ltr"
                              />
                            </div>
                            {isAdmin && (
                              <>
                                <div className="space-y-2">
                                  <Label>{itemRule.type === 'per_unit' ? `רווח ל${itemRule.unit} (₪)` : 'אחוז רווח (%)'}</Label>
                                  <Input
                                    type="number"
                              step="any"
                                    value={newItem.profit_percent}
                                    onChange={(e) => {
                                      const percent = parseFloat(e.target.value) || 0
                                      const customer = parseFloat(newItem.customer_price) || 0
                                      setNewItem(prev => ({
                                        ...prev,
                                        profit_percent: e.target.value,
                                        supplier_price: newItemSupplierPriceTouchedRef.current
                                          ? prev.supplier_price
                                          : String(calcSupplierByRule(customer, percent, itemRule.type)),
                                      }))
                                    }}
                                    placeholder="10"
                                    dir="ltr"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>מחיר ספק ליחידה (₪)</Label>
                                  <Input
                                    type="number"
                              step="any"
                                    value={newItem.supplier_price}
                                    onChange={(e) => {
                                      newItemSupplierPriceTouchedRef.current = true
                                      setNewItem({ ...newItem, supplier_price: e.target.value })
                                    }}
                                    placeholder="0"
                                    dir="ltr"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          {isAdmin && newItem.customer_price && newItem.supplier_price && (
                            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 space-y-1">
                              {parseFloat(newItem.quantity) > 0 && parseFloat(newItem.quantity) !== 1 && (
                                <p>סה"כ לקוח: <strong>{formatCurrency((parseFloat(newItem.customer_price) || 0) * (parseFloat(newItem.quantity) || 1))}</strong></p>
                              )}
                              <p>
                                רווח צפוי:{' '}
                                <span className={`font-bold ${
                                  (parseFloat(newItem.customer_price) - parseFloat(newItem.supplier_price)) >= 0
                                    ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {formatCurrency((parseFloat(newItem.customer_price) - parseFloat(newItem.supplier_price)) * (parseFloat(newItem.quantity) || 1))}
                                </span>
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setItemDialogOpen(false)}>ביטול</Button>
                        <Button onClick={addItem} disabled={saving || !newItem.description.trim()}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף פריט'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>

            <CardContent>
              {!order.order_items || order.order_items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>אין פריטים בהזמנה זו</p>
                  <p className="text-sm mt-1">הוסף פריטים כדי לחשב רווח</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right pb-3 font-semibold text-gray-600">תיאור</th>
                        <th className="text-right pb-3 font-semibold text-gray-600">כמות</th>
                        <th className="text-right pb-3 font-semibold text-gray-600">מחיר לקוח</th>
                        {isAdmin && <th className="text-right pb-3 font-semibold text-gray-600">מחיר ספק</th>}
                        {isAdmin && <th className="text-right pb-3 font-semibold text-gray-600">רווח</th>}
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.order_items.map((item) => {
                        const itemProfit = (item.customer_price || 0) - (item.supplier_price || 0)
                        const isEditing = editingItemId === item.id
                        return (
                          <tr key={item.id} className={`border-b ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                            {isEditing ? (
                              <>
                                <td className="py-2">
                                  <Input
                                    value={editingItemData.description}
                                    onChange={(e) => setEditingItemData({ ...editingItemData, description: e.target.value })}
                                    className="h-8 text-sm"
                                  />
                                </td>
                                <td className="py-2 text-gray-600">{quantityLabel(item.quantity ?? 1, itemUnit(item.description, order.categories, categoryRules)) || '1'}</td>
                                {order.is_global_price ? (
                                  <>
                                    <td className="py-2 text-gray-400">-</td>
                                    {isAdmin && <td className="py-2 text-gray-400">-</td>}
                                    {isAdmin && <td className="py-2 text-gray-400">-</td>}
                                  </>
                                ) : (
                                  <>
                                    <td className="py-2">
                                      <Input
                                        type="number"
                              step="any"
                                        value={editingItemData.customer_price}
                                        onChange={(e) => setEditingItemData({ ...editingItemData, customer_price: e.target.value })}
                                        className="h-8 text-sm"
                                        dir="ltr"
                                      />
                                    </td>
                                    {isAdmin && (
                                      <>
                                        <td className="py-2">
                                          <Input
                                            type="number"
                              step="any"
                                            value={editingItemData.supplier_price}
                                            onChange={(e) => setEditingItemData({ ...editingItemData, supplier_price: e.target.value })}
                                            className="h-8 text-sm"
                                            dir="ltr"
                                          />
                                        </td>
                                        <td className="py-2 font-medium text-gray-400 text-sm">
                                          {formatCurrency(
                                            (parseFloat(editingItemData.customer_price) || 0) -
                                            (parseFloat(editingItemData.supplier_price) || 0)
                                          )}
                                        </td>
                                      </>
                                    )}
                                  </>
                                )}
                                <td className="py-2">
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => saveEditItem(item.id)}
                                      disabled={saving || !editingItemData.description.trim()}
                                      className="h-8 px-2 text-xs"
                                    >
                                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'שמור'}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setEditingItemId(null)}
                                      className="h-8 px-2 text-xs"
                                    >
                                      בטל
                                    </Button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-3">{item.description}{item.model ? <span className="text-gray-500"> — {item.model}</span> : null}</td>
                                <td className="py-3 text-gray-700 whitespace-nowrap">{quantityLabel(item.quantity ?? 1, itemUnit(item.description, order.categories, categoryRules)) || '1'}</td>
                                {order.is_global_price ? (
                                  <>
                                    <td className="py-3 text-gray-400">-</td>
                                    {isAdmin && <td className="py-3 text-gray-400">-</td>}
                                    {isAdmin && <td className="py-3 text-gray-400">-</td>}
                                  </>
                                ) : (
                                  <>
                                    <td className="py-3">
                                      {formatCurrency(item.customer_price || 0)}
                                      {Number(item.quantity) > 0 && Number(item.quantity) !== 1 && (
                                        <div className="text-xs text-gray-400">{Math.round(Number(item.quantity) * 100) / 100} × {formatCurrency((item.customer_price || 0) / Number(item.quantity))}</div>
                                      )}
                                    </td>
                                    {isAdmin && <td className="py-3">{formatCurrency(item.supplier_price || 0)}</td>}
                                    {isAdmin && (
                                      <td className={`py-3 font-medium ${itemProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(itemProfit)}
                                      </td>
                                    )}
                                  </>
                                )}
                                <td className="py-3">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => startEditItem(item)}
                                      className="text-blue-400 hover:text-blue-600"
                                    >
                                      ערוך
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDeleteItemConfirmId(item.id)}
                                      className="text-red-400 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2">
                        <td colSpan={2} className="pt-3 font-semibold">סך הכל</td>
                        <td className="pt-3 font-semibold">{formatCurrency(totalRevenue)}</td>
                        {isAdmin && <td className="pt-3 font-semibold">{formatCurrency(totalCost)}</td>}
                        {isAdmin && (
                          <td className={`pt-3 font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(totalProfit)}
                          </td>
                        )}
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>תשלומים</CardTitle>
                <Dialog
                  open={paymentDialogOpen}
                  onOpenChange={(open) => {
                    // בפתיחה: הסכום מתמלא ביתרה שנשארה לתשלום (אפשר לשנות)
                    if (open) {
                      const balance = Math.round((totalRevenue - totalPaid) * 100) / 100
                      setNewPayment(prev => ({ ...prev, amount: balance > 0 ? String(balance) : '' }))
                    }
                    setPaymentDialogOpen(open)
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 ml-1" />
                      הוסף תשלום
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>הוספת תשלום</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>תאריך</Label>
                        <Input
                          type="date"
                          value={newPayment.paid_at}
                          onChange={(e) => setNewPayment({ ...newPayment, paid_at: e.target.value })}
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>סכום (₪) *</Label>
                          {totalRevenue - totalPaid > 0 && (
                            <button
                              type="button"
                              onClick={() => setNewPayment(prev => ({ ...prev, amount: String(Math.round((totalRevenue - totalPaid) * 100) / 100) }))}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              שולם הכל ({formatCurrency(totalRevenue - totalPaid)})
                            </button>
                          )}
                        </div>
                        <Input
                          type="number"
                              step="any"
                          value={newPayment.amount}
                          onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                          placeholder="0"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>הלקוח שילם ל...</Label>
                        <div className="flex gap-4 text-sm">
                          <label className="flex items-center gap-1">
                            <input type="radio" checked={newPayment.paid_to === 'supplier'} onChange={() => setNewPayment({ ...newPayment, paid_to: 'supplier' })} />
                            ספק (רגיל)
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="radio" checked={newPayment.paid_to === 'company'} onChange={() => setNewPayment({ ...newPayment, paid_to: 'company' })} />
                            חברה (ישירות אלינו)
                          </label>
                        </div>
                        <p className="text-xs text-gray-500">
                          {newPayment.paid_to === 'supplier'
                            ? 'נרשם אוטומטית חוב של הספק לחברה, יחסית לסכום ששולם.'
                            : 'נחשב כרווח שכבר התקבל מההזמנה (לא נוצר חוב של הספק על הסכום הזה).'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>הערה</Label>
                        <Input
                          value={newPayment.note}
                          onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })}
                          placeholder="לדוגמה: מקדמה במזומן"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>ביטול</Button>
                        <Button onClick={addPayment} disabled={saving || !(parseFloat(newPayment.amount) > 0)}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף תשלום'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {sortedPayments.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">
                  <p>עדיין לא נרשמו תשלומים</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedPayments.reduce((rows: JSX.Element[], payment, idx) => {
                    const paidSoFar = sortedPayments.slice(0, idx + 1).reduce((s, p) => s + (p.amount || 0), 0)
                    const remaining = totalRevenue - paidSoFar
                    rows.push(
                      <div key={payment.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                        <div>
                          <div className="font-medium">{formatCurrency(payment.amount)}</div>
                          <div className="text-gray-500 text-xs">
                            {formatDate(payment.paid_at)}{payment.note ? ` · ${payment.note}` : ''}
                            {payment.paid_to === 'company'
                              ? <span className="mr-1 rounded bg-purple-100 text-purple-700 px-1">שולם לחברה</span>
                              : <span className="mr-1 text-gray-400">· לספק</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-left text-xs text-gray-500">
                            נותר: <span className={remaining > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>{formatCurrency(remaining)}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletePaymentConfirmId(payment.id)}
                            className="text-red-400 hover:text-red-600 h-7 px-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                    return rows
                  }, [])}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Item Confirmation */}
      <Dialog open={!!deleteItemConfirmId} onOpenChange={(open) => { if (!open) setDeleteItemConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת פריט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק פריט זה?</p>
            <p className="text-sm text-red-600">פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteItemConfirmId(null)}>ביטול</Button>
              <Button variant="destructive" onClick={() => {
                if (deleteItemConfirmId) {
                  deleteItem(deleteItemConfirmId)
                  setDeleteItemConfirmId(null)
                }
              }}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Confirmation */}
      <Dialog open={!!deletePaymentConfirmId} onOpenChange={(open) => { if (!open) setDeletePaymentConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת תשלום</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק תשלום זה?</p>
            <p className="text-sm text-red-600">פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeletePaymentConfirmId(null)}>ביטול</Button>
              <Button variant="destructive" onClick={() => {
                if (deletePaymentConfirmId) {
                  deletePayment(deletePaymentConfirmId)
                  setDeletePaymentConfirmId(null)
                }
              }}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
