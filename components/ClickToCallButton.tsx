'use client'

import { useState } from 'react'
import { Phone, Loader2 } from 'lucide-react'

// חיוג דרך המרכזיה (click2call): הטלפון של הסוכן מצלצל קודם, ואז מתחבר ללקוח.
export function ClickToCallButton({
  phone,
  name,
  className = 'p-1',
  iconClassName = 'h-3.5 w-3.5',
}: {
  phone: string
  name?: string
  className?: string
  iconClassName?: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok'>('idle')

  async function dial() {
    if (state === 'busy') return
    setState('busy')
    try {
      const res = await fetch('/api/pbx/click-to-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'שגיאה בחיוג')
      setState('ok')
      setTimeout(() => setState('idle'), 3000)
    } catch (e: any) {
      setState('idle')
      alert(e?.message || 'שגיאה בחיוג')
    }
  }

  return (
    <button
      type="button"
      onClick={dial}
      disabled={state === 'busy'}
      title={state === 'ok' ? 'המרכזיה מצלצלת אליך...' : 'חייג דרך המרכזיה'}
      className={`inline-flex items-center justify-center rounded-full transition-colors ${
        state === 'ok' ? 'bg-green-500 text-white' : 'bg-green-100 text-green-600 hover:bg-green-200'
      } ${className}`}
    >
      {state === 'busy' ? <Loader2 className={`${iconClassName} animate-spin`} /> : <Phone className={iconClassName} />}
    </button>
  )
}
