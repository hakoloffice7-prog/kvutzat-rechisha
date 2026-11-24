import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REMINDER_KINDS, cronTargetDate, sendOrderReminder, type ReminderKind, type ReminderResult } from '@/lib/integration/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Vercel Cron: תזכורות קוליות יום לפני מדידה / התקנה.
// מאובטח ב-CRON_SECRET (Vercel שולח Authorization: Bearer <CRON_SECRET>).
// רץ כל 30 דקות; הנתיב עצמו מחשב את היום, חלון השעות וכללי שבת/חג.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const target = cronTargetDate()
  if (!target) return NextResponse.json({ ok: true, skipped: 'outside-send-window' })

  const admin = createAdminClient()
  const results: ReminderResult[] = []

  for (const kind of Object.keys(REMINDER_KINDS) as ReminderKind[]) {
    const k = REMINDER_KINDS[kind]
    const { data, error } = await admin
      .from('orders')
      .select('id')
      .eq('status', k.status)
      .eq(k.dateCol, target)
      .is(k.sentCol, null)
    if (error) {
      console.error('reminders query failed', kind, error.message)
      results.push({ orderId: '', kind, result: 'failed', reason: error.message })
      continue
    }
    for (const row of data ?? []) {
      results.push(await sendOrderReminder(admin, row.id, kind))
    }
  }

  const count = (r: ReminderResult['result']) => results.filter(x => x.result === r).length
  return NextResponse.json({ ok: true, target, sent: count('sent'), skipped: count('skipped'), failed: count('failed'), results })
}
