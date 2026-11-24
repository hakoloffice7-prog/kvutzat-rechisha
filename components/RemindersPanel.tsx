'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, CalendarPlus, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatStatusDate } from '@/lib/utils'
import { orderAmount, todayKey, addDaysKey } from '@/lib/orderMetrics'

// תזכורות (מפרט, סעיף 4): תזכורות ידניות ותזכורות מקדמה אוטומטיות, בטבלת notifications.
// "בוצע" = is_read; "הזכר מחר" = דוחה את remind_at ליום המחרת.

export const REMINDER_TYPES = ['manual_reminder', 'advance_reminder']

export type Reminder = {
  id: string
  type: string
  message: string | null
  remind_at: string
  remind_time: string | null
  order_id: string | null
  residents: { id: string; name: string; projects: { name: string; cities: { name: string } | null } | null } | null
  orders: {
    id: string
    order_number: number | null
    total_price: number | null
    is_global_price: boolean | null
    categories: { name: string } | null
    order_items: { customer_price: number | null }[]
  } | null
}

export const REMINDER_SELECT =
  'id, type, message, remind_at, remind_time, order_id, residents(id, name, projects(name, cities(name))), orders(id, order_number, total_price, is_global_price, categories(name), order_items(customer_price))'

export async function fetchOpenReminders(supabase: ReturnType<typeof createClient>, onlyDue = false) {
  let q = supabase
    .from('notifications')
    .select(REMINDER_SELECT)
    .in('type', REMINDER_TYPES)
    .eq('is_read', false)
    .order('remind_at', { ascending: true })
  if (onlyDue) q = q.lte('remind_at', todayKey())
  const { data } = await q
  return (data || []) as unknown as Reminder[]
}

export function overdueDays(remindAt: string) {
  const diff = new Date(todayKey()).getTime() - new Date(remindAt).getTime()
  return Math.round(diff / 86_400_000)
}

export function ReminderRow({ r, onChange }: { r: Reminder; onChange: () => void }) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const days = overdueDays(r.remind_at)
  const city = r.residents?.projects?.cities?.name
  const amount = r.orders ? orderAmount(r.orders) : 0

  async function act(changes: Record<string, unknown>) {
    setBusy(true)
    await supabase.from('notifications').update(changes).eq('id', r.id)
    setBusy(false)
    onChange()
  }

  return (
    <div className={`rounded-md border p-3 text-sm ${days > 0 ? 'border-red-200 bg-red-50' : days === 0 ? 'border-yellow-300 bg-yellow-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {r.type === 'advance_reminder' && <span className="ml-1 text-xs rounded bg-orange-100 text-orange-700 px-1.5 py-0.5">מקדמה</span>}
            {r.residents?.name || 'ללא דייר'}
            {r.orders?.categories?.name && <span className="text-gray-500"> · {r.orders.categories.name}</span>}
            {city && <span className="text-gray-500"> · {city}</span>}
            {amount > 0 && <span className="text-gray-500"> · {formatCurrency(amount)}</span>}
          </p>
          {r.message && <p className="text-gray-700 mt-0.5 whitespace-pre-wrap">{r.message}</p>}
          <p className="text-xs mt-0.5">
            <span className="text-gray-500">{formatStatusDate(r.remind_at + 'T00:00:00')}{r.remind_time ? ` ${r.remind_time.slice(0, 5)}` : ''}</span>
            {days > 0 && <span className="text-red-600 font-medium"> · באיחור של {days} ימים</span>}
            {days === 0 && <span className="text-yellow-700 font-medium"> · היום</span>}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ is_read: true })} title="סמן כבוצע">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 ml-1" />}
            בוצע
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ remind_at: addDaysKey(1) })} title="להזכיר שוב מחר">
            <CalendarPlus className="h-3.5 w-3.5 ml-1" />
            הזכר מחר
          </Button>
          {r.order_id ? (
            <Link href={`/orders/${r.order_id}`}>
              <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 ml-1" />פתח הזמנה</Button>
            </Link>
          ) : r.residents?.id ? (
            <Link href={`/residents/${r.residents.id}`}>
              <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 ml-1" />פתח דייר</Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function RemindersPanel({ title }: { title: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<Reminder[] | null>(null)

  const load = useCallback(async () => {
    setItems(await fetchOpenReminders(supabase))
    window.dispatchEvent(new Event('reminders-changed'))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Bell className="h-5 w-5 text-blue-600" />{title} {items ? `(${items.length})` : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items ? (
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        ) : items.length === 0 ? (
          <p className="text-gray-400 text-sm">אין תזכורות פתוחות</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((r) => <ReminderRow key={r.id} r={r} onChange={load} />)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
