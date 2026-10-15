'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type DueReminder = {
  id: string
  message: string | null
  remind_at: string
  remind_time: string | null
  residents: { id: string; name: string } | null
}

const SEEN_KEY = 'reminder-popup-seen'
const POLL_MS = 30_000

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

// חלון קופץ גלובלי: מציג תזכורות ידניות שהגיע זמנן ועדיין לא סומנו כנקראו.
// תזכורת שהוצגה פעם אחת בדפדפן הזה לא קופצת שוב (אך נשארת בלתי נקראת במסך ההתראות).
export function ReminderPopup() {
  const supabase = createClient()
  const [due, setDue] = useState<DueReminder[]>([])
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (openRef.current) return
      const now = new Date()
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      const { data } = await supabase
        .from('notifications')
        .select('id, message, remind_at, remind_time, residents(id, name)')
        .eq('type', 'manual_reminder')
        .eq('is_read', false)
        .lte('remind_at', today)
      if (cancelled || !data) return
      const seen = readSeen()
      const fresh = (data as unknown as DueReminder[]).filter((r) => {
        if (seen.has(r.id)) return false
        if (r.remind_at < today) return true
        const t = r.remind_time ? r.remind_time.slice(0, 5) : ''
        return !t || t <= nowTime
      })
      if (fresh.length > 0) {
        setDue(fresh)
        setOpen(true)
      }
    }

    check()
    const timer = setInterval(check, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  function rememberShown() {
    const seen = readSeen()
    due.forEach((r) => seen.add(r.id))
    writeSeen(seen)
  }

  function close() {
    rememberShown()
    setOpen(false)
    setDue([])
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).in('id', due.map((r) => r.id))
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            {due.length > 1 ? `${due.length} תזכורות` : 'תזכורת'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {due.map((r) => (
            <div key={r.id} className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm">
              <p className="font-medium text-gray-900">
                {r.residents ? (
                  <Link href={`/residents/${r.residents.id}`} onClick={close} className="hover:text-blue-600 underline">
                    {r.residents.name}
                  </Link>
                ) : 'דייר'}
                {': '}{r.message || 'תזכורת'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(r.remind_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                {r.remind_time && ` · ${r.remind_time.slice(0, 5)}`}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={close}>סגור</Button>
          <Link href="/notifications" onClick={close}>
            <Button variant="outline">למסך ההתראות</Button>
          </Link>
          <Button onClick={markAllRead}>סמן כנקרא</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
