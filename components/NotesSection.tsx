'use client'

import { useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Check, X, BellPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// הערות משותפות: כל שורה בטקסט השמור היא הערה נפרדת שניתן לערוך או למחוק,
// והוספת הערה חדשה נעשית בשדה נפרד ונשמרת מיד.
export function NotesSection({
  notes,
  onAdd,
  onReplace,
  labelClassName,
  icon,
  onRemind,
}: {
  notes: string | null | undefined
  onAdd: (text: string) => Promise<boolean>
  // שומר את טקסט ההערות המלא אחרי עריכה/מחיקה של שורה
  onReplace: (nextNotes: string) => Promise<boolean>
  labelClassName?: string
  icon?: React.ReactNode
  // "הזכר לי בתאריך" ליד כל הערה (בהזמנה)
  onRemind?: (date: string, noteLine: string) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  const [remindIndex, setRemindIndex] = useState<number | null>(null)
  const [remindDate, setRemindDate] = useState('')
  const [remindDone, setRemindDone] = useState<number | null>(null)

  async function saveReminder(line: string, index: number) {
    if (!onRemind || !remindDate) return
    setSaving(true)
    const ok = await onRemind(remindDate, line)
    setSaving(false)
    if (ok) { setRemindIndex(null); setRemindDone(index) }
    else setError('שמירת התזכורת נכשלה')
  }

  const lines = (notes || '').split('\n').map((line, index) => ({ line, index })).filter((l) => l.line.trim())

  async function handleAdd() {
    const value = text.trim()
    if (!value) return
    setSaving(true)
    setError('')
    const ok = await onAdd(value)
    if (ok) setText('')
    else setError('שמירת ההערה נכשלה')
    setSaving(false)
  }

  async function replaceLine(index: number, nextLine: string | null) {
    const all = (notes || '').split('\n')
    if (nextLine === null) all.splice(index, 1)
    else all[index] = nextLine
    setSaving(true)
    setError('')
    const ok = await onReplace(all.join('\n').replace(/^\n+|\n+$/g, ''))
    if (ok) setEditingIndex(null)
    else setError('שמירת השינוי נכשלה')
    setSaving(false)
  }

  async function handleDelete(index: number) {
    if (!confirm('למחוק את ההערה?')) return
    await replaceLine(index, null)
  }

  return (
    <div className="space-y-2">
      <Label className={`flex items-center gap-1 ${labelClassName || ''}`}>{icon} הערות</Label>
      {lines.length > 0 ? (
        <ul className="rounded-md border border-gray-200 bg-gray-50 divide-y divide-gray-200 max-h-60 overflow-y-auto">
          {lines.map(({ line, index }) => (
            <li key={index} className="px-3 py-2 text-sm text-gray-800">
              {editingIndex === index ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value.replace(/\n/g, ' '))}
                    rows={2}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <button
                    type="button"
                    disabled={saving || !editText.trim()}
                    onClick={() => replaceLine(index, editText.trim())}
                    className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                    title="שמור"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                    title="ביטול"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="flex-1 whitespace-pre-wrap">
                    {line}
                    {remindDone === index && <span className="text-xs text-green-600 mr-2">✓ נקבעה תזכורת</span>}
                    {remindIndex === index && (
                      <span className="flex items-center gap-1 mt-1">
                        <input
                          type="date"
                          value={remindDate}
                          onChange={(e) => setRemindDate(e.target.value)}
                          className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                          dir="ltr"
                        />
                        <button type="button" disabled={saving || !remindDate} onClick={() => saveReminder(line, index)} className="text-xs text-blue-600 hover:underline disabled:opacity-50">שמור תזכורת</button>
                        <button type="button" onClick={() => setRemindIndex(null)} className="text-xs text-gray-500 hover:underline">ביטול</button>
                      </span>
                    )}
                  </span>
                  {onRemind && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        const d = new Date(); d.setDate(d.getDate() + 1)
                        setRemindDate(d.toLocaleDateString('en-CA')); setRemindIndex(index); setRemindDone(null)
                      }}
                      className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"
                      title="הזכר לי בתאריך"
                    >
                      <BellPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => { setEditingIndex(index); setEditText(line); setError('') }}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="ערוך הערה"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleDelete(index)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="מחק הערה"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
