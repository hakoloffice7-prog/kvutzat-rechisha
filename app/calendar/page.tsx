'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, ChevronRight, ChevronLeft, Plus, Copy, Send, Trash2, Ruler, Wrench } from 'lucide-react'
import { STATUS_LABELS, fullAddress } from '@/lib/utils'
import { CLOSED_STATUSES } from '@/lib/orderMetrics'
import { requestOrderReminder } from '@/lib/sendOrderReminder'

// יומן מדידות והתקנות (מפרט, סעיף 6): יום עבודה של ספק בעיר, עם רשימת הדירות.
// שמירה מעדכנת את כל ההזמנות יחד (תאריך + סטטוס), כך שהתזכורת הקולית הקיימת יוצאת לכולן.

type Kind = 'measurement' | 'installation'
const KIND_LABEL: Record<Kind, string> = { measurement: 'מדידה', installation: 'התקנה' }
const KIND_CLASS: Record<Kind, string> = {
  measurement: 'bg-sky-100 border-sky-300 text-sky-900',
  installation: 'bg-emerald-100 border-emerald-300 text-emerald-900',
}
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי']

type Option = { id: string; name: string }
type Supplier = { id: string; name: string; phone: string | null; category_id: string | null }
type WorkDay = {
  id: string
  kind: Kind
  supplier_id: string | null
  category_id: string | null
  city_id: string
  day: string
  time_from: string | null
  time_to: string | null
  notes: string | null
}
type Order = {
  order_items?: { description: string | null; model: string | null; quantity: number | null }[]
  id: string
  order_number: number | null
  status: string
  category_id: string | null
  supplier_id: string | null
  work_day_id: string | null
  residents: {
    name: string
    phone: string | null
    phone2: string | null
    address: string | null
    floor: string | null
    apartment: string | null
    access_type: string | null
    access_contact_name: string | null
    access_contact_phone: string | null
    projects: { city_id: string } | null
  } | null
}

function dateKey(d: Date) {
  return d.toLocaleDateString('en-CA')
}
function startOfWeek(d: Date) {
  const s = new Date(d)
  s.setHours(12, 0, 0, 0)
  s.setDate(s.getDate() - s.getDay()) // יום ראשון
  return s
}
function fmtDay(key: string) {
  const [y, m, d] = key.split('-')
  return `${d}/${m}`
}
// פרטי ההזמנה בשורה אחת: "סורג ישר — דגם 10 ×2"
function itemsText(o: { order_items?: { description: string | null; model: string | null; quantity: number | null }[] }) {
  return (o.order_items || [])
    .map((i) => `${i.description || ''}${i.model ? ` — דגם ${i.model}` : ''}${i.quantity && i.quantity !== 1 ? ` ×${i.quantity}` : ''}`.trim())
    .filter(Boolean)
    .join(', ')
}

function waPhone(p: string | null | undefined) {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('0')) d = '972' + d.slice(1)
  return d
}

