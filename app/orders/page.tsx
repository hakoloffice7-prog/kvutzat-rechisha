'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ShoppingCart, Loader2, Search, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { OrderNumber } from '@/components/OrderNumber'
import { STATUS_LABELS, STATUS_COLORS, STATUS_ORDER, PAYMENT_STATUS_LABELS, formatCurrency, formatStatusDate } from '@/lib/utils'

type Order = {
  id: string
  order_number: number | null
  status: string
  status_updated_at: string | null
  payment_status: string
  total_price: number
  created_at: string
  residents: { id: string; name: string }
  categories: { name: string }
  order_payments: { amount: number }[]
}

const ALL = 'all'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetchOrders() {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, status_updated_at, payment_status, total_price, created_at, residents(id, name), categories(name), order_payments(amount)')
        .order('created_at', { ascending: false })
      if (data) setOrders(data as any)
      setLoading(false)
    }
    fetchOrders()
  }, [])

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === ALL || o.status === statusFilter
    const matchSearch = !search ||
      (o.residents as any)?.name?.includes(search) ||
      (o.categories as any)?.name?.includes(search) ||
      String(o.order_number ?? '').includes(search.replace('#', '').trim()) && search.replace('#', '').trim() !== ''
    return matchStatus && matchSearch
  })

  const paymentColor: Record<string, string> = {
    not_paid: 'text-red-600',
    advance: 'text-yellow-600',
    paid_full: 'text-green-600',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">הזמנות</h1>
        <p className="text-gray-500 mt-1">{orders.length} הזמנות במערכת</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="חיפוש לפי שם / קטגוריה / מספר הזמנה"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter(ALL)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === ALL
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            הכל ({orders.length})
          </button>
          {STATUS_ORDER.map((s) => {
            const count = orders.filter((o) => o.status === s).length
            if (count === 0) return null
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {STATUS_LABELS[s]} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">לא נמצאו הזמנות</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const totalPaid = (order.order_payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
            return (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-sm hover:border-blue-200 transition-all cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <OrderNumber orderNumber={order.order_number} />
                    <span className="font-medium text-gray-900">
                      {(order.residents as any)?.name || 'לא ידוע'}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="text-sm text-gray-600">
                      {(order.categories as any)?.name || 'ללא קטגוריה'}
                    </span>
                  </div>
                  {(order.total_price > 0 || totalPaid > 0) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {order.total_price > 0 && `סה"כ: ${formatCurrency(order.total_price)}`}
                      {totalPaid > 0 && ` · שולם: ${formatCurrency(totalPaid)}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-left">
                    <Badge variant={STATUS_COLORS[order.status] as any}>
                      {STATUS_LABELS[order.status] || order.status}
                    </Badge>
                    {order.status_updated_at && (
                      <p className="text-xs text-gray-400 mt-1 text-right" title="תאריך עדכון הסטטוס">
                        עודכן: {formatStatusDate(order.status_updated_at)}
                      </p>
                    )}
                    {order.payment_status && order.payment_status !== 'not_paid' && (
                      <p className={`text-xs mt-1 text-right ${paymentColor[order.payment_status]}`}>
                        {PAYMENT_STATUS_LABELS[order.payment_status]}
                      </p>
                    )}
                  </div>
                  <ChevronLeft className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
