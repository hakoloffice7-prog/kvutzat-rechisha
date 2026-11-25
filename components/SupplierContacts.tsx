'use client'

import { useState } from 'react'
import { UserRound, Phone, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { digitsOnly } from '@/lib/utils'

// אנשי קשר נוספים לספק (שם + טלפון), בכרטיס הספק
export type SupplierContact = { id: string; supplier_id: string; name: string; phone: string | null; note: string | null }

export function SupplierContacts({ supplierId, contacts, onChange }: { supplierId: string; contacts: SupplierContact[]; onChange: () => void }) {
  const supabase = createClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('supplier_contacts').insert({
      supplier_id: supplierId,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      note: form.note.trim() || null,
    })
    setSaving(false)
    if (error) { alert('שמירת איש הקשר נכשלה'); return }
    setForm({ name: '', phone: '', note: '' })
    setAdding(false)
    onChange()
  }

  async function remove(c: SupplierContact) {
    if (!confirm(`למחוק את איש הקשר "${c.name}"?`)) return
    await supabase.from('supplier_contacts').delete().eq('id', c.id)
    onChange()
  }

  return (
    <div className="space-y-1.5 pt-1">
      {contacts.map((c) => (
        <div key={c.id} className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{c.name}</span>
          {c.note && <span className="text-xs text-gray-400">({c.note})</span>}
          {c.phone && (
            <>
              <span dir="ltr">{c.phone}</span>
              <a href={`tel:${c.phone}`} className="inline-flex items-center justify-center p-1 rounded-full bg-green-100 text-green-600 hover:bg-green-200" title="חייג">
                <Phone className="h-3.5 w-3.5" />
              </a>
              <CopyButton value={c.phone} title="העתק טלפון" />
            </>
          )}
          <button type="button" onClick={() => remove(c)} className="p-1 text-gray-300 hover:text-red-600" title="מחק איש קשר">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="space-y-1.5 rounded-md border p-2 bg-gray-50">
          <Input className="h-8" placeholder="שם איש הקשר *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input className="h-8" placeholder="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value) })} dir="ltr" inputMode="numeric" />
          <Input className="h-8" placeholder="תפקיד / הערה (רשות)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>ביטול</Button>
            <Button size="sm" onClick={add} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
          <Plus className="h-3 w-3" />הוסף איש קשר
        </button>
      )}
    </div>
  )
}
