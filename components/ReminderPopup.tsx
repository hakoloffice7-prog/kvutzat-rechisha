'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchOpenReminders, ReminderRow, type Reminder } from '@/components/RemindersPanel'

const SESSION_KEY = 'reminder-popup-shown'
const SEEN_KEY = 'reminder-popup-seen'
const POLL_MS = 60_000

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-500)))
  } catch {}
}

// חלון התזכורות (מפרט, סעיף 4.3): נפתח פעם אחת בכניסה למערכת עם כל התזכורות שהגיע זמנן או עבר,
// וגם בלחיצה על כפתור "תזכורות" בתפריט. בזמן העבודה קופצת רק תזכורת חדשה שהגיעה שעתה.
export function ReminderPopup() {
  const supabase = createClient()
  const [due, setDue] = useState<Reminder[]>([])
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open

  const isDueNow = (r: Reminder) => {
    const now = new Date()
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    if (r.remind_at < today) return true
    const t = r.remind_time ? r.remind_time.slice(0, 5) : ''
    return !t || t <= `${pad(now.getHours())}:${pad(now.getMinutes())}`
  }

  const load = useCallback(async () => {
    const list = (await fetchOpenReminders(supabase, true)).filter(isDueNow)
    setDue(list)
    return list
  }, [])

  useEffect(() => {
    let cancelled = false

    async function check(first: boolean) {
      if (openRef.current) return
      const list = await load()
      if (cancelled || list.length === 0) return
      let shownThisSession = false
      try { shownThisSession = sessionStorage.getItem(SESSION_KEY) === '1' } catch {}
      const seen = readSeen()
      const fresh = list.filter((r) => !seen.has(r.id))
      if ((first && !shownThisSession) || fresh.length > 0) {
        try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
        setOpen(true)
      }
    }

    function openFromMenu() {
      load().then(() => setOpen(true))
    }

    check(true)
    const timer = setInterval(() => check(false), POLL_MS)
    window.addEventListener('open-reminders', openFromMenu)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('open-reminders', openFromMenu) }
  }, [load])

  function close() {
    const seen = readSeen()
    due.forEach((r) => seen.add(r.id))
    writeSeen(seen)
    setOpen(false)
  }

  async function refresh() {
    await load()
    window.dispatchEvent(new Event('reminders-changed'))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            {due.length === 0 ? 'אין תזכורות שהגיע זמנן' : due.length > 1 ? `${due.length} תזכורות` : 'תזכורת'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {due.map((r) => <ReminderRow key={r.id} r={r} onChange={refresh} />)}
        </div>
        <div className="flex gap-2 justify-end">
          <Link href="/notifications" onClick={close}>
            <Button variant="outline">כל התזכורות</Button>
          </Link>
          <Button onClick={close}>סגור</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
