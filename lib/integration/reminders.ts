// שרת-בלבד: תזכורות שיחה אוטומטיות (הודעה קולית) יום לפני מדידה / התקנה.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isHoliday } from '@/lib/holidays'
import { normalizePhone, sendVoiceMessage } from '@/lib/integration/pbx'
import { loadVoiceTemplate, renderVoiceText } from '@/lib/voiceTemplates'

export type ReminderKind = 'measurement' | 'installation'

export const REMINDER_KINDS: Record<ReminderKind, {
  status: string
  dateCol: string
  timeCol: string
  timeToCol: string
  sentCol: string
}> = {
  measurement: {
    status: 'measurement_scheduled',
    dateCol: 'measured_at', // משתמשים בשדה "תאריך מדידה" הקיים,
    timeCol: 'measurement_planned_time',
    timeToCol: 'measurement_planned_time_to',
    sentCol: 'measurement_reminder_sent_at',
  },
  installation: {
    status: 'delivery_scheduled',
    dateCol: 'installation_planned_date',
    timeCol: 'installation_planned_time',
    timeToCol: 'installation_planned_time_to',
    sentCol: 'installation_reminder_sent_at',
  },
}

// שעות הרצת ה-Cron ב-UTC (חייב להתאים ל-vercel.json). ב-Hobby החלון הוא עד שעה אחרי.
// אחר הצהריים (ימים א'-ה') ובשישי בבוקר (לאירוע של יום ראשון).
export const CRON_AFTERNOON_UTC_HOUR = 12
export const CRON_FRIDAY_UTC_HOUR = 7

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// ---------- חישובי תאריך בשעון ישראל ----------

export function israelNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const date = `${get('year')}-${get('month')}-${get('day')}`
  return { date, hour: parseInt(get('hour'), 10), minute: parseInt(get('minute'), 10) }
}

function weekday(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay() // 0=ראשון ... 6=שבת
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ביום הזה אפשר לשלוח תזכורות (לא שבת ולא חג)
export function canSendOn(date: string): boolean {
  return weekday(date) !== 6 && !isHoliday(date)
}

// יום האירוע שמקבל היום תזכורת: היום העבודה הבא (שישי -> ראשון, ערב חג -> אחרי החג)
export function nextEventDate(today: string): string {
  let d = addDays(today, 1)
  while (weekday(d) === 6 || isHoliday(d)) d = addDays(d, 1)
  return d
}

// התאריך שאליו ה-Cron מחפש אירועים; null = לא שולחים היום
export function cronTargetDate(now = new Date()): string | null {
  const today = israelNow(now).date
  return canSendOn(today) ? nextEventDate(today) : null
}

// האם להוציא תזכורת מיד עם שמירת אירוע בתאריך eventDate:
// רק אם האירוע הוא "מחר" (היום העבודה הבא), ה-Cron של היום כבר רץ, והשעה בישראל לפני 23:00.
export function shouldSendNow(eventDate: string, now = new Date()): boolean {
  const il = israelNow(now)
  if (!canSendOn(il.date)) return false
  if (eventDate !== nextEventDate(il.date)) return false
  if (il.hour >= 23) return false
  const cronHour = weekday(il.date) === 5 ? CRON_FRIDAY_UTC_HOUR : CRON_AFTERNOON_UTC_HOUR
  // ה-Cron יכול לרוץ בכל רגע בשעה שאחרי cronHour (חלון Hobby), לכן מחכים לסיומה
  return now.getUTCHours() >= cronHour + 1
}

// ---------- שליחה ----------

function whenWord(eventDate: string, today: string): string {
  return eventDate === addDays(today, 1) ? 'מחר' : `ביום ${HEBREW_DAYS[weekday(eventDate)]}`
}

// אין שעה מוגדרת - הלקוח מקבל טווח שעות ("בין השעות 10:00 ל-12:00")
function timePhrase(from: string | null, to: string | null): string {
  if (from && to) return `בין השעות ${from.slice(0, 5)} ל-${to.slice(0, 5)}`
  if (from) return `החל מהשעה ${from.slice(0, 5)}`
  return ''
}

type OrderRow = {
  id: string
  order_number: number | null
  status: string
  residents: { name: string; phone: string | null } | null
  categories: { name: string } | null
  [col: string]: unknown
}

export type ReminderResult = { orderId: string; kind: ReminderKind; result: 'sent' | 'skipped' | 'failed'; reason?: string }

// שולח תזכורת אחת להזמנה. נועל (reminder_sent_at) לפני השליחה ומשחרר בכישלון.
export async function sendOrderReminder(
  admin: SupabaseClient,
  orderId: string,
  kind: ReminderKind,
  now = new Date(),
): Promise<ReminderResult> {
  const k = REMINDER_KINDS[kind]
  const skip = (reason: string): ReminderResult => ({ orderId, kind, result: 'skipped', reason })

  const { data, error } = await admin
    .from('orders')
    .select(`id, order_number, status, ${k.dateCol}, ${k.timeCol}, ${k.timeToCol}, ${k.sentCol}, residents(name, phone), categories(name)`)
    .eq('id', orderId)
    .maybeSingle()
  if (error || !data) return { orderId, kind, result: 'failed', reason: 'ההזמנה לא נמצאה' }

  const row = data as unknown as OrderRow
  const eventDate = row[k.dateCol] as string | null
  const eventTime = row[k.timeCol] as string | null
  const eventTimeTo = row[k.timeToCol] as string | null
  if (row.status !== k.status) return skip('status')
  if (!eventDate) return skip('no-date')
  if (row[k.sentCol]) return skip('already')

  const today = israelNow(now).date
  const phone = row.residents?.phone ? normalizePhone(row.residents.phone) : null
  if (!phone) return { orderId, kind, result: 'failed', reason: 'ללקוח אין מספר טלפון תקין' }

  // תפיסה לפני שליחה (מונעת כפילות); התנאי על התאריך מגן מפני שינוי תאריך באמצע
  const { data: claimed } = await admin
    .from('orders')
    .update({ [k.sentCol]: new Date().toISOString() })
    .eq('id', orderId)
    .eq(k.dateCol, eventDate)
    .is(k.sentCol, null)
    .select('id')
  if (!claimed?.length) return skip('already')

  const name = row.residents?.name ?? ''
  const when = whenWord(eventDate, today)
  const category = row.categories?.name
  const timeText = timePhrase(eventTime, eventTimeTo)
  // הנוסח נערך על ידי הלקוח במסך "הודעות קוליות"; בלי נוסח שמור - ברירת המחדל מהקוד
  const templateKey = kind === 'measurement' ? 'measurement_reminder' : 'installation_reminder'
  const template = await loadVoiceTemplate(admin, templateKey)
  const text = renderVoiceText(template, {
    שם: name,
    קטגוריה: category ?? 'ההזמנה',
    מתי: when,
    שעה: timeText,
  })

  try {
    await sendVoiceMessage(phone, text, `${kind === 'measurement' ? 'מדידה' : 'התקנה'} ${row.order_number ?? orderId}`)
    return { orderId, kind, result: 'sent' }
  } catch (e: any) {
    await admin.from('orders').update({ [k.sentCol]: null }).eq('id', orderId)
    console.error('reminder voice failed', kind, orderId, e?.message)
    const msg: string = e?.message || 'שגיאה בשליחת הודעה קולית'
    // קוד 7 של המרכזייה = אין יתרה מספקת
    const reason = msg.includes('(קוד 7)') ? 'אין יתרה מספקת במרכזייה (קוד 7)' : msg
    return { orderId, kind, result: 'failed', reason }
  }
}
