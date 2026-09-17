'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCheck, Loader2, AlertTriangle, Clock } from 'lucide-react'
import Link from 'next/link'

type Notification = {
  id: string
  type: string
  is_read: boolean
  created_at: string
  residents: { id: string; name: string } | null
  orders: { id: string; status: string; categories: { name: string } | null } | null
}

const NOTIFICATION_MESSAGES: Record<string, (n: Notification) => string> = {
  considering_week: (n) =>
    `${n.residents?.name || 'דייר'} מעוניין ללא התקדמות מעל שבוע בנוגע ל${n.orders?.categories?.name || 'הזמנה'}`,
  unpaid_order: (n) =>
    `הזמנת ${n.orders?.categories?.name || 'מוצר'} של ${n.residents?.name || 'דייר'} בתיאום אספקה ולא שולמה`,
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function fetchNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        residents(id, name),
        orders(id, status, categories(name))
      `)
      .order('created_at', { ascending: false })

    if (data) setNotifications(data)
    setLoading(false)
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    )
  }

  async function markAllAsRead() {
    setMarkingAll(true)
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setMarkingAll(false)
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function generateNotifications() {
    // שלוף את כל ההזמנות הרלוונטיות בשני queries בלבד (במקום N+1)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: consideringOrders },
      { data: unpaidOrders },
      { data: existingNotifications },
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id, resident_id')
        .eq('status', 'interested')
        .lt('created_at', sevenDaysAgo),
      supabase
        .from('orders')
        .select('id, resident_id')
        .eq('status', 'delivery_scheduled')
        .eq('payment_status', 'not_paid')
        .lt('created_at', threeDaysAgo),
      supabase
        .from('notifications')
        .select('order_id, type')
        .in('type', ['considering_week', 'unpaid_order']),
    ])

    // בנה set של מפתחות קיימים למניעת כפילויות
    const existingKeys = new Set(
      (existingNotifications || []).map((n) => `${n.order_id}__${n.type}`)
    )

    const toInsert: { type: string; resident_id: string; order_id: string }[] = []

    for (const order of consideringOrders || []) {
      if (!existingKeys.has(`${order.id}__considering_week`)) {
        toInsert.push({ type: 'considering_week', resident_id: order.resident_id, order_id: order.id })
      }
    }

    for (const order of unpaidOrders || []) {
      if (!existingKeys.has(`${order.id}__unpaid_order`)) {
        toInsert.push({ type: 'unpaid_order', resident_id: order.resident_id, order_id: order.id })
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('notifications').insert(toInsert)
    }

    fetchNotifications()
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">התראות</h1>
          <p className="text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} התראות שלא נקראו` : 'כל ההתראות נקראו'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={generateNotifications}>
            <Bell className="h-4 w-4 ml-2" />
            בדוק התראות חדשות
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead} disabled={markingAll}>
              {markingAll ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <CheckCheck className="h-4 w-4 ml-2" />
              )}
              סמן הכל כנקרא
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין התראות</p>
            <p className="text-gray-400 text-sm mt-1">
              לחץ על "בדוק התראות חדשות" לסריקת הזמנות
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`transition-all ${notification.is_read ? 'opacity-60' : 'border-yellow-300 bg-yellow-50'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-2 rounded-full ${
                      notification.type === 'considering_week'
                        ? 'bg-yellow-100'
                        : 'bg-red-100'
                    }`}>
                      {notification.type === 'considering_week' ? (
                        <Clock className={`h-4 w-4 ${notification.type === 'considering_week' ? 'text-yellow-600' : 'text-red-600'}`} />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className={`font-medium ${notification.is_read ? 'text-gray-600' : 'text-gray-900'}`}>
                        {NOTIFICATION_MESSAGES[notification.type]?.(notification) || 'התראה'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notification.created_at).toLocaleDateString('he-IL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {notification.orders && (
                        <Link
                          href={`/orders/${notification.orders.id}`}
                          className="text-blue-600 text-sm hover:underline mt-1 inline-block"
                        >
                          צפה בהזמנה &larr;
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!notification.is_read && (
                      <Badge variant="warning" className="shrink-0">חדש</Badge>
                    )}
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                        className="text-gray-500"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteNotification(notification.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
