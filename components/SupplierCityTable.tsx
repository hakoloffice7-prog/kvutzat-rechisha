'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarPlus, Settings2 } from 'lucide-react'
import { useIsAdmin } from '@/components/RoleProvider'
import { AWAITING_STATUSES, DEFAULT_SUPPLIER_MIN } from '@/lib/orderMetrics'

// ספקים (מפרט, סעיף 8): לכל ספק — באילו ערים הוא עובד, מינימום הזמנות לעיר, וכמה ממתינות עכשיו.
// משבצת ירוקה = הגיע למינימום (זמן לתאם יום). למנהל: תנאי ההסכם (מה מגיע לחברה).

type Option = { id: string; name: string }
type Supplier = {
  id: string
  name: string
  phone: string | null
  category_id: string | null
  deal_type: 'percent' | 'per_unit' | null
  deal_value: number | null
  deal_unit: string | null
  categories: { name: string; kind?: string } | null
}
type Setting = { supplier_id: string; city_id: string; min_orders: number }
type Order = { status: string; category_id: string | null; supplier_id: string | null; residents: { projects: { city_id: string } | null } | null }

export function dealText(s: Pick<Supplier, 'deal_type' | 'deal_value' | 'deal_unit'>) {
  if (s.deal_value == null || !s.deal_type) return ''
  return s.deal_type === 'percent' ? `${s.deal_value}% לחברה` : `${s.deal_value} ₪ ל${s.deal_unit || 'יחידה'} לחברה`
}

