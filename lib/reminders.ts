// תזכורות בהזמנה (מפרט, סעיף 4). נשמרות בטבלת notifications (resident_id חובה בגלל ההרשאות).
import type { createClient } from '@/lib/supabase/client'
import { addDaysKey } from '@/lib/orderMetrics'

type Supabase = ReturnType<typeof createClient>

const ADVANCE_WORDS = ['מקדמה', 'פרטי חשבון', 'להעברה']
const NO_ADVANCE = ['ללא מקדמה', 'ללא העברת מקדמה', 'בלי מקדמה']

// הערה שמזכירה מקדמה / פרטי חשבון / העברה — ולא "ללא מקדמה"
export function mentionsAdvance(text: string) {
  if (NO_ADVANCE.some((w) => text.includes(w))) return false
  return ADVANCE_WORDS.some((w) => text.includes(w))
}

// תזכורת "לוודא שהמקדמה הועברה" יומיים אחרי ההערה. לא נוצרת אם כבר יש תזכורת מקדמה פתוחה
// להזמנה או שכבר נרשם בה תשלום. נסגרת לבד כשנרשם תשלום (טריגר במסד הנתונים).
export async function maybeCreateAdvanceReminder(supabase: Supabase, orderId: string, noteText: string) {
  if (!mentionsAdvance(noteText)) return
  const { data: order } = await supabase
    .from('orders')
    .select('id, resident_id, order_payments(amount)')
    .eq('id', orderId)
    .single()
  if (!order) return
  const paid = ((order as any).order_payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)
  if (paid > 0) return
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('type', 'advance_reminder')
    .eq('is_read', false)
  if ((count || 0) > 0) return
  await supabase.from('notifications').insert({
    type: 'advance_reminder',
    resident_id: (order as any).resident_id,
    order_id: orderId,
    is_read: false,
    remind_at: addDaysKey(2),
    message: `לוודא שהמקדמה הועברה — ${noteText}`,
  })
}

// תזכורת ידנית מתוך הערה ("הזכר לי בתאריך")
export async function createOrderReminder(supabase: Supabase, orderId: string, date: string, message: string) {
  const { data: order } = await supabase.from('orders').select('resident_id').eq('id', orderId).single()
  if (!order) return false
  const { error } = await supabase.from('notifications').insert({
    type: 'manual_reminder',
    resident_id: (order as any).resident_id,
    order_id: orderId,
    is_read: false,
    remind_at: date,
    message,
  })
  if (!error) window.dispatchEvent(new Event('reminders-changed'))
  return !error
}
