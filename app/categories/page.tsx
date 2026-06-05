'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Plus, Package, Loader2, Trash2 } from 'lucide-react'

type Category = {
  id: string
  name: string
  created_at: string
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
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
    setLoading(false)
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
    if (!confirm('האם למחוק קטגוריה זו? הדבר ישפיע על הזמנות קיימות.')) return
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
                    <span className="font-medium text-gray-900">{category.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCategory(category.id)}
                    className="text-red-400 hover:text-red-600 h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
