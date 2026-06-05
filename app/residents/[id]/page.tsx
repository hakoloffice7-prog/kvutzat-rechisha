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
import { Plus, ShoppingCart, Loader2, Trash2, Phone, MapPin, ArrowRight, Edit2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { STATUS_LABELS, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, formatCurrency } from '@/lib/utils'

type Resident = {
  id: string
  name: string
  address: string
  phone: string
  projects: { id: string; name: string; cities: { name: string } }
}

type Order = {
  id: string
  status: string
  payment_status: string
  created_at: string
  notes: string
  categories: { id: string; name: string }
  suppliers: { id: string; name: string } | null
  order_items: { customer_price: number; supplier_price: number }[]
}

type Category = { id: string; name: string }
type Supplier = { id: string; name: string; category_id: string }

export default function ResidentPage() {
  const params = useParams()
  const residentId = params.id as string

  const [resident, setResident] = useState<Resident | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newOrder, setNewOrder] = useState({
    category_id: '',
    supplier_id: '',
    status: 'contact',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

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
        .select('*, categories(id, name), suppliers(id, name), order_items(customer_price, supplier_price)')
        .eq('resident_id', residentId)
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ])

    if (residentData) setResident(residentData)
    if (ordersData) setOrders(ordersData)
    if (categoriesData) setCategories(categoriesData)
    if (suppliersData) setSuppliers(suppliersData)
    setLoading(false)
  }

  async function addOrder() {
    if (!newOrder.category_id) return
    setSaving(true)

    const { error } = await supabase.from('orders').insert({
      resident_id: residentId,
      category_id: newOrder.category_id,
      supplier_id: newOrder.supplier_id || null,
      status: newOrder.status,
      notes: newOrder.notes,
    })

    if (!error) {
      setNewOrder({ category_id: '', supplier_id: '', status: 'contact', notes: '' })
      setDialogOpen(false)
      fetchData()
    }
    setSaving(false)
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('האם למחוק הזמנה זו?')) return
    await supabase.from('orders').delete().eq('id', orderId)
    fetchData()
  }

  const getOrderTotal = (items: { customer_price: number; supplier_price: number }[]) => {
    if (!items || items.length === 0) return { revenue: 0, profit: 0 }
    const revenue = items.reduce((sum, item) => sum + (item.customer_price || 0), 0)
    const cost = items.reduce((sum, item) => sum + (item.supplier_price || 0), 0)
    return { revenue, profit: revenue - cost }
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link href="/cities" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          ערים
        </Link>
        <span>/</span>
        <span>{resident.projects?.cities?.name}</span>
        <span>/</span>
        <Link href={`/projects/${resident.projects?.id}`} className="hover:text-blue-600">
          {resident.projects?.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{resident.name}</span>
      </div>

      {/* Resident Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{resident.name}</h1>
              <div className="mt-2 space-y-1">
                {resident.address && (
                  <p className="text-gray-500 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {resident.address}
                  </p>
                )}
                {resident.phone && (
                  <p className="text-gray-500 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span dir="ltr">{resident.phone}</span>
                  </p>
                )}
              </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-2" />
                  הוסף הזמנה
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>הוספת הזמנה חדשה</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
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
                      <option value="">בחר ספק (אופציונלי)</option>
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
                      <option value="contact">ליצור קשר</option>
                      <option value="considering">מתלבט</option>
                      <option value="interested">מעוניין</option>
                      <option value="ordered">הזמין</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>הערות</Label>
                    <Input
                      value={newOrder.notes}
                      onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                      placeholder="הערות נוספות..."
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
                    <Button onClick={addOrder} disabled={saving || !newOrder.category_id}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף הזמנה'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
              const { revenue, profit } = getOrderTotal(order.order_items)
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
                            <Badge variant={PAYMENT_STATUS_COLORS[order.payment_status] as any}>
                              {PAYMENT_STATUS_LABELS[order.payment_status]}
                            </Badge>
                          </div>
                          {order.suppliers && (
                            <p className="text-sm text-gray-500">
                              ספק: {order.suppliers.name}
                            </p>
                          )}
                          {order.order_items?.length > 0 && (
                            <p className="text-sm text-gray-500">
                              {order.order_items.length} פריטים |
                              הכנסה: {formatCurrency(revenue)} |
                              <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {' '}רווח: {formatCurrency(profit)}
                              </span>
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
