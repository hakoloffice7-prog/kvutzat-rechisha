'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, Pencil, Trash2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Reminder = {
  id: string
  message: string | null
  remind_at: string | null
  remind_time: string | null
  is_read: boolean
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// צפייה, עריכה ומחיקה של התזכורות הידניות של דייר; יצירת תזכורת חדשה נעשית בעמוד הדייר ובמסך ההתראות
export function ResidentRemindersDialog({
  resident,
  onClose,
}: {
  resident: { id: string; name: string } | null
  onClose: () => void
}) {
  const supabase = createClient()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ message: '', remind_at: '', remind_time: '' })

  useEffect(() => {
    if (!resident) return
    let cancelled = false
    setLoading(true)
    setReminders([])
    setError('')
    setEditingId(null)
    supabase
      .from('notifications')
      .select('id, message, remind_at, remind_time, is_read')
      .eq('resident_id', resident.id)
      .eq('type', 'manual_reminder')
      .order('remind_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setReminders((data || []) as Reminder[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [resident?.id])

  function startEdit(r: Reminder) {
    setEditingId(r.id)
    setEditForm({
      message: r.message || '',
      remind_at: r.remind_at || '',
      remind_time: r.remind_time ? r.remind_time.slice(0, 5) : '',
    })
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editForm.message.trim() || !editForm.remind_at) return
    setBusy(true)
    setError('')
    const changes = {
      message: editForm.message.trim(),
      remind_at: editForm.remind_at,
      remind_time: editForm.remind_time || null,
      // תזכורת שנערכה חוזרת להיות פעילה
      is_read: false,
    }
    const { error: err } = await supabase.from('notifications').update(changes).eq('id', id)
    if (err) {
      setError('שמירת השינוי נכשלה')
    } else {
      setReminders((prev) => prev
        .map((r) => (r.id === id ? { ...r, ...changes } : r))
        .sort((a, b) => (b.remind_at || '').localeCompare(a.remind_at || '')))
      setEditingId(null)
    }
    setBusy(false)
  }

  async function deleteReminder(id: string) {
    if (!confirm('למחוק את התזכורת?')) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('notifications').delete().eq('id', id)
    if (err) setError('מחיקת התזכורת נכשלה')
    else setReminders((prev) => prev.filter((r) => r.id !== id))
    setBusy(false)
  }

  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  return (
    <Dialog open={!!resident} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            תזכורות — {resident?.name}
          </DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : reminders.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">אין תזכורות לדייר זה</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => {
              const time = r.remind_time ? r.remind_time.slice(0, 5) : ''
              const isFuture = !!r.remind_at && (r.remind_at > today || (r.remind_at === today && !!time && time > nowTime))

              if (editingId === r.id) {
                return (
                  <li key={r.id} className="rounded-md border border-blue-300 bg-white p-3 space-y-2">
                    <Input
                      value={editForm.message}
                      onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                      placeholder="תוכן התזכורת"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        dir="ltr"
                        value={editForm.remind_at}
                        onChange={(e) => setEditForm({ ...editForm, remind_at: e.target.value })}
                      />
                      <Input
                        type="time"
                        dir="ltr"
                        value={editForm.remind_time}
                        onChange={(e) => setEditForm({ ...editForm, remind_time: e.target.value })}
                      />
                    </div>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={busy || !editForm.message.trim() || !editForm.remind_at}
                        onClick={() => saveEdit(r.id)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        title="שמור"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                        title="ביטול"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li key={r.id} className={`rounded-md border p-3 text-sm ${r.is_read ? 'bg-gray-50 opacity-70' : isFuture ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-900 whitespace-pre-wrap break-words">{r.message || 'תזכורת'}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.is_read ? (
                        <Badge variant="secondary">טופל</Badge>
                      ) : isFuture ? (
                        <Badge variant="info">עתידי</Badge>
                      ) : (
                        <Badge variant="warning">הגיע הזמן</Badge>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(r)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-white/60 rounded"
                        title="ערוך תזכורת"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteReminder(r.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-white/60 rounded"
                        title="מחק תזכורת"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {r.remind_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(r.remind_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {time && ` בשעה ${time}`}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
