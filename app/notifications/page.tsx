'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Bell, CheckCheck, Loader2, AlertTriangle, Clock, CalendarClock, Plus } from 'lucide-react'
import Link from 'next/link'

type Notification = {
  id: string
  type: string
  is_read: boolean
  created_at: string
  remind_at: string | null
  message: string | null
  residents: { id: string; name: string } | null
  orders: { id: string; status: string; categories: { name: string } | null } | null
}

type ResidentOption = { id: string; name: string; projects: { name: string; cities: { name: string } } | null }

const NOTIFICATION_MESSAGES: Record<string, (n: Notification) => string> = {
  considering_week: (n) =>
    `${n.residents?.name || 'דייר'} מעוניין ללא התקדמות מעל שבוע בנוגע ל${n.orders?.categories?.name || 'הזמנה'}`,
  unpaid_order: (n) =>
    `הזמנת ${n.orders?.categories?.name || 'מוצר'} של ${n.residents?.name || 'דייר'} בתיאום אספקה ולא שולמה`,
  manual_reminder: (n) =>
    `${n.residents?.name || 'דייר'}: ${n.message || 'תזכורת'}`,
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const supabase = createClient()

  // Manual reminder dialog
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [residents, setResidents] = useState<ResidentOption[]>([])
  const [residentSearch, setResidentSearch] = useState('')
  const [newReminder, setNewReminder] = useState({ resident_id: '', message: '', remind_at: '' })
  const [savingReminder, setSavingReminder] = useState(false)

  useEffect(() => {
    fetchNotifications()
    fetchResidents()
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

  async function fetchResidents() {
    const { data } = await supabase
      .from('residents')
      .select('id, name, projects(name, cities(name))')
      .order('name')
    setResidents((data || []) as unknown as ResidentOption[])
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

  function openReminderDialog(residentId?: string) {
    setNewReminder({ resident_id: residentId || '', message: '', remind_at: '' })
    setResidentSearch('')
    setReminderDialogOpen(true)
  }

  async function addReminder() {
    if (!newReminder.resident_id || !newReminder.message.trim() || !newReminder.remind_at) return
    setSavingReminder(true)
    const { error } = await supabase.from('notifications').insert({
      type: 'manual_reminder',
      resident_id: newReminder.resident_id,
      message: newReminder.message.trim(),
      remind_at: newReminder.remind_at,
      is_read: false,
    })
    if (!error) {
      setReminderDialogOpen(false)
      fetchNotifications()
    }
    setSavingReminder(false)
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
  const today = todayStr()
  const filteredResidents = residentSearch.trim()
    ? residents.filter((r) => r.name.includes(residentSearch.trim()))
    : residents

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">התראות</h1>
          <p className="text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} התראות שלא נקראו` : 'כל ההתראות נקראו'}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openReminderDialog()}>
                <Plus className="h-4 w-4 ml-2" />
                תזכורת ידנית
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>יצירת תזכורת ידנית</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>דייר *</Label>
                  <Input
                    value={residentSearch}
                    onChange={(e) => setResidentSearch(e.target.value)}
                    placeholder="חיפוש דייר לפי שם..."
                  />
                  <select
                    value={newReminder.resident_id}
                    onChange={(e) => setNewReminder({ ...newReminder, resident_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    size={5}
                  >
                    {filteredResidents.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.projects ? ` — ${r.projects.cities?.name} / ${r.projects.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
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
                  <input
                    type="date"
                    value={newReminder.remind_at}
                    onChange={(e) => setNewReminder({ ...newReminder, remind_at: e.target.value })}
                    dir="ltr"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>ביטול</Button>
                  <Button
                    onClick={addReminder}
                    disabled={savingReminder || !newReminder.resident_id || !newReminder.message.trim() || !newReminder.remind_at}
                  >
                    {savingReminder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'צור תזכורת'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
              לחץ על "בדוק התראות חדשות" לסריקת הזמנות, או צור תזכורת ידנית
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const isManual = notification.type === 'manual_reminder'
            const isFuture = isManual && !!notification.remind_at && notification.remind_at > today

            return (
              <Card
                key={notification.id}
                className={`transition-all ${
                  notification.is_read
                    ? 'opacity-60'
                    : isFuture
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-yellow-300 bg-yellow-50'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-2 rounded-full ${
                        isManual ? 'bg-blue-100' : notification.type === 'considering_week' ? 'bg-yellow-100' : 'bg-red-100'
                      }`}>
                        {isManual ? (
                          <CalendarClock className="h-4 w-4 text-blue-600" />
                        ) : notification.type === 'considering_week' ? (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className={`font-medium ${notification.is_read ? 'text-gray-600' : 'text-gray-900'}`}>
                          {NOTIFICATION_MESSAGES[notification.type]?.(notification) || 'התראה'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {isManual && notification.remind_at ? (
                            <>
                              תזכורת ל-{new Date(notification.remind_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                              {' · '}נוצרה {new Date(notification.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                            </>
                          ) : (
                            new Date(notification.created_at).toLocaleDateString('he-IL', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          )}
                        </p>
                        {notification.orders && (
                          <Link
                            href={`/orders/${notification.orders.id}`}
                            className="text-blue-600 text-sm hover:underline mt-1 inline-block"
                          >
                            צפה בהזמנה &larr;
                          </Link>
                        )}
                        {isManual && notification.residents && (
                          <Link
                            href={`/residents/${notification.residents.id}`}
                            className="text-blue-600 text-sm hover:underline mt-1 inline-block"
                          >
                            לעמוד הדייר &larr;
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isFuture && (
                        <Badge variant="info" className="shrink-0">עתידי</Badge>
                      )}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