export function SupplierCityTable() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [draftCities, setDraftCities] = useState<Record<string, string>>({}) // city_id -> min (ריק = לא עובד בעיר)
  const [draftDeal, setDraftDeal] = useState({ deal_type: '', deal_value: '', deal_unit: '' })
  const [saving, setSaving] = useState(false)
  // תנאי הסכם לפי פריט (למשל: חלון 20 ₪, דלת 60 ₪ לחברה)
  type DealRuleRow = { supplier_id: string; name: string; deal_type: 'percent' | 'per_unit'; deal_value: number; deal_unit: string | null }
  const [dealRules, setDealRules] = useState<DealRuleRow[]>([])
  const [draftRules, setDraftRules] = useState<{ name: string; deal_type: 'percent' | 'per_unit'; deal_value: string; deal_unit: string }[]>([])

  async function load() {
    const [s, c, st, o] = await Promise.all([
      supabase.from('suppliers').select('id, name, phone, category_id, deal_type, deal_value, deal_unit, categories(name, kind)').order('name'),
      supabase.from('cities').select('id, name').order('name'),
      supabase.from('supplier_city_settings').select('supplier_id, city_id, min_orders'),
      supabase.from('orders').select('status, category_id, supplier_id, residents(projects(city_id))'),
    ])
    setSuppliers(((s.data || []) as unknown as Supplier[]).filter((x) => x.categories?.kind !== 'staff'))
    setCities(c.data || [])
    setSettings((st.data || []) as Setting[])
    setOrders((o.data || []) as unknown as Order[])
    if (isAdmin) {
      const { data: dr } = await supabase.from('supplier_deal_rules').select('supplier_id, name, deal_type, deal_value, deal_unit').order('sort_order')
      setDealRules((dr || []) as DealRuleRow[])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ממתינות בעיר למוצר של הספק: הזמנות שמשויכות אליו, או שעוד לא שויך להן ספק
  function pending(sup: Supplier, cityId: string) {
    return orders.filter((o) =>
      AWAITING_STATUSES.has(o.status) &&
      o.category_id === sup.category_id &&
      (o.supplier_id === sup.id || !o.supplier_id) &&
      o.residents?.projects?.city_id === cityId
    ).length
  }
  const settingOf = (supId: string, cityId: string) => settings.find((x) => x.supplier_id === supId && x.city_id === cityId)

  function openEdit(sup: Supplier) {
    const d: Record<string, string> = {}
    for (const st of settings.filter((x) => x.supplier_id === sup.id)) d[st.city_id] = String(st.min_orders)
    setDraftCities(d)
    setDraftDeal({ deal_type: sup.deal_type || '', deal_value: sup.deal_value != null ? String(sup.deal_value) : '', deal_unit: sup.deal_unit || '' })
    setDraftRules(dealRules.filter((r) => r.supplier_id === sup.id).map((r) => ({ name: r.name, deal_type: r.deal_type, deal_value: String(r.deal_value), deal_unit: r.deal_unit || '' })))
    setEditing(sup)
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    await supabase.from('supplier_city_settings').delete().eq('supplier_id', editing.id)
    const rows = Object.entries(draftCities)
      .filter(([, v]) => v !== '')
      .map(([city_id, v]) => ({ supplier_id: editing.id, city_id, min_orders: Math.max(1, parseInt(v) || DEFAULT_SUPPLIER_MIN) }))
    if (rows.length) await supabase.from('supplier_city_settings').insert(rows)
    if (isAdmin) {
      const value = parseFloat(draftDeal.deal_value)
      await supabase.from('suppliers').update({
        deal_type: draftDeal.deal_type || null,
        deal_value: Number.isNaN(value) ? null : value,
        deal_unit: draftDeal.deal_type === 'per_unit' ? (draftDeal.deal_unit.trim() || 'יחידה') : null,
      }).eq('id', editing.id)
      await supabase.from('supplier_deal_rules').delete().eq('supplier_id', editing.id)
      const rules = draftRules
        .filter((r) => r.name.trim() && !Number.isNaN(parseFloat(r.deal_value)))
        .map((r, i) => ({
          supplier_id: editing.id, name: r.name.trim(), deal_type: r.deal_type, deal_value: parseFloat(r.deal_value),
          deal_unit: r.deal_type === 'per_unit' ? (r.deal_unit.trim() || r.name.trim()) : null, sort_order: i,
        }))
      if (rules.length) await supabase.from('supplier_deal_rules').insert(rules)
    }
    setSaving(false)
    setEditing(null)
    load()
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-blue-600" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">ממתינות לפי עיר / מינימום</CardTitle>
        <p className="text-xs text-gray-500">
          ממתינות = "מעוניין", "ממתין לבחירת צורה ודגם", "אושר צורה ודגם". ירוק = הגיע למינימום — שווה לספק להגיע. לחיצה על ⚙ להגדרת ערים, מינימום{isAdmin ? ' ותנאי הסכם' : ''}.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-right py-2 px-3 font-medium">ספק</th>
                <th className="text-right py-2 px-3 font-medium">מוצר</th>
                <th className="text-right py-2 px-3 font-medium">טלפון</th>
                {isAdmin && <th className="text-right py-2 px-3 font-medium">הסכם</th>}
                {cities.map((c) => <th key={c.id} className="py-2 px-2 font-medium text-center whitespace-nowrap">{c.name}</th>)}
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((sup) => {
                const served = settings.filter((x) => x.supplier_id === sup.id)
                return (
                  <tr key={sup.id} className="border-b">
                    <td className="py-2 px-3 font-medium"><Link href={`/suppliers/${sup.id}`} className="hover:text-blue-600">{sup.name}</Link></td>
                    <td className="py-2 px-3 text-gray-600">{sup.categories?.name || '—'}</td>
                    <td className="py-2 px-3 text-gray-600" dir="ltr">{sup.phone || '—'}</td>
                    {isAdmin && (
                      <td className="py-2 px-3 text-xs text-gray-600">
                        <div className="whitespace-nowrap">{dealText(sup) || (dealRules.some((r) => r.supplier_id === sup.id) ? '' : <span className="text-orange-600">לא הוגדר</span>)}</div>
                        {dealRules.filter((r) => r.supplier_id === sup.id).map((r, i) => (
                          <div key={i} className="whitespace-nowrap">{r.name}: {r.deal_type === 'per_unit' ? `${r.deal_value} ₪ ל${r.deal_unit || r.name}` : `${r.deal_value}%`}</div>
                        ))}
                      </td>
                    )}
                    {cities.map((c) => {
                      const st = settingOf(sup.id, c.id)
                      const n = pending(sup, c.id)
                      if (!st) {
                        return <td key={c.id} className="py-2 px-2 text-center text-gray-300" title="הספק לא עובד בעיר הזו (אפשר להגדיר ב-⚙)">{n > 0 ? <span className="text-gray-400">{n}</span> : '·'}</td>
                      }
                      const ready = n >= st.min_orders
                      return (
                        <td key={c.id} className="py-1 px-1 text-center">
                          <Link
                            href={`/orders?city=${c.id}&category=${sup.category_id}&status=g:awaiting`}
                            className={`block rounded px-2 py-1 whitespace-nowrap ${ready ? 'bg-green-500 text-white font-semibold' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                          >
                            {n} / {st.min_orders}
                          </Link>
                        </td>
                      )
                    })}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(sup)} title="ערים, מינימום והסכם"><Settings2 className="h-4 w-4" /></Button>
                      <Link href={`/calendar?new=1&category=${sup.category_id || ''}&supplier=${sup.id}${served.length === 1 ? `&city=${served[0].city_id}` : ''}`}>
                        <Button size="sm" variant="outline"><CalendarPlus className="h-4 w-4 ml-1" />קבע יום</Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing?.name} — ערים ומינימום</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">סמנו את הערים שהספק עובד בהן, ולכל עיר את מספר ההזמנות הממתינות שממנו שווה לו להגיע.</p>
            {cities.map((c) => {
              const on = draftCities[c.id] !== undefined
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setDraftCities((d) => {
                        const n = { ...d }
                        if (e.target.checked) n[c.id] = String(DEFAULT_SUPPLIER_MIN)
                        else delete n[c.id]
                        return n
                      })}
                    />
                    {c.name}
                  </label>
                  {on && (
                    <span className="flex items-center gap-1 text-sm">
                      מינימום
                      <Input className="w-20 h-8" type="number" min="1" value={draftCities[c.id]} onChange={(e) => setDraftCities((d) => ({ ...d, [c.id]: e.target.value }))} dir="ltr" />
                    </span>
                  )}
                </div>
              )
            })}
            {isAdmin && (
              <div className="border-t pt-3 space-y-2">
                <Label>תנאי הסכם — מה מגיע לחברה</Label>
                <div className="grid grid-cols-3 gap-2">
                  <select className="h-10 rounded-md border border-gray-200 px-2 text-sm" value={draftDeal.deal_type} onChange={(e) => setDraftDeal({ ...draftDeal, deal_type: e.target.value })}>
                    <option value="">לא הוגדר</option>
                    <option value="percent">אחוז מהמחיר</option>
                    <option value="per_unit">סכום ליחידה</option>
                  </select>
                  <Input type="number" step="any" placeholder={draftDeal.deal_type === 'per_unit' ? '₪ ליחידה' : '%'} value={draftDeal.deal_value} onChange={(e) => setDraftDeal({ ...draftDeal, deal_value: e.target.value })} dir="ltr" />
                  {draftDeal.deal_type === 'per_unit' && (
                    <Input placeholder="יחידה (מטר)" value={draftDeal.deal_unit} onChange={(e) => setDraftDeal({ ...draftDeal, deal_unit: e.target.value })} />
                  )}
                </div>
                <p className="text-xs text-gray-500">לדוגמה בווילונות: 35 ₪ למטר לחברה (285 ₪ ללקוח, 250 ₪ לספק).</p>
                <div className="space-y-2 pt-2">
                  <Label>הסכם לפי פריט (רשות)</Label>
                  <p className="text-xs text-gray-500">למשל: חלון 20 ₪ לחלון, דלת 60 ₪ לדלת. פריט בהזמנה שהתיאור שלו מכיל את השם (למשל "דלת") יחושב לפי הכלל שלו × הכמות. שאר הפריטים — לפי ההסכם הכללי שלמעלה.</p>
                  {draftRules.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.3fr_1fr_0.8fr_0.9fr_auto] gap-1 items-center">
                      <Input placeholder="פריט (דלת)" value={r.name} onChange={(e) => setDraftRules((l) => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <select className="h-10 rounded-md border border-gray-200 px-1 text-sm" value={r.deal_type} onChange={(e) => setDraftRules((l) => l.map((x, j) => j === i ? { ...x, deal_type: e.target.value as 'percent' | 'per_unit' } : x))}>
                        <option value="per_unit">סכום ליחידה</option>
                        <option value="percent">אחוז</option>
                      </select>
                      <Input type="number" step="any" placeholder={r.deal_type === 'per_unit' ? '₪' : '%'} value={r.deal_value} onChange={(e) => setDraftRules((l) => l.map((x, j) => j === i ? { ...x, deal_value: e.target.value } : x))} dir="ltr" />
                      {r.deal_type === 'per_unit'
                        ? <Input placeholder="יחידה" value={r.deal_unit} onChange={(e) => setDraftRules((l) => l.map((x, j) => j === i ? { ...x, deal_unit: e.target.value } : x))} />
                        : <span />}
                      <button type="button" onClick={() => setDraftRules((l) => l.filter((_, j) => j !== i))} className="px-1 text-red-400 hover:text-red-600" title="הסר">✕</button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraftRules((l) => [...l, { name: '', deal_type: 'per_unit', deal_value: '', deal_unit: '' }])}>+ הוסף פריט להסכם</Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
              <Button onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
