'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Loader2, X } from 'lucide-react'
import { STATUS_LABELS, STATUS_ORDER, calcSupplierPrice, defaultProfitPercent, stampNewNoteLines } from '@/lib/utils'
import { useIsAdmin } from '@/components/RoleProvider'

type Category = { id: string; name: string }
type Supplier = { id: string; name: string; category_id: string }
type NewOrderItem = {
  description: string
  model: string
  customer_price: string
  supplier_price: string
  profit_percent: string
  supplier_price_touched: boolean
}

const EMPTY_ORDER = {
  category_id: '',
  supplier_id: '',
  status: 'interested',
  payment_status: 'not_paid',
  notes: '',
  measured_at: '',
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
      if (cats) setCategories(cats)
      if (sups) setSuppliers(sups)
    })()
  }, [open])

  const selectedCategoryName = categories.find(c => c.id === newOrder.category_id)?.name

  // שינוי קטגוריה מעדכן את אחוז הרווח של פריטים שמחיר הספק שלהם עוד לא נערך ידנית
  function changeCategory(categoryId: string) {
    setNewOrder(prev => ({ ...prev, category_id: categoryId, supplier_id: '' }))
    const percent = defaultProfitPercent(categories.find(c => c.id === categoryId)?.name)
    setNewOrderItems(prev => prev.map(item => item.supplier_price_touched ? item : {
      ...item,
      profit_percent: percent,
      supplier_price: String(calcSupplierPrice(parseFloat(item.customer_price) || 0, parseFloat(percent) || 0)),
    }))
  }

  function addNewOrderItem() {
    setNewOrderItems(prev => [...prev, {
      description: '', model: '', customer_price: '', supplier_price: '',
      profit_percent: defaultProfitPercent(selectedCategoryName), supplier_price_touched: false,
    }])
  }
  function updateNewOrderItem(idx: number, field: keyof NewOrderItem, value: string) {
    setNewOrderItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (field === 'supplier_price') {
        return { ...item, supplier_price: value, supplier_price_touched: true }
      }
      if (field === 'customer_price' || field === 'profit_percent') {
        const updated = { ...item, [field]: value }
        if (!item.supplier_price_touched) {
          const customer = parseFloat(field === 'customer_price' ? value : item.customer_price) || 0
          const percent = parseFloat(field === 'profit_percent' ? value : item.profit_percent) || 0
          updated.supplier_price = String(calcSupplierPrice(customer, percent))
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
      measured_at: newOrder.status === 'measured' ? (newOrder.measured_at || new Date().toISOString().slice(0, 10)) : null,
      total_price: totalPrice,
    }).select('id').single()

    if (!error && orderData) {
      if (validItems.length > 0) {
        const { data: insertedItems } = await supabase.from('order_items').insert(
          validItems.map(i => ({
            order_id: orderData.id,
            description: i.description.trim(),
            model: i.model.trim(),
            customer_price: parseFloat(i.customer_price) || 0,
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
            {newOrder.status === 'measured' && (
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
                <div className={`grid ${isAdmin ? 'grid-cols-[2fr_1fr_0.7fr_1fr_auto]' : 'grid-cols-[2fr_1fr_auto]'} gap-2 text-xs text-gray-500 px-1`}>
                  <span>תיאור</span>
                  <span>מחיר לקוח ₪</span>
                  {isAdmin && <span>רווח %</span>}
                  {isAdmin && <span>מחיר ספק ₪</span>}
                  <span></span>
                </div>
                {newOrderItems.map((item, idx) => (
                  <div key={idx} className={`grid ${isAdmin ? 'grid-cols-[2fr_1fr_0.7fr_1fr_auto]' : 'grid-cols-[2fr_1fr_auto]'} gap-2 items-center`}>
                    <Input
                      value={item.description}
                      onChange={(e) => updateNewOrderItem(idx, 'description', e.target.value)}
                      placeholder="תיאור הפריט"
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      value={item.customer_price}
                      onChange={(e) => updateNewOrderItem(idx, 'customer_price', e.target.value)}
                      placeholder="0"
                      className="h-8 text-sm"
                      dir="ltr"
                    />
                    {isAdmin && (
                      <>
                        <Input
                          type="number"
                          value={item.profit_percent}
                          onChange={(e) => updateNewOrderItem(idx, 'profit_percent', e.target.value)}
                          placeholder="10"
                          className="h-8 text-sm"
                          dir="ltr"
                        />
                        <Input
                          type="number"
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
