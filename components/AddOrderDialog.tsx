'use client'

import { requestOrderReminder } from "@/lib/sendOrderReminder"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Loader2, X } from 'lucide-react'
import { STATUS_LABELS, STATUS_ORDER, stampNewNoteLines, profitRuleFor, calcSupplierByRule } from '@/lib/utils'
import { useIsAdmin } from '@/components/RoleProvider'
import { stampsMeasuredDate } from '@/lib/orderMetrics'

type Category = { id: string; name: string }
type Supplier = { id: string; name: string; category_id: string }
type NewOrderItem = {
  description: string
  model: string
  customer_price: string
  supplier_price: string
  profit_percent: string
  supplier_price_touched: boolean
  quantity: string // רלוונטי לקטגוריה עם רווח ליחידה (למשל מספר חלונות / מטרים)
  rule_name: string // סוג מוצר נוסף בקטגוריה ('' = הכלל של הקטגוריה)
}
type SubRule = { name: string; profit_type: 'percent' | 'per_unit'; profit_value: number; unit_label: string | null }

const EMPTY_ORDER = {
  category_id: '',
  supplier_id: '',
  status: 'interested',
  payment_status: 'not_paid',
  notes: '',
  measured_at: '',
  planned_date: '',
  planned_time: '',
  planned_time_to: '',
}

