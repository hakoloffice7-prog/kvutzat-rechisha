'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { STATUS_LABELS, digitsOnly } from '@/lib/utils'
import { isValidIsraeliPhone } from '@/lib/orderMetrics'

// קליטת נרשמים (מפרט, שאלה 2 + "הוספת הזמנה עם כמה מוצרים"): מדביקים שורות ממייל של נציג —
// שם, טלפון ומוצרים — ונפתחת הזמנה נפרדת לכל מוצר. דייר שהטלפון שלו כבר קיים לא נוצר שוב.

type Option = { id: string; name: string }
type Project = Option & { city_id: string }
type Row = { line: string; name: string; phone: string; categoryIds: string[] }

function parseLine(line: string, categories: Option[]): Row | null {
  const raw = line.trim()
  if (!raw) return null
  let rest = raw
  // טלפון: רצף של 9-12 ספרות (מותר מקף/רווח באמצע)
  const pm = rest.match(/(?:\+?972|0)[\d\s-]{7,13}\d/)
  const phone = pm ? digitsOnly(pm[0]).replace(/^972/, '0') : ''
  if (pm) rest = rest.replace(pm[0], ' ')
  // מוצרים: כל שם קטגוריה שמופיע בשורה (גם בלי ה"ות"/"ים" בסוף, למשל "רשת" ← "רשתות")
  const categoryIds: string[] = []
  for (const c of [...categories].sort((a, b) => b.name.length - a.name.length)) {
    const stem = c.name.replace(/(ות|ים)$/, '')
    const candidates = [c.name, stem.length >= 3 ? stem : null].filter(Boolean) as string[]
    const hit = candidates.find((w) => rest.includes(w))
    if (hit) {
      categoryIds.push(c.id)
      rest = rest.replace(new RegExp(`${hit}[א-ת]*`), ' ')
    }
  }
  const name = rest.replace(/[,;:|\t\-–+/]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { line: raw, name, phone, categoryIds }
}

export function ImportRegistrantsDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const supabase = createClient()
  const [cities, setCities] = useState<Option[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [cityId, setCityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('interested')
  const [text, setText] = useState('')
  const [existingPhones, setExistingPhones] = useState<Map<string, { id: string; name: string }>>(new Map())
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    if (!open) return
    setResult('')
    ;(async () => {
      const [c, p, cat, r] = await Promise.all([
        supabase.from('cities').select('id, name').order('name'),
        supabase.from('projects').select('id, name, city_id').order('name'),
        supabase.from('categories').select('id, name, kind').order('name'),
        supabase.from('residents').select('id, name, phone, phone2'),
      ])
      setCities(c.data || [])
      setProjects((p.data || []) as Project[])
      setCategories(((cat.data || []) as any[]).filter((x) => x.kind !== 'staff'))
      const m = new Map<string, { id: string; name: string }>()
      for (const res of (r.data || []) as any[]) {
        for (const ph of [res.phone, res.phone2]) if (ph) m.set(digitsOnly(ph), { id: res.id, name: res.name })
      }
      setExistingPhones(m)
    })()
  }, [open])

  const rows = useMemo(() => text.split('\n').map((l) => parseLine(l, categories)).filter(Boolean) as Row[], [text, categories])
  const okRows = rows.filter((r) => r.name && r.categoryIds.length > 0)

  async function run() {
    if (!projectId || okRows.length === 0) return
    setSaving(true)
    let residentsCreated = 0, ordersCreated = 0, skipped = 0
    for (const row of okRows) {
      let residentId = row.phone ? existingPhones.get(row.phone)?.id : undefined
      if (!residentId) {
        const { data, error } = await supabase.from('residents').insert({ project_id: projectId, name: row.name, phone: row.phone || '' }).select('id').single()
        if (error || !data) { skipped++; continue }
        residentId = data.id
        residentsCreated++
      }
      const { data: existing } = await supabase.from('orders').select('category_id, status').eq('resident_id', residentId)
      const has = new Set((existing || []).filter((o: any) => o.status !== 'cancelled').map((o: any) => o.category_id))
      const toCreate = row.categoryIds.filter((c) => !has.has(c))
      skipped += row.categoryIds.length - toCreate.length
      if (toCreate.length) {
        const { error } = await supabase.from('orders').insert(toCreate.map((category_id) => ({
          resident_id: residentId, category_id, status, payment_status: 'not_paid', total_price: 0,
        })))
        if (!error) ordersCreated += toCreate.length
      }
    }
    setSaving(false)
    setResult(`נוצרו ${ordersCreated} הזמנות ו-${residentsCreated} דיירים חדשים${skipped ? ` · ${skipped} דולגו (הזמנה קיימת למוצר או שגיאה)` : ''}.`)
    setText('')
    onDone()
  }

  const sel = 'h-10 rounded-md border border-gray-200 bg-white px-2 text-sm'
  const catName = (id: string) => categories.find((c) => c.id === id)?.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader><DialogTitle>קליטת נרשמים / הוספת הזמנות</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select className={sel} value={cityId} onChange={(e) => { setCityId(e.target.value); setProjectId('') }}>
              <option value="">עיר</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={sel} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!cityId}>
              <option value="">פרויקט *</option>{projects.filter((p) => p.city_id === cityId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="interested">{STATUS_LABELS.interested}</option>
              <option value="inquiring">{STATUS_LABELS.inquiring}</option>
            </select>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'שורה לכל נרשם: שם, טלפון ומוצרים. למשל:\nכהן יוסף 050-1234567 סורגים רשתות\nלוי משה, 0527654321, מזגנים'}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          {rows.length > 0 && (
            <div className="border rounded-md max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0"><tr>
                  <th className="p-2 text-right">שם</th><th className="p-2 text-right">טלפון</th><th className="p-2 text-right">מוצרים</th><th className="p-2 text-right">הערה</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const exists = r.phone ? existingPhones.get(r.phone) : undefined
                    const bad = !r.name || r.categoryIds.length === 0
                    return (
                      <tr key={i} className={`border-t ${bad ? 'bg-red-50' : ''}`}>
                        <td className="p-2">{r.name || <span className="text-red-600">חסר שם</span>}</td>
                        <td className="p-2" dir="ltr">{r.phone || '—'}{r.phone && !isValidIsraeliPhone(r.phone) && <span className="text-red-600 text-xs"> לא תקין</span>}</td>
                        <td className="p-2">{r.categoryIds.map(catName).join(', ') || <span className="text-red-600">לא זוהה מוצר</span>}</td>
                        <td className="p-2 text-xs text-gray-500">{exists ? `דייר קיים: ${exists.name}` : bad ? 'השורה תדולג' : 'דייר חדש'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {result && <p className="text-sm text-green-700">{result}</p>}
          <p className="text-xs text-gray-500">הזמנה נפרדת נפתחת לכל מוצר. בקליטה מרוכזת לא נשלחת הודעה קולית אוטומטית.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>סגור</Button>
            <Button onClick={run} disabled={saving || !projectId || okRows.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `קלוט ${okRows.length} נרשמים`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
