import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { clickToCall, normalizePhone } from '@/lib/integration/pbx'

export const dynamic = 'force-dynamic'

// גוף הבקשה: { phone: string, name?: string }
export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const phone = typeof body?.phone === 'string' ? normalizePhone(body.phone) : null
  if (!phone) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })
  const name = typeof body?.name === 'string' ? body.name.slice(0, 60) : undefined

  try {
    const { callId } = await clickToCall(phone, name)
    return NextResponse.json({ ok: true, callId })
  } catch (e: any) {
    console.error('pbx click2call failed', e?.message)
    return NextResponse.json({ error: e?.message || 'שגיאה בחיוג' }, { status: 502 })
  }
}
