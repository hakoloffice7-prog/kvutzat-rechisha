'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Mic, RotateCcw, Save } from 'lucide-react'
import {
  VOICE_TEMPLATES,
  VOICE_TEMPLATE_KEYS,
  renderVoiceText,
  sampleValues,
  unknownPlaceholders,
  type VoiceTemplateKey,
} from '@/lib/voiceTemplates'

export default function VoiceMessagesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  // הנוסח השמור במסד (null = משתמשים בברירת המחדל) והנוסח בעריכה
  const [saved, setSaved] = useState<Record<string, string | null>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string>('')
  const [notice, setNotice] = useState<Record<string, { type: 'ok' | 'error'; text: string }>>({})
  const areaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('voice_templates').select('key, body')
      const savedMap: Record<string, string | null> = {}
      const draftMap: Record<string, string> = {}
      for (const key of VOICE_TEMPLATE_KEYS) {
        const row = data?.find((r) => r.key === key)
        const body = row?.body?.trim() ? row.body : null
        savedMap[key] = body
        draftMap[key] = body ?? VOICE_TEMPLATES[key].defaultText
      }
      setSaved(savedMap)
      setDrafts(draftMap)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setNote(key: string, type: 'ok' | 'error', text: string) {
    setNotice((prev) => ({ ...prev, [key]: { type, text } }))
  }

  function insertVar(key: VoiceTemplateKey, name: string) {
    const el = areaRefs.current[key]
    const token = `{${name}}`
    const current = drafts[key] ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    setDrafts((prev) => ({ ...prev, [key]: next }))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function save(key: VoiceTemplateKey) {
    const body = (drafts[key] ?? '').trim()
    if (!body) {
      setNote(key, 'error', 'הנוסח לא יכול להיות ריק')
      return
    }
    const unknown = unknownPlaceholders(key, body)
    if (unknown.length > 0) {
      setNote(key, 'error', `שדות לא מוכרים בהודעה זו: ${unknown.map((u) => `{${u}}`).join(' ')}`)
      return
    }
    setBusyKey(key)
    const { error } = await supabase
      .from('voice_templates')
      .upsert({ key, body, updated_at: new Date().toISOString() })
    setBusyKey('')
    if (error) {
      setNote(key, 'error', 'שגיאה בשמירה. ייתכן שטבלת ההודעות עדיין לא נוצרה במסד הנתונים.')
      return
    }
    setSaved((prev) => ({ ...prev, [key]: body }))
    setNote(key, 'ok', 'הנוסח נשמר וישמש לשליחות הבאות')
  }

  async function restoreDefault(key: VoiceTemplateKey) {
    if (!confirm('לשחזר את נוסח ברירת המחדל? הנוסח שערכת יימחק.')) return
    setBusyKey(key)
    const { error } = await supabase.from('voice_templates').delete().eq('key', key)
    setBusyKey('')
    if (error) {
      setNote(key, 'error', 'שגיאה בשחזור ברירת המחדל')
      return
    }
    setSaved((prev) => ({ ...prev, [key]: null }))
    setDrafts((prev) => ({ ...prev, [key]: VOICE_TEMPLATES[key].defaultText }))
    setNote(key, 'ok', 'שוחזר נוסח ברירת המחדל')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">הודעות קוליות</h1>
        <p className="text-gray-500 mt-1">עריכת הנוסח של ההודעות הקוליות שנשלחות ללקוחות</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        לחיצה על שדה (למשל <b>{'{שם}'}</b>) מכניסה אותו לטקסט במקום הסמן, ובזמן השליחה הוא מוחלף בערך האמיתי.
        השינוי חל על הודעות שיישלחו מעכשיו.
      </div>

      {VOICE_TEMPLATE_KEYS.map((key) => {
        const tpl = VOICE_TEMPLATES[key]
        const draft = drafts[key] ?? ''
        const isDefault = saved[key] === null
        const dirty = draft.trim() !== (saved[key] ?? tpl.defaultText).trim()
        const unknown = unknownPlaceholders(key, draft)
        const preview = renderVoiceText(draft, sampleValues(key))
        const note = notice[key]
        const busy = busyKey === key

        return (
          <Card key={key}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-blue-500" />
                  <div>
                    <h2 className="font-semibold text-gray-900">{tpl.title}</h2>
                    <p className="text-xs text-gray-500">{tpl.description}</p>
                  </div>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 ${isDefault ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                  {isDefault ? 'נוסח ברירת מחדל' : 'נוסח מותאם אישית'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">הוסף שדה:</span>
                {tpl.vars.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVar(key, v.name)}
                    title={v.description}
                    className="text-xs border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md px-2 py-1"
                  >
                    {`{${v.name}}`} <span className="text-blue-400">· {v.description}</span>
                  </button>
                ))}
              </div>

              <textarea
                ref={(el) => { areaRefs.current[key] = el }}
                value={draft}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={5}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {unknown.length > 0 && (
                <p className="text-sm text-red-600">
                  שדות לא מוכרים בהודעה זו: {unknown.map((u) => `{${u}}`).join(' ')}
                </p>
              )}

              <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">תצוגה מקדימה (עם נתוני דוגמה)</p>
                <p className="text-sm text-gray-800 leading-relaxed">{preview || '—'}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => save(key)} disabled={busy || !dirty || unknown.length > 0}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 ml-2" />שמור</>}
                </Button>
                <Button variant="outline" onClick={() => restoreDefault(key)} disabled={busy || (isDefault && !dirty)}>
                  <RotateCcw className="h-4 w-4 ml-2" />
                  שחזר ברירת מחדל
                </Button>
                {note && (
                  <span className={`text-sm ${note.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{note.text}</span>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