// חלון הוספת הזמנה לדייר — משותף לכרטיס הדייר ולחלונית ההזמנות ברשימת הדיירים.
// אחרי יצירה עוברים לעמוד ההזמנה.
export function AddOrderDialog({
  residentId, open, onOpenChange,
}: {
  residentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const supabase = createClient()

  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newOrder, setNewOrder] = useState(EMPTY_ORDER)
  const [newOrderItems, setNewOrderItems] = useState<NewOrderItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setNewOrder(EMPTY_ORDER)
      setNewOrderItems([])
      return
    }
    ;(async () => {
      const [{ data: cats }, { data: sups }] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
      ])
      // אנשי צוות (מעצבת / מתכנת) אינם מוצרים להזמנה
      if (cats) setCategories(cats.filter((c: any) => c.kind !== 'staff'))
      if (sups) setSuppliers(sups)
    })()
  }, [open])

  const selectedCategory = categories.find(c => c.id === newOrder.category_id)
  const rule = profitRuleFor(selectedCategory)
  // סוגי מוצר נוספים בקטגוריה (למשל ברשתות: דלת 60 ₪) — לכל פריט אפשר לבחור סוג
  const [subRules, setSubRules] = useState<SubRule[]>([])
  useEffect(() => {
    if (!newOrder.category_id) { setSubRules([]); return }
    supabase.from('category_profit_rules').select('name, profit_type, profit_value, unit_label').eq('category_id', newOrder.category_id).order('sort_order')
      .then(({ data }) => setSubRules((data || []) as SubRule[]))
  }, [newOrder.category_id])
  function ruleOf(item: { rule_name: string }) {
    const sub = subRules.find((r) => r.name === item.rule_name)
    return sub ? { type: sub.profit_type, value: Number(sub.profit_value), unit: sub.unit_label || sub.name } : rule
  }
  const perUnit = rule.type === 'per_unit' || subRules.some((r) => r.profit_type === 'per_unit')
  // כמות (מטרים / חלונות) מוצגת לכולם במוצר עם סכום ליחידה — נשמרת לחישוב מה הספק מחזיר לחברה
  const gridCols = !isAdmin
    ? (perUnit ? 'grid-cols-[2fr_1fr_0.6fr_auto]' : 'grid-cols-[2fr_1fr_auto]')
    : perUnit ? 'grid-cols-[2fr_1fr_0.6fr_0.7fr_1fr_auto]' : 'grid-cols-[2fr_1fr_0.7fr_1fr_auto]'

  // שינוי קטגוריה מעדכן את אחוז הרווח של פריטים שמחיר הספק שלהם עוד לא נערך ידנית
  function changeCategory(categoryId: string) {
    setNewOrder(prev => ({ ...prev, category_id: categoryId, supplier_id: '' }))
    const r = profitRuleFor(categories.find(c => c.id === categoryId))
    setNewOrderItems(prev => prev.map(item => item.supplier_price_touched ? { ...item, rule_name: '' } : {
      ...item,
      rule_name: '',
      profit_percent: String(r.value),
      supplier_price: String(calcSupplierByRule(parseFloat(item.customer_price) || 0, r.value, r.type, parseFloat(item.quantity) || 1)),
    }))
  }

  function addNewOrderItem() {
    setNewOrderItems(prev => [...prev, {
      description: '', model: '', customer_price: '', supplier_price: '', quantity: '1', rule_name: '',
      profit_percent: String(rule.value), supplier_price_touched: false,
    }])
  }
  function updateNewOrderItem(idx: number, field: keyof NewOrderItem, value: string) {
    setNewOrderItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (field === 'supplier_price') {
        return { ...item, supplier_price: value, supplier_price_touched: true }
      }
      if (field === 'rule_name') {
        // בחירת סוג מוצר: הרווח לפי הסוג, ותיאור אוטומטי אם ריק
        const sub = subRules.find((r) => r.name === value)
        const r = sub ? { type: sub.profit_type, value: Number(sub.profit_value) } : rule
        const updated = { ...item, rule_name: value, profit_percent: String(r.value), description: item.description.trim() ? item.description : (sub?.name || '') }
        if (!item.supplier_price_touched) {
          updated.supplier_price = String(calcSupplierByRule(parseFloat(updated.customer_price) || 0, r.value, r.type, parseFloat(updated.quantity) || 1))
        }
        return updated
      }
      if (field === 'customer_price' || field === 'profit_percent' || field === 'quantity') {
        const updated = { ...item, [field]: value }
        if (!item.supplier_price_touched) {
          const customer = parseFloat(updated.customer_price) || 0
          const profit = parseFloat(updated.profit_percent) || 0
          updated.supplier_price = String(calcSupplierByRule(customer, profit, ruleOf(updated).type, parseFloat(updated.quantity) || 1))
        }
        return updated
      }
      return { ...item, [field]: value }
    }))
  }
  function removeNewOrderItem(idx: number) {
    setNewOrderItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function addOrder() {
    if (!newOrder.category_id || !newOrder.supplier_id) return
    setSaving(true)

    const validItems = newOrderItems.filter(i => i.description.trim())
    const totalPrice = validItems.reduce((sum, i) => sum + (parseFloat(i.customer_price) || 0), 0)

    const { data: orderData, error } = await supabase.from('orders').insert({
      resident_id: residentId,
      category_id: newOrder.category_id,
      supplier_id: newOrder.supplier_id,
      status: newOrder.status,
      payment_status: newOrder.payment_status,
      notes: stampNewNoteLines('', newOrder.notes),
      measured_at: newOrder.measured_at || ((newOrder.status === 'measured' || stampsMeasuredDate(selectedCategory?.name, newOrder.status)) ? new Date().toLocaleDateString('en-CA') : null),
      total_price: totalPrice,
      // מועד מדידה/התקנה מתוכנן (לתזכורת קולית יום לפני)
      ...(newOrder.status === 'measurement_scheduled'
        ? { measurement_planned_time: newOrder.planned_time || null, measurement_planned_time_to: newOrder.planned_time_to || null } : {}),
      ...(newOrder.status === 'delivery_scheduled' && newOrder.planned_date
        ? { installation_planned_date: newOrder.planned_date, installation_planned_time: newOrder.planned_time || null, installation_planned_time_to: newOrder.planned_time_to || null } : {}),
    }).select('id').single()

    if (!error && orderData) {
      if (validItems.length > 0) {
        const { data: insertedItems } = await supabase.from('order_items').insert(
          validItems.map(i => ({
            order_id: orderData.id,
            description: i.description.trim(),
            model: i.model.trim(),
            customer_price: parseFloat(i.customer_price) || 0,
            quantity: parseFloat(i.quantity) || 1,
            product_type: i.rule_name || null,
          }))
        ).select('id')

        if (isAdmin && insertedItems) {
          await supabase.from('order_item_costs').insert(
            insertedItems.map((row, idx) => ({
              order_item_id: row.id,
              supplier_price: parseFloat(validItems[idx].supplier_price) || 0,
            }))
          )
        }
      }
      // הודעה קולית ללקוח על הזמנה חדשה בסטטוס "מעוניין" (לא חוסם את המעבר; כשל לא מפריע ליצירה)
      if (newOrder.status === "interested") fetch("/api/pbx/order-voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: orderData.id }) }).catch(() => {})
      // מדידה/התקנה למחר אחרי שה-Cron של היום רץ: תזכורת מיידית (השרת מחליט אם בכלל צריך)
      if ((newOrder.status === "measurement_scheduled" || newOrder.status === "delivery_scheduled") && (newOrder.status === "measurement_scheduled" ? newOrder.measured_at : newOrder.planned_date)) {
        await requestOrderReminder(orderData.id)
      }
      router.push(`/orders/${orderData.id}`)
    }
    setSaving(false)
  }


  const filteredSuppliers = newOrder.category_id
    ? suppliers.filter(s => s.category_id === newOrder.category_id)
    : suppliers

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוספת הזמנה חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>קטגוריה *</Label>
              <Select
                value={newOrder.category_id}
                onChange={(e) => changeCategory(e.target.value)}
              >
                <option value="">בחר קטגוריה</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ספק *</Label>
              <Select
                value={newOrder.supplier_id}
                onChange={(e) => setNewOrder({ ...newOrder, supplier_id: e.target.value })}
              >
                <option value="">בחר ספק</option>
                {filteredSuppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>סטטוס</Label>
              <Select
                value={newOrder.status}
                onChange={(e) => setNewOrder({ ...newOrder, status: e.target.value })}
              >
                {STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </div>
            {true && (
              <div className="space-y-2">
                <Label>תאריך מדידה</Label>
                <Input
                  type="date"
                  value={newOrder.measured_at}
                  onChange={(e) => setNewOrder({ ...newOrder, measured_at: e.target.value })}
                  dir="ltr"
                />
              </div>
            )}
            {(newOrder.status === 'measurement_scheduled' || newOrder.status === 'delivery_scheduled') && (
              <div className="space-y-2">
                <Label>
                  {newOrder.status === 'measurement_scheduled' ? 'שעות המדידה (לפי "תאריך מדידה")' : 'התקנה מתוכננת'} (תזכורת קולית יום לפני)
                </Label>
                <div className={newOrder.status === 'delivery_scheduled' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                  {newOrder.status === 'delivery_scheduled' && (
                    <div className="space-y-1">
                      <span className="text-xs text-gray-500">תאריך</span>
                      <Input
                        type="date"
                        value={newOrder.planned_date}
                        onChange={(e) => setNewOrder({ ...newOrder, planned_date: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">משעה</span>
                    <Input
                      type="time"
                      value={newOrder.planned_time}
                      onChange={(e) => setNewOrder({ ...newOrder, planned_time: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">עד שעה</span>
                    <Input
                      type="time"
                      value={newOrder.planned_time_to}
                      onChange={(e) => setNewOrder({ ...newOrder, planned_time_to: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>סטטוס תשלום</Label>
              <Select
                value={newOrder.payment_status}
                onChange={(e) => setNewOrder({ ...newOrder, payment_status: e.target.value })}
              >
                <option value="not_paid">לא שילם</option>
                <option value="advance">מקדמה</option>
                <option value="paid_full">שילם הכל</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>הערות</Label>
            <Input
              value={newOrder.notes}
              onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
              placeholder="הערות נוספות..."
            />
          </div>

          {/* Items section */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">פריטים</Label>
              <Button type="button" variant="outline" size="sm" onClick={addNewOrderItem}>
                <Plus className="h-3.5 w-3.5 ml-1" />
                הוסף פריט
              </Button>
            </div>
            {newOrderItems.length > 0 && (
              <div className="space-y-2">
                <div className={`grid ${gridCols} gap-2 text-xs text-gray-500 px-1`}>
                  <span>תיאור</span>
                  <span>מחיר לקוח ₪</span>
                  {perUnit && <span>{subRules.length ? 'כמות' : `כמות (${rule.unit})`}</span>}
                  {isAdmin && <span>{subRules.length ? 'רווח (₪ ליחידה / %)' : rule.type === 'per_unit' ? `רווח ל${rule.unit} ₪` : 'רווח %'}</span>}
                  {isAdmin && <span>מחיר ספק ₪</span>}
                  <span></span>
                </div>
                {newOrderItems.map((item, idx) => (
                  <div key={idx} className={`grid ${gridCols} gap-2 items-center`}>
                    <div className="space-y-1">
                      {subRules.length > 0 && (
                        <select
                          value={item.rule_name}
                          onChange={(e) => updateNewOrderItem(idx, 'rule_name', e.target.value)}
                          className="h-8 w-full rounded-md border border-gray-200 bg-white px-1 text-xs"
                          title="סוג מוצר — קובע את הרווח"
                        >
                          <option value="">{selectedCategory?.name} (רגיל)</option>
                          {subRules.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                        </select>
                      )}
                      <Input
                        value={item.description}
                        onChange={(e) => updateNewOrderItem(idx, 'description', e.target.value)}
                        placeholder="תיאור הפריט"
                        className="h-8 text-sm"
                      />
                    </div>
                    <Input
                      type="number"
                              step="any"
                      value={item.customer_price}
                      onChange={(e) => updateNewOrderItem(idx, 'customer_price', e.target.value)}
                      placeholder="0"
                      className="h-8 text-sm"
                      dir="ltr"
                    />
                    {perUnit && (
                      <Input
                        type="number"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateNewOrderItem(idx, 'quantity', e.target.value)}
                        placeholder="1"
                        className="h-8 text-sm"
                        dir="ltr"
                      />
                    )}
                    {isAdmin && (
                      <>
                        <Input
                          type="number"
                              step="any"
                          value={item.profit_percent}
                          onChange={(e) => updateNewOrderItem(idx, 'profit_percent', e.target.value)}
                          placeholder={ruleOf(item).type === 'per_unit' ? `₪ ל${ruleOf(item).unit}` : '%'}
                          title={ruleOf(item).type === 'per_unit' ? `רווח ל${ruleOf(item).unit} (₪)` : 'אחוז רווח'}
                          className="h-8 text-sm"
                          dir="ltr"
                        />
                        <Input
                          type="number"
                              step="any"
                          value={item.supplier_price}
                          onChange={(e) => updateNewOrderItem(idx, 'supplier_price', e.target.value)}
                          placeholder="0"
                          className="h-8 text-sm"
                          dir="ltr"
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                      onClick={() => removeNewOrderItem(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={addOrder} disabled={saving || !newOrder.category_id || !newOrder.supplier_id}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף הזמנה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
