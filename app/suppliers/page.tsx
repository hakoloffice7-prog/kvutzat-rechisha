'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Truck, Loader2, Trash2, Phone, Mail, Edit2 } from 'lucide-react'

type Supplier = {
  id: string
  name: string
  phone: string
  email: string
  category_id: string
  categories: { name: string } | null
}

type Category = { id: string; name: string }

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    email: '',
    category_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: suppliersData }, { data: categoriesData }] = await Promise.all([
      supabase
        .from('suppliers')
        .select('*, categories(name)')
        .order('name'),
      supabase.from('categories').select('*').order('name'),
    ])

    if (suppliersData) setSuppliers(suppliersData)
    if (categoriesData) setCategories(categoriesData)
    setLoading(false)
  }

  async function addSupplier() {
    if (!newSupplier.name.trim()) return
    setSaving(true)

    const { error } = await supabase.from('suppliers').insert({
      name: newSupplier.name.trim(),
      phone: newSupplier.phone.trim(),
      email: newSupplier.email.trim(),
      category_id: newSupplier.category_id || null,
    })

    if (!error) {
      setNewSupplier({ name: '', phone: '', email: '', category_id: '' })
      setDialogOpen(false)
      fetchData()
    }
    setSaving(false)
  }

  async function saveEditSupplier() {
    if (!editingSupplier || !editingSupplier.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('suppliers')
      .update({
        name: editingSupplier.name.trim(),
        phone: editingSupplier.phone.trim(),
        email: editingSupplier.email.trim(),
        category_id: editingSupplier.category_id || null,
      })
      .eq('id', editingSupplier.id)
    if (!error) {
      setEditDialogOpen(false)
      setEditingSupplier(null)
      fetchData()
    }
    setSaving(false)
  }

  async function deleteSupplier(id: string) {
    if (!confirm('האם למחוק ספק זה?')) return
    await supabase.from('suppliers').delete().eq('id', id)
    fetchData()
  }

  const filteredSuppliers = filterCategory
    ? suppliers.filter(s => s.category_id === filterCategory)
    : suppliers

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
          <h1 className="text-3xl font-bold text-gray-900">ספקים</h1>
          <p className="text-gray-500 mt-1">ניהול ספקים וקשר עם קטגוריות</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              הוסף ספק
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הוספת ספק חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>שם הספק *</Label>
                <Input
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  placeholder="שם החברה / ספק"
                />
              </div>
              <div className="space-y-2">
                <Label>קטגוריה</Label>
                <Select
                  value={newSupplier.category_id}
                  onChange={(e) => setNewSupplier({ ...newSupplier, category_id: e.target.value })}
                >
                  <option value="">בחר קטגוריה</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="050-0000000"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  placeholder="supplier@example.com"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
                <Button onClick={addSupplier} disabled={saving || !newSupplier.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף ספק'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Label className="shrink-0">סנן לפי קטגוריה:</Label>
        <Select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="w-48"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </Select>
        <span className="text-sm text-gray-500">{filteredSuppliers.length} ספקים</span>
      </div>

      {filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Truck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין ספקים עדיין</p>
            <p className="text-gray-400 text-sm mt-1">הוסף ספק ראשון</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{supplier.name}</h3>
                    {supplier.categories && (
                      <Badge variant="secondary" className="mt-1">
                        {supplier.categories.name}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingSupplier({ ...supplier })
                      setEditDialogOpen(true)
                    }}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSupplier(supplier.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {supplier.phone && (
                    <a
                      href={`tel:${supplier.phone}`}
                      className="text-sm text-gray-500 flex items-center gap-2 hover:text-blue-600"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span dir="ltr">{supplier.phone}</span>
                    </a>
                  )}
                  {supplier.email && (
                    <a
                      href={`mailto:${supplier.email}`}
                      className="text-sm text-gray-500 flex items-center gap-2 hover:text-blue-600"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span dir="ltr">{supplier.email}</span>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Supplier Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת ספק</DialogTitle>
          </DialogHeader>
          {editingSupplier && (
            <div className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label>שם הספק *</Label>
                <Input
                  value={editingSupplier.name}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                  placeholder="שם החברה / ספק"
                />
              </div>
              <div className="space-y-2">
                <Label>קטגוריה</Label>
                <Select
                  value={editingSupplier.category_id || ''}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, category_id: e.target.value })}
                >
                  <option value="">בחר קטגוריה</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input
                  value={editingSupplier.phone || ''}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  placeholder="050-0000000"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input
                  type="email"
                  value={editingSupplier.email || ''}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  placeholder="supplier@example.com"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>ביטול</Button>
                <Button onClick={saveEditSupplier} disabled={saving || !editingSupplier.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
