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
import { Plus, Loader2, Trash2, ArrowRight, Save, X } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  STATUS_LABELS, STATUS_COLORS, STATUS_ORDER,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  formatCurrency
} from '@/lib/utils'

type OrderItem = {
  id: string
  description: string
  model: string
  customer_price: number
  supplier_price: number
}

type Order = {
  id: string
  status: string
  payment_status: string
  notes: string
  measurements: string | null
  total_price: number | null
  deposit: number | null
  approved: boolean
  installed: boolean
  details: Record<string, string>
  created_at: string
  residents: {
    id: string
    name: string
    projects: { id: string; name: string; cities: { name: string } }
  }
  categories: { id: string; name: string }
  suppliers: { id: string; name: string } | null
  order_items: OrderItem[]
}

type Supplier = { id: string; name: string; category_id: string }

export default function OrderPage() {
  const params = useParams()
  const orderId = params.id as string

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
    total_price: '',
    deposit: '',
    approved: false,
    installed: false,
  })
  const [detailsRows, setDetailsRows] = useState<{ key: string; value: string }[]>([])
  const [newItem, setNewItem] = useState({
    description: '',
    model: '',
    customer_price: '',
    supplier_price: '',
  })
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState<{
    description: string
    model: string
    customer_price: string
    supplier_price: string
  }>({ description: '', model: '', customer_price: '', supplier_price: '' })

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
          residents(id, name, projects(id, name, cities(name))),
          categories(id, name),
          suppliers(id, name),
          order_items(*)
        `)
        .eq('id', orderId)
        .single(),
      supabase.from('suppliers').select('*').order('name'),
    ])

    if (orderData) {
      setOrder(orderData)
      setEditedOrder({
        status: orderData.status,
        payment_status: orderData.payment_status,
        supplier_id: orderData.suppliers?.id || '',
        notes: orderData.notes || '',
        measurements: orderData.measurements || '',
        total_price: orderData.total_price ? String(orderData.total_price) : '',
        deposit: orderData.deposit ? String(orderData.deposit) : '',
        approved: orderData.approved || false,
        installed: orderData.installed || false,
      })
      setDetailsRows(Object.entries(orderData.details || {}).map(([key, value]) => ({ key, value: String(value) })))
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

    const { error } = await supabase
      .from('orders')
      .update({
        status: editedOrder.status,
        payment_status: editedOrder.payment_status,
        supplier_id: editedOrder.supplier_id || null,
        notes: editedOrder.notes,
        measurements: editedOrder.measurements,
        total_price: parseFloat(editedOrder.total_price) || 0,
        deposit: parseFloat(editedOrder.deposit) || 0,
        approved: editedOrder.approved,
        installed: editedOrder.installed,
        details,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (!error) {
      fetchData()
    }
    setSaving(false)
  }

  async function addItem() {
    if (!newItem.description.trim()) return
    setSaving(true)

    const { error } = await supabase.from('order_items').insert({
      order_id: orderId,
      description: newItem.description.trim(),
      model: newItem.model.trim(),
      customer_price: parseFloat(newItem.customer_price) || 0,
      supplier_price: parseFloat(newItem.supplier_price) || 0,
    })

    if (!error) {
      setNewItem({ description: '', model: '', customer_price: '', supplier_price: '' })
      setItemDialogOpen(false)
      fetchData()
    }
    setSaving(false)
  }

  async function deleteItem(itemId: string) {
    await supabase.from('order_items').delete().eq('id', itemId)
    fetchData()
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
        supplier_price: parseFloat(editingItemData.supplier_price) || 0,
      })
      .eq('id', itemId)

    if (!error) {
      setEditingItemId(null)
      fetchData()
    }
    setSaving(false)
  }

  const totalRevenue = order?.order_items?.reduce((sum, item) => sum + (item.customer_price || 0), 0) || 0
  const totalCost = order?.order_items?.reduce((sum, item) => sum + (item.supplier_price || 0), 0) || 0
  const totalProfit = totalRevenue - totalCost

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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link href="/cities" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          ערים
        </Link>
        <span>/</span>
        <Link href={`/projects/${order.residents?.projects?.id}`} className="hover:text-blue-600">
          {order.residents?.projects?.name}
        </Link>
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
            {order.categories?.name} - {order.residents?.name}
          </h1>
          <p className="text-gray-500 mt-1">
            {order.residents?.projects?.name}, {order.residents?.projects?.cities?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={STATUS_COLORS[order.status] as any} className="text-sm px-3 py-1">
            {STATUS_LABELS[order.status]}
          </Badge>
          <Badge variant={PAYMENT_STATUS_COLORS[order.payment_status] as any} className="text-sm px-3 py-1">
            {PAYMENT_STATUS_LABELS[order.payment_status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Details (Editable) */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>פרטי הזמנה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select
                  value={editedOrder.status}
                  onChange={(e) => setEditedOrder({ ...editedOrder, status: e.target.value })}
                >
                  {STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label>סטטוס תשלום</Label>
                <Select
                  value={editedOrder.payment_status}
                  onChange={(e) => setEditedOrder({ ...editedOrder, payment_status: e.target.value })}
                >
                  <option value="not_paid">לא שילם</option>
                  <option value="advance">מקדמה</option>
                  <option value="paid_full">שילם הכל</option>
                </Select>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>מחיר לתשלום (₪)</Label>
                  <Input
                    type="number"
                    value={editedOrder.total_price}
                    onChange={(e) => setEditedOrder({ ...editedOrder, total_price: e.target.value })}
                    placeholder="0"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>מקדמה (₪)</Label>
                  <Input
                    type="number"
                    value={editedOrder.deposit}
                    onChange={(e) => setEditedOrder({ ...editedOrder, deposit: e.target.value })}
                    placeholder="0"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editedOrder.approved}
                    onChange={(e) => setEditedOrder({ ...editedOrder, approved: e.target.checked })}
                    className="h-4 w-4"
                  />
                  מאושר
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editedOrder.installed}
                    onChange={(e) => setEditedOrder({ ...editedOrder, installed: e.target.checked })}
                    className="h-4 w-4"
                  />
                  הותקן
                </label>
              </div>

              <div className="space-y-2">
                <Label>הערות</Label>
                <Input
                  value={editedOrder.notes}
                  onChange={(e) => setEditedOrder({ ...editedOrder, notes: e.target.value })}
                  placeholder="הערות נוספות..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>פרטים נוספים (ספציפי למוצר)</Label>
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
                      placeholder="שם שדה (לדוגמה: הגבהה)"
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
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <Save className="h-4 w-4 ml-2" />
                )}
                שמור שינויים
              </Button>
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>סיכום כספי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(order.total_price || order.deposit) ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">מחיר לתשלום (הזמנה)</span>
                    <span className="font-medium">{formatCurrency(order.total_price || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">מקדמה ששולמה</span>
                    <span className="font-medium">{formatCurrency(order.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="text-gray-500">יתרה לתשלום</span>
                    <span className="font-medium">{formatCurrency((order.total_price || 0) - (order.deposit || 0))}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between">
                <span className="text-gray-500">מחיר לקוח (פריטים)</span>
                <span className="font-medium">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">מחיר ספק (סך)</span>
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
            </CardContent>
          </Card>
        </div>

        {/* Order Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>פריטי הזמנה ({order.order_items?.length || 0})</CardTitle>
                <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
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
                      <div className="space-y-2">
                        <Label>תיאור *</Label>
                        <Input
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder="תיאור הפריט"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>דגם / מק"ט</Label>
                        <Input
                          value={newItem.model}
                          onChange={(e) => setNewItem({ ...newItem, model: e.target.value })}
                          placeholder="מספר דגם"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>מחיר לקוח (₪)</Label>
                          <Input
                            type="number"
                            value={newItem.customer_price}
                            onChange={(e) => setNewItem({ ...newItem, customer_price: e.target.value })}
                            placeholder="0"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>מחיר ספק (₪)</Label>
                          <Input
                            type="number"
                            value={newItem.supplier_price}
                            onChange={(e) => setNewItem({ ...newItem, supplier_price: e.target.value })}
                            placeholder="0"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      {newItem.customer_price && newItem.supplier_price && (
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-sm text-gray-600">
                            רווח צפוי:{' '}
                            <span className={`font-bold ${
                              parseFloat(newItem.customer_price) - parseFloat(newItem.supplier_price) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}>
                              {formatCurrency(parseFloat(newItem.customer_price) - parseFloat(newItem.supplier_price))}
                            </span>
                          </p>
                        </div>
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
                        <th className="text-right pb-3 font-semibold text-gray-600">דגם</th>
                        <th className="text-right pb-3 font-semibold text-gray-600">מחיר לקוח</th>
                        <th className="text-right pb-3 font-semibold text-gray-600">מחיר ספק</th>
                        <th className="text-right pb-3 font-semibold text-gray-600">רווח</th>
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
                                <td className="py-2">
                                  <Input
                                    value={editingItemData.model}
                                    onChange={(e) => setEditingItemData({ ...editingItemData, model: e.target.value })}
                                    className="h-8 text-sm"
                                    placeholder="-"
                                  />
                                </td>
                                <td className="py-2">
                                  <Input
                                    type="number"
                                    value={editingItemData.customer_price}
                                    onChange={(e) => setEditingItemData({ ...editingItemData, customer_price: e.target.value })}
                                    className="h-8 text-sm"
                                    dir="ltr"
                                  />
                                </td>
                                <td className="py-2">
                                  <Input
                                    type="number"
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
                                <td className="py-3">{item.description}</td>
                                <td className="py-3 text-gray-500">{item.model || '-'}</td>
                                <td className="py-3">{formatCurrency(item.customer_price || 0)}</td>
                                <td className="py-3">{formatCurrency(item.supplier_price || 0)}</td>
                                <td className={`py-3 font-medium ${itemProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(itemProfit)}
                                </td>
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
                                      onClick={() => deleteItem(item.id)}
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
                        <td className="pt-3 font-semibold">{formatCurrency(totalCost)}</td>
                        <td className={`pt-3 font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(totalProfit)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
