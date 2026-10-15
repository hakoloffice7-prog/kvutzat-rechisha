'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// הערות משותפות: ההערות השמורות מוצגות לקריאה, והוספת הערה חדשה נעשית בשדה נפרד ונשמרת מיד.
export function NotesSection({
  notes,
  onAdd,
  labelClassName,
  icon,
}: {
  notes: string | null | undefined
  onAdd: (text: string) => Promise<boolean>
  labelClassName?: string
  icon?: React.ReactNode
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const value = text.trim()
    if (!value) return
    setSaving(true)
    const ok = await onAdd(value)
    if (ok) setText('')
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <Label className={`flex items-center gap-1 ${labelClassName || ''}`}>{icon} הערות</Label>
      {notes?.trim() ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {notes}
        </div>
      ) : (
        <p className="text-sm text-gray-400">אין הערות עדיין</p>
      )}
      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="הוסף הערה..."
          rows={2}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
        <Button type="button" variant="outline" onClick={handleAdd} disabled={saving || !text.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 ml-1" />}
          הוסף
        </Button>
      </div>
    </div>
  )
}
