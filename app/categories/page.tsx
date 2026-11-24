'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/RoleProvider'
import { profitRuleFor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Package, Loader2, Trash2, Pencil } from 'lucide-react'

type Category = {
  id: string
  name: string
  created_at: string
  profit_type?: 'percent' | 'per_unit' | null
  profit_value?: number | null
  unit_label?: string | null
  all_profit?: boolean | null
  kind?: string | null
}

// תיאור קצר של כלל הרווח לכרטיס הקטגוריה
function profitText(c: Category) {
  const r = profitRuleFor(c)
  return r.type === 'per_unit' ? `רווח: ${r.value} ₪ ל${r.unit}` : `רווח: ${r.value}%`
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [usage, setUsage] = useState<Record<string, { orders: number; suppliers: number }>>({})
  const [editing, setEditing] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const isAdmin = useIsAdmin()
  const [editProfitType, setEditProfitType] = useState<'percent' | 'per_unit'>('percent')
  const [editProfitValue, setEditProfitValue] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editAllProfit, setEditAllProfit] = useState(false)
  const [editStaff, setEditStaff] = useState(false)

  function openEdit(category: Category) {
    const r = profitRuleFor(category)
    setEditing(category)
    setEditName(category.name)
    setEditProfitType(r.type)
    setEditProfitValue(String(r.value))
    setEditUnit(r.type === 'per_unit' ? r.unit : '')
    setEditAllProfit(!!category.all_profit)
    setEditStaff(category.kind === 'staff')
  }
  const supabase = createClient()

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setLoading(true)
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('name')

    if (data) setCategories(data)

    // שימוש בקטגוריות: הזמנות וספקים המקושרים אליהן
    const [{ data: ordersData }, { data: suppliersData }] = await Promise.all([
      supabase.from('orders').select('category_id'),
      supabase.from('suppliers').select('category_id'),
    ])
    const next: Record<string, { orders: number; suppliers: number }> = {}
    for (const o of ordersData || []) {
      if (!o.category_id) continue
      next[o.category_id] = next[o.category_id] || { orders: 0, suppliers: 0 }
      next[o.category_id].orders++
    }
    for (const sp of suppliersData || []) {
      if (!sp.category_id) continue
      next[sp.category_id] = next[sp.category_id] || { orders: 0, suppliers: 0 }
      next[sp.category_id].suppliers++
    }
    setUsage(next)
    setLoading(false)
  }

  function usageText(id: string) {
    const u = usage[id]
    if (!u) return ''
    const parts = []
    if (u.orders) parts.push(`${u.orders} הזמנות`)
    if (u.suppliers) parts.push(`${u.suppliers} ספקים`)
    return parts.join(' · ')
  }

  async function renameCategory() {
    if (!editing || !editName.trim()) return
    if (categories.some((c) => c.id !== editing.id && c.name.trim() === editName.trim())) {
      alert('קיימת כבר קטגוריה בשם זה')
      return
    }
    setRenaming(true)
    const value = parseFloat(editProfitValue)
    const update: Record<string, unknown> = { name: editName.trim() }
    if (isAdmin) {
      update.profit_type = editProfitType
      update.profit_value = Number.isNaN(value) ? null : value
      update.unit_label = editProfitType === 'per_unit' ? (editUnit.trim() || 'יחידה') : null
      update.all_profit = editAllProfit
      update.kind = editStaff ? 'staff' : 'product'
    }
    const { error } = await supabase.from('categories').update(update).eq('id', editing.id)
    setRenaming(false)
    if (error) {
      alert('שגיאה בעדכון הקטגוריה')
      return
    }
    setEditing(null)
    fetchCategories()
  }

  async function addCategory() {
    if (!newName.trim()) return
    setSaving(true)

    const { error } = await supabase.from('categories').insert({ name: newName.trim() })

    if (!error) {
      setNewName('')
      setDialogOpen(false)
      fetchCategories()
    }
    setSaving(false)
  }

  async function deleteCategory(id: string) {
    // בדיקה מחדש מול השרת כדי לא להסתמך על נתון ישן במסך
    const [{ count: ordersCount }, { count: suppliersCount }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('category_id', id),
      supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('category_id', id),
    ])
    if ((ordersCount || 0) > 0 || (suppliersCount || 0) > 0) {
      alert(`לא ניתן למחוק קטגוריה שבשימוש (${ordersCount || 0} הזמנות, ${suppliersCount || 0} ספקים). יש להסיר אותה קודם מהם.`)
      fetchCategories()
      return
    }
    if (!confirm('האם למחוק קטגוריה זו?')) return
    await supabase.from('categories').delete().eq('id', id)
    fetchCategories()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">קטגוריות מוצרים</h1>
          <p className="text-gray-500 mt-1">ניהול קטגוריות דינמיות</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              הוסף קטגוריה
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הוספת קטגוריה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>שם הקטגוריה</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="לדוגמה: סורגים, מזגנים, מטבחים..."
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
                <Button onClick={addCategory} disabled={saving || !newName.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Default categories hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-700 text-sm font-medium">קטגוריות נפוצות לדיור חדש:</p>
        <p className="text-blue-600 text-sm mt-1">
          סורגים • מזגנים • מטבחים • ריצוף • דלתות • חלונות • ארונות • מדרגות • מרפסות • תאורה
        </p>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין קטגוריות עדיין</p>
            <p className="text-gray-400 text-sm mt-1">הוסף קטגוריה ראשונה</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((category) => (
            <Card key={category.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-500" />
                    <div>
                      <span className="font-medium text-gray-900">{category.name}</span>
                      {usageText(category.id) && (
                        <p className="text-xs text-gray-400">{usageText(category.id)}</p>
                      )}
                      {isAdmin && <p className="text-xs text-green-700">{profitText(category)}{category.all_profit ? ' · כל הרווח שלנו' : ''}</p>}
                      {category.kind === 'staff' && <p className="text-xs text-purple-700">איש צוות</p>}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(category)}
                      className="text-gray-400 hover:text-blue-600 h-8 w-8 p-0"
                      title={isAdmin ? 'עריכת שם ורווח' : 'עריכת שם'}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCategory(category.id)}
                      disabled={!!usage[category.id]}
                      title={usage[category.id] ? `בשימוש: ${usageText(category.id)} - לא ניתן למחוק` : 'מחיקה'}
                      className="text-red-400 hover:text-red-600 h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAdmin ? 'עריכת קטגוריה' : 'עריכת שם קטגוריה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>שם הקטגוריה</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && renameCategory()}
              />
              <p className="text-xs text-gray-500">השם החדש יתעדכן אוטומטית בכל המקומות (הזמנות, ספקים, דוחות).</p>
            </div>
            {isAdmin && (
              <div className="space-y-2 border-t pt-4">
                <Label>רווח בהזמנות חדשות</Label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={editProfitType === 'percent'} onChange={() => setEditProfitType('percent')} />
                    אחוז מהמחיר
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={editProfitType === 'per_unit'} onChange={() => setEditProfitType('per_unit')} />
                    סכום קבוע ליחידה
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">{editProfitType === 'per_unit' ? 'רווח ליחידה (₪)' : 'אחוז רווח (%)'}</span>
                    <Input type="number" step="any" value={editProfitValue} onChange={(e) => setEditProfitValue(e.target.value)} dir="ltr" />
                  </div>
                  {editProfitType === 'per_unit' && (
                    <div className="space-y-1">
                      <span className="text-xs text-gray-500">יחידה (למשל: חלון, מטר)</span>
                      <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} placeholder="יחידה" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">משמש לחישוב אוטומטי של מחיר הספק בפריטים חדשים. אפשר עדיין לשנות ידנית בכל הזמנה. הזמנות קיימות לא משתנות.</p>
                <label className="flex items-center gap-2 text-sm pt-2">
                  <input type="checkbox" checked={editAllProfit} onChange={(e) => setEditAllProfit(e.target.checked)} />
                  כל הרווח שלנו (לעמלות נציגים — למשל רשתות, הדברה, התקנת מזגנים)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editStaff} onChange={(e) => setEditStaff(e.target.checked)} />
                  איש צוות, לא מוצר (למשל מעצבת) — לא יופיע בהזמנות ובספירות
                </label>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
              <Button onClick={renameCategory} disabled={renaming || !editName.trim() || (!isAdmin && editName.trim() === editing?.name)}>
                {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
