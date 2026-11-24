import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, sendVoiceMessage } from '@/lib/integration/pbx'
import { loadVoiceTemplate, renderVoiceText } from '@/lib/voiceTemplates'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// הודעה קולית ללקוח על הזמנה חדשה. גוף הבקשה: { orderId: '<uuid>' }
// voice_notified_at נתפס לפני השליחה כדי שלא תישלח הודעה כפולה (ריענון, לחיצה כפולה).
export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!UUID_RE.test(String(body?.orderId))) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const { data, error } = await supabase
    .from('orders')
    .select('order_number, status, voice_notified_at, residents(name, phone), categories(name)')
    .eq('id', body.orderId)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })
  // הודעה קולית נשלחת רק להזמנה בסטטוס "מעוניין"
  if (data.status !== 'interested') return NextResponse.json({ ok: true, skipped: 'status' })
  if (data.voice_notified_at) return NextResponse.json({ ok: true, skipped: 'already' })

  const resident = data.residents as unknown as { name: string; phone: string | null } | null
  const category = (data.categories as unknown as { name: string } | null)?.name
  const phone = resident?.phone ? normalizePhone(resident.phone) : null
  if (!phone) return NextResponse.json({ error: 'ללקוח אין מספר טלפון תקין' }, { status: 422 })

  const { data: claimed } = await supabase
    .from('orders')
    .update({ voice_notified_at: new Date().toISOString() })
    .eq('id', body.orderId)
    .is('voice_notified_at', null)
    .select('id')
  if (!claimed?.length) return NextResponse.json({ ok: true, skipped: 'already' })

  // הנוסח נערך על ידי הלקוח במסך "הודעות קוליות"; בלי נוסח שמור - ברירת המחדל מהקוד
  const template = await loadVoiceTemplate(supabase, 'purchase')
  const text = renderVoiceText(template, {
    שם: resident?.name ?? '',
    קטגוריה: category ?? 'כללי',
    מספר_הזמנה: String(data.order_number ?? ''),
  })

  try {
    const { campaignId } = await sendVoiceMessage(phone, text, String(data.order_number ?? body.orderId))
    return NextResponse.json({ ok: true, campaignId })
  } catch (e: any) {
    // השליחה נכשלה - משחררים את התפיסה כדי שאפשר יהיה לנסות שוב
    await supabase.from('orders').update({ voice_notified_at: null }).eq('id', body.orderId)
    console.error('pbx voice message failed', e?.message)
    return NextResponse.json({ error: e?.message || 'שגיאה בשליחת הודעה קולית' }, { status: 502 })
  }
}