export default function CalendarPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [days, setDays] = useState<WorkDay[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // קביעת יום
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'measurement' as Kind, category_id: '', city_id: '', supplier_id: '', day: dateKey(new Date()), time_from: '', time_to: '', notes: '' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  // דף עבודה
  const [sheetDay, setSheetDay] = useState<WorkDay | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    const [d, o, c, cat, s] = await Promise.all([
      supabase.from('work_days').select('*').order('day'),
      supabase
        .from('orders')
        .select('id, order_number, status, category_id, supplier_id, work_day_id, order_items(description, model, quantity), residents(name, phone, phone2, address, floor, apartment, access_type, access_contact_name, access_contact_phone, projects(city_id))'),
      supabase.from('cities').select('id, name').order('name'),
      supabase.from('categories').select('id, name, kind').order('name'),
      supabase.from('suppliers').select('id, name, phone, category_id').order('name'),
    ])
    setDays((d.data || []) as WorkDay[])
    setOrders((o.data || []) as unknown as Order[])
    setCities(c.data || [])
    setCategories(((cat.data || []) as any[]).filter((x) => x.kind !== 'staff'))
    setSuppliers((s.data || []) as Supplier[])
    setLoading(false)
  }

  useEffect(() => {
    load().then(() => {
      // פתיחה עם הזמנות שסומנו במסך ההזמנות / "קבע יום" ממסך הספקים
      const p = new URLSearchParams(window.location.search)
      if (p.get('new') === '1') {
        setForm((f) => ({
          ...f,
          category_id: p.get('category') || '',
          city_id: p.get('city') || '',
          supplier_id: p.get('supplier') || '',
        }))
        const ids = (p.get('orders') || '').split(',').filter(Boolean)
        setPicked(new Set(ids))
        setNewOpen(true)
      }
    })
  }, [])

  const weekDays = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return dateKey(d)
  }), [weekStart])

  const name = (list: Option[], id: string | null) => list.find((x) => x.id === id)?.name || ''
  const ordersOf = (dayId: string) => orders.filter((o) => o.work_day_id === dayId)

  // הזמנות פתוחות שעוד לא שובצו, באותו מוצר ועיר
  const candidates = orders.filter((o) =>
    !CLOSED_STATUSES.has(o.status) &&
    !o.work_day_id &&
    (!form.category_id || o.category_id === form.category_id) &&
    (!form.city_id || o.residents?.projects?.city_id === form.city_id)
  )
  const categorySuppliers = suppliers.filter((s) => !form.category_id || s.category_id === form.category_id)

  // שיבוץ הזמנות ליום עבודה: תאריך + שעות + סטטוס, ותזכורת קולית (השרת מחליט אם צריך)
  async function assignOrders(wd: { id: string; kind: Kind; day: string; time_from: string | null; time_to: string | null; supplier_id: string | null }, ids: string[]) {
    if (ids.length === 0) return true
    const common = { work_day_id: wd.id, updated_at: new Date().toISOString(), ...(wd.supplier_id ? { supplier_id: wd.supplier_id } : {}) }
    const changes = wd.kind === 'measurement'
      ? { ...common, status: 'measurement_scheduled', measured_at: wd.day, measurement_planned_time: wd.time_from || null, measurement_planned_time_to: wd.time_to || null, measurement_reminder_sent_at: null }
      : { ...common, status: 'delivery_scheduled', installation_planned_date: wd.day, installation_planned_time: wd.time_from || null, installation_planned_time_to: wd.time_to || null, installation_reminder_sent_at: null }
    const { error } = await supabase.from('orders').update(changes).in('id', ids)
    if (error) return false
    ids.forEach((id) => requestOrderReminder(id))
    return true
  }

  // הוספת דירות ליום שכבר נקבע
  const [addingTo, setAddingTo] = useState<WorkDay | null>(null)
  const [addPicked, setAddPicked] = useState<Set<string>>(new Set())
  async function addToDay() {
    if (!addingTo || addPicked.size === 0) return
    setSaving(true)
    const ok = await assignOrders(addingTo, Array.from(addPicked))
    setSaving(false)
    if (!ok) { alert('הוספת הדירות נכשלה'); return }
    setAddingTo(null)
    setAddPicked(new Set())
    load()
  }

  async function saveDay() {
    if (!form.city_id || !form.category_id || !form.day) return
    setSaving(true)
    const { data: wd, error } = await supabase.from('work_days').insert({
      kind: form.kind,
      category_id: form.category_id,
      city_id: form.city_id,
      supplier_id: form.supplier_id || null,
      day: form.day,
      time_from: form.time_from || null,
      time_to: form.time_to || null,
      notes: form.notes.trim() || null,
    }).select('id').single()
    if (error || !wd) {
      setSaving(false)
      alert('שגיאה בשמירת היום')
      return
    }
    // אפשר לשמור יום גם בלי דירות, ולהוסיף אותן אחר כך מדף העבודה
    const ok = await assignOrders(
      { id: wd.id, kind: form.kind, day: form.day, time_from: form.time_from || null, time_to: form.time_to || null, supplier_id: form.supplier_id || null },
      Array.from(picked),
    )
    setSaving(false)
    if (!ok) alert('היום נשמר, אבל עדכון ההזמנות נכשל')
    setNewOpen(false)
    setPicked(new Set())
    const d = new Date(form.day + 'T12:00:00')
    setWeekStart(startOfWeek(d))
    load()
  }

  async function cancelDay(wd: WorkDay) {
    const list = ordersOf(wd.id)
    if (!confirm(`לבטל את היום? ${list.length} הזמנות ישוחררו מהשיבוץ (התאריך יימחק, הסטטוס יישאר) ואפשר יהיה לשבץ אותן מחדש.`)) return
    const clear = wd.kind === 'measurement'
      ? { work_day_id: null, measured_at: null, measurement_planned_time: null, measurement_planned_time_to: null }
      : { work_day_id: null, installation_planned_date: null, installation_planned_time: null, installation_planned_time_to: null }
    if (list.length) await supabase.from('orders').update({ ...clear, updated_at: new Date().toISOString() }).in('id', list.map((o) => o.id))
    await supabase.from('work_days').delete().eq('id', wd.id)
    setSheetDay(null)
    load()
  }

  function sheetText(wd: WorkDay) {
    const sup = suppliers.find((s) => s.id === wd.supplier_id)
    const head = `${KIND_LABEL[wd.kind]} ${name(categories, wd.category_id)} — ${name(cities, wd.city_id)}\n` +
      `יום ${DAYS[new Date(wd.day + 'T12:00:00').getDay()] || ''} ${fmtDay(wd.day)}` +
      `${wd.time_from ? ` · ${wd.time_from.slice(0, 5)}${wd.time_to ? `–${wd.time_to.slice(0, 5)}` : ''}` : ''}` +
      `${sup ? `\nספק: ${sup.name}` : ''}${wd.notes ? `\n${wd.notes}` : ''}\n`
    const lines = ordersOf(wd.id).map((o, i) => {
      const r = o.residents
      const phones = [r?.phone, r?.phone2].filter(Boolean).join(' / ')
      const access = r?.access_type ? `\n   גישה: ${r.access_type}${r.access_contact_name ? ` · ${r.access_contact_name}` : ''}${r.access_contact_phone ? ` ${r.access_contact_phone}` : ''}` : ''
      const items = itemsText(o)
      return `${i + 1}. ${r?.name || ''} — ${fullAddress(r) || 'אין כתובת'}${items ? `\n   הוזמן: ${items}` : ''}\n   טלפון: ${phones || '—'}${access}`
    })
    return `${head}\n${lines.length ? lines.join('\n\n') : 'עדיין לא שובצו דירות ליום הזה'}`
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
  }

  const today = dateKey(new Date())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">יומן מדידות והתקנות</h1>
          <p className="text-gray-500 mt-1">יום עבודה של בעל מקצוע בעיר — עם כל הדירות שלו</p>
        </div>
        <Button onClick={() => { setPicked(new Set()); setNewOpen(true) }}><Plus className="h-4 w-4 ml-1" />קבע יום</Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }}>
          <ChevronRight className="h-4 w-4" />שבוע קודם
        </Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>השבוע</Button>
        <Button variant="outline" size="sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }}>
          שבוע הבא<ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-gray-500">{fmtDay(weekDays[0])} – {fmtDay(weekDays[4])}</span>
        <span className="mr-auto flex gap-2 text-xs">
          <span className={`rounded border px-2 py-0.5 ${KIND_CLASS.measurement}`}>מדידה</span>
          <span className={`rounded border px-2 py-0.5 ${KIND_CLASS.installation}`}>התקנה</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {weekDays.map((key, i) => (
          <Card key={key} className={key === today ? 'ring-2 ring-blue-500' : ''}>
            <CardContent className="p-3 space-y-2 min-h-[160px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">{DAYS[i]}</span>
                <span className="text-xs text-gray-500">{fmtDay(key)}{key === today ? ' · היום' : ''}</span>
              </div>
              {days.filter((d) => d.day === key).map((wd) => {
                const count = ordersOf(wd.id).length
                return (
                  <button
                    key={wd.id}
                    onClick={() => { setSheetDay(wd); setCopied(false) }}
                    className={`w-full text-right rounded border p-2 text-xs hover:shadow ${KIND_CLASS[wd.kind]}`}
                  >
                    <div className="font-semibold flex items-center gap-1">
                      {wd.kind === 'measurement' ? <Ruler className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                      {KIND_LABEL[wd.kind]} {name(categories, wd.category_id)}
                    </div>
                    <div>{name(cities, wd.city_id)} · {count} דירות</div>
                    {wd.time_from && <div>{wd.time_from.slice(0, 5)}{wd.time_to ? `–${wd.time_to.slice(0, 5)}` : ''}</div>}
                    {wd.supplier_id && <div className="opacity-75">{suppliers.find((s) => s.id === wd.supplier_id)?.name}</div>}
                  </button>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* קביעת יום */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader><DialogTitle>קביעת יום עבודה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">סוג</Label>
                <select className="h-10 w-full rounded-md border border-gray-200 px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                  <option value="measurement">מדידה</option>
                  <option value="installation">התקנה</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">מוצר *</Label>
                <select className="h-10 w-full rounded-md border border-gray-200 px-2 text-sm" value={form.category_id} onChange={(e) => { setForm({ ...form, category_id: e.target.value, supplier_id: '' }); setPicked(new Set()) }}>
                  <option value="">בחר מוצר</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">עיר *</Label>
                <select className="h-10 w-full rounded-md border border-gray-200 px-2 text-sm" value={form.city_id} onChange={(e) => { setForm({ ...form, city_id: e.target.value }); setPicked(new Set()) }}>
                  <option value="">בחר עיר</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">ספק</Label>
                <select className="h-10 w-full rounded-md border border-gray-200 px-2 text-sm" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">—</option>
                  {categorySuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">תאריך *</Label>
                <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">משעה</Label>
                <Input type="time" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">עד שעה</Label>
                <Input type="time" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">הערה</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="border rounded-md max-h-80 overflow-y-auto">
              {!form.category_id || !form.city_id ? (
                <p className="p-4 text-sm text-gray-500">בחרו מוצר ועיר כדי לראות את ההזמנות הפתוחות שעוד לא שובצו</p>
              ) : candidates.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">אין הזמנות פתוחות שלא שובצו במוצר ובעיר האלה</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="p-2 w-8">
                        <input
                          type="checkbox"
                          checked={candidates.every((o) => picked.has(o.id))}
                          onChange={(e) => setPicked(e.target.checked ? new Set(candidates.map((o) => o.id)) : new Set())}
                        />
                      </th>
                      <th className="p-2 text-right">דייר</th>
                      <th className="p-2 text-right">כתובת</th>
                      <th className="p-2 text-right">מה הוזמן</th>
                      <th className="p-2 text-right">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((o) => (
                      <tr key={o.id} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setPicked((p) => { const n = new Set(p); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n })}>
                        <td className="p-2"><input type="checkbox" readOnly checked={picked.has(o.id)} /></td>
                        <td className="p-2">{o.residents?.name}</td>
                        <td className="p-2 text-gray-600">{fullAddress(o.residents) || <span className="text-orange-600">חסרה כתובת</span>}</td>
                        <td className="p-2 text-gray-600 text-xs">{itemsText(o) || '—'}</td>
                        <td className="p-2 text-gray-600">{STATUS_LABELS[o.status] || o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs text-gray-500">
              אפשר לשמור יום גם בלי דירות, ולהוסיף אותן אחר כך (לחיצה על היום ביומן ← "הוסף דירות"). בשמירה, כל הדירות המסומנות יקבלו את התאריך והסטטוס "{form.kind === 'measurement' ? STATUS_LABELS.measurement_scheduled : STATUS_LABELS.delivery_scheduled}", והלקוחות יקבלו תזכורת קולית יום לפני.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setNewOpen(false)}>ביטול</Button>
              <Button onClick={saveDay} disabled={saving || !form.city_id || !form.category_id || !form.day}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : picked.size ? `שמור יום (${picked.size} דירות)` : 'שמור יום (בלי דירות בינתיים)'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דף עבודה לבעל המקצוע */}
      <Dialog open={!!sheetDay} onOpenChange={(o) => !o && setSheetDay(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>דף עבודה לבעל המקצוע</DialogTitle></DialogHeader>
          {sheetDay && (
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded-md p-3 max-h-[50vh] overflow-y-auto font-sans">{sheetText(sheetDay)}</pre>
              <div className="flex gap-2 justify-between flex-wrap">
                <Button variant="outline" className="text-red-600" onClick={() => cancelDay(sheetDay)}>
                  <Trash2 className="h-4 w-4 ml-1" />בטל יום
                </Button>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => { setAddPicked(new Set()); setAddingTo(sheetDay); setSheetDay(null) }}>
                    <Plus className="h-4 w-4 ml-1" />הוסף דירות
                  </Button>
                  <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(sheetText(sheetDay)); setCopied(true) }}>
                    <Copy className="h-4 w-4 ml-1" />{copied ? 'הועתק ✓' : 'העתק'}
                  </Button>
                  {(() => {
                    const sup = suppliers.find((s) => s.id === sheetDay.supplier_id)
                    const href = `https://wa.me/${sup?.phone ? waPhone(sup.phone) : ''}?text=${encodeURIComponent(sheetText(sheetDay))}`
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        <Button><Send className="h-4 w-4 ml-1" />{sup?.phone ? `שלח ל${sup.name} בוואטסאפ` : 'שלח בוואטסאפ'}</Button>
                      </a>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* הוספת דירות ליום קיים */}
      <Dialog open={!!addingTo} onOpenChange={(o) => !o && setAddingTo(null)}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {addingTo && `הוספת דירות — ${KIND_LABEL[addingTo.kind]} ${name(categories, addingTo.category_id)}, ${name(cities, addingTo.city_id)}, ${fmtDay(addingTo.day)}`}
            </DialogTitle>
          </DialogHeader>
          {addingTo && (() => {
            const list = orders.filter((o) =>
              !CLOSED_STATUSES.has(o.status) && !o.work_day_id &&
              o.category_id === addingTo.category_id && o.residents?.projects?.city_id === addingTo.city_id)
            return (
              <div className="space-y-3">
                <div className="border rounded-md max-h-80 overflow-y-auto">
                  {list.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">אין כרגע הזמנות פתוחות שלא שובצו במוצר ובעיר האלה</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="p-2 w-8"></th>
                          <th className="p-2 text-right">דייר</th>
                          <th className="p-2 text-right">כתובת</th>
                          <th className="p-2 text-right">מה הוזמן</th>
                          <th className="p-2 text-right">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((o) => (
                          <tr key={o.id} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setAddPicked((p) => { const n = new Set(p); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n })}>
                            <td className="p-2"><input type="checkbox" readOnly checked={addPicked.has(o.id)} /></td>
                            <td className="p-2">{o.residents?.name}</td>
                            <td className="p-2 text-gray-600">{fullAddress(o.residents) || <span className="text-orange-600">חסרה כתובת</span>}</td>
                            <td className="p-2 text-gray-600 text-xs">{itemsText(o) || '—'}</td>
                            <td className="p-2 text-gray-600">{STATUS_LABELS[o.status] || o.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setAddingTo(null)}>ביטול</Button>
                  <Button onClick={addToDay} disabled={saving || addPicked.size === 0}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `הוסף ${addPicked.size} דירות ליום`}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
