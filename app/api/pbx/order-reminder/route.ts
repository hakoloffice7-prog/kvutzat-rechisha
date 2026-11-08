import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REMINDER_KINDS, shouldSendNow, sendOrderReminder, type ReminderKind } from '@/lib/integration/reminders'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// נקרא אחרי שמירת הזמנה: אם מדידה/התקנה מתוכננת למחר וה-Cron של היום כבר רץ, שולח תזכורת מיד.
// גוף הבקשה: { orderId: '<uuid>' }
export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!UUID_RE.test(String(body?.orderId))) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('orders')
    .select('status, measured_at, installation_planned_date')
    .eq('id', body.orderId)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  const row = data as Record<string, string | null>
  const results = []
  for (const kind of Object.keys(REMINDER_KINDS) as ReminderKind[]) {
    const k = REMINDER_KINDS[kind]
    const eventDate = row[k.dateCol]
    if (row.status !== k.status || !eventDate || !shouldSendNow(eventDate)) continue
    results.push(await sendOrderReminder(admin, body.orderId, kind))
  }
  return NextResponse.json({ ok: true, results })
}
