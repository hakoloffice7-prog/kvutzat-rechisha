// סריקת התראות אוטומטית (מפרט, שאלה 4) — אותו היגיון של כפתור "בדוק התראות חדשות" במסך ההתראות,
// רץ בשרת בכל ריצה של ה-Cron היומי. לא יוצר כפילויות (התראה אחת לכל הזמנה וסוג).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function scanAlerts(admin: SupabaseClient) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: considering }, { data: unpaid }, { data: existing }] = await Promise.all([
    admin.from('orders').select('id, resident_id').eq('status', 'interested').lt('created_at', sevenDaysAgo),
    admin.from('orders').select('id, resident_id').eq('status', 'delivery_scheduled').eq('payment_status', 'not_paid').lt('created_at', threeDaysAgo),
    admin.from('notifications').select('order_id, type').in('type', ['considering_week', 'unpaid_order']),
  ])

  const keys = new Set((existing || []).map((n) => `${n.order_id}__${n.type}`))
  const toInsert: { type: string; resident_id: string; order_id: string }[] = []
  for (const o of considering || []) {
    if (!keys.has(`${o.id}__considering_week`)) toInsert.push({ type: 'considering_week', resident_id: o.resident_id, order_id: o.id })
  }
  for (const o of unpaid || []) {
    if (!keys.has(`${o.id}__unpaid_order`)) toInsert.push({ type: 'unpaid_order', resident_id: o.resident_id, order_id: o.id })
  }
  if (toInsert.length > 0) {
    const { error } = await admin.from('notifications').insert(toInsert)
    if (error) return { created: 0, error: error.message }
  }
  return { created: toInsert.length }
}
