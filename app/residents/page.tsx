'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users, Loader2, Pencil, Trash2 } from 'lucide-react'

type City = {
  id: string
  name: string
}

type Project = {
  id: string
  city_id: string
  name: string
  address: string
}

type Resident = {
  id: string
  project_id: string
  name: string
  address: string
  phone: string
}

export default function ResidentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [selectedCityId, setSelectedCityId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingCities, setLoadingCities] = useState(true)
  const [loadingResidents, setLoadingResidents] = useState(false)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newResident, setNewResident] = useState({ name: '', address: '', phone: '' })
  const [editingResident, setEditingResident] = useState<Resident | null>(null)

  useEffect(() => {
    fetchCities()
  }, [])

  useEffect(() => {
    if (selectedCityId) {
      fetchProjects(selectedCityId)
      setSelectedProjectId('')
      setResidents([])
    } else {
      setProjects([])
      setSelectedProjectId('')
      setResidents([])
    }
  }, [selectedCityId])

  useEffect(() => {
    if (selectedProjectId) {
      fetchResidents(selectedProjectId)
    } else {
      setResidents([])
    }
  }, [selectedProjectId])

  async function fetchCities() {
    setLoadingCities(true)
    const { data } = await supabase.from('cities').select('id, name').order('name')
    setCities(data || [])
    setLoadingCities(false)
  }

  async function fetchProjects(cityId: string) {
    const { data } = await supabase
      .from('projects')
      .select('id, city_id, name, address')
      .eq('city_id', cityId)
      .order('name')
    setProjects(data || [])
  }

  async function fetchResidents(projectId: string) {
    setLoadingResidents(true)
    const { data } = await supabase
      .from('residents')
      .select('id, project_id, name, address, phone')
      .eq('project_id', projectId)
      .order('name')
    setResidents(data || [])
    setLoadingResidents(false)
  }

  async function addResident() {
    if (!newResident.name.trim() || !selectedProjectId) return
    setSaving(true)
    const { error } = await supabase.from('residents').insert({
      project_id: selectedProjectId,
      name: newResident.name.trim(),
      address: newResident.address.trim(),
      phone: newResident.phone.trim(),
    })
    if (!error) {
      setNewResident({ name: '', address: '', phone: '' })
      setAddDialogOpen(false)
      fetchResidents(selectedProjectId)
    }
    setSaving(false)
  }

  async function saveEditResident() {
    if (!editingResident || !editingResident.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('residents')
      .update({
        name: editingResident.name.trim(),
        address: editingResident.address.trim(),
        phone: editingResident.phone.trim(),
      })
      .eq('id', editingResident.id)
    if (!error) {
      setEditDialogOpen(false)
      setEditingResident(null)
      fetchResidents(selectedProjectId)
    }
    setSaving(false)
  }

  async function deleteResident(id: string) {
    if (!confirm('האם למחוק דייר זה?')) return
    await supabase.from('residents').delete().eq('id', id)
    fetchResidents(selectedProjectId)
  }

  const filteredProjects = projects.filter((p) => p.city_id === selectedCityId)

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">דיירים</h1>
          <p className="text-gray-500 mt-1">ניהול דיירים לפי פרויקט</p>
        </div>
        {selectedProjectId && (
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 ml-2" />
            הוסף דייר
          </Button>
        )}
      </div>

      {/* Dropdowns */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="citySelect">בחר עיר</Label>
              {loadingCities ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  טוען ערים...
                </div>
              ) : (
                <select
                  id="citySelect"
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- בחר עיר --</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="projectSelect">בחר פרויקט</Label>
              <select
                id="projectSelect"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!selectedCityId}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר פרויקט --</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Residents table */}
      {!selectedProjectId ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">בחר פרויקט לצפייה בדיירים</p>
          </CardContent>
        </Card>
      ) : loadingResidents ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : residents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין דיירים בפרויקט זה</p>
            <p className="text-gray-400 text-sm mt-1">לחץ על "הוסף דייר" להוספת דייר ראשון</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              דיירים ({residents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-right py-3 px-4 font-medium">שם</th>
                    <th className="text-right py-3 px-4 font-medium">כתובת</th>
                    <th className="text-right py-3 px-4 font-medium">טלפון</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map((resident) => (
                    <tr key={resident.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          onClick={() => router.push('/residents/' + resident.id)}
                          className="font-medium text-blue-700 hover:underline text-right"
                        >
                          {resident.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{resident.address || '—'}</td>
                      <td className="py-3 px-4 text-gray-600">{resident.phone || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingResident({ ...resident })
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteResident(resident.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Resident Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת דייר חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div className="space-y-2">
              <Label htmlFor="residentName">שם הדייר</Label>
              <Input
                id="residentName"
                value={newResident.name}
                onChange={(e) => setNewResident({ ...newResident, name: e.target.value })}
                placeholder="לדוגמה: ישראל ישראלי"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentAddress">כתובת</Label>
              <Input
                id="residentAddress"
                value={newResident.address}
                onChange={(e) => setNewResident({ ...newResident, address: e.target.value })}
                placeholder="לדוגמה: רחוב הרצל 1, דירה 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residentPhone">טלפון</Label>
              <Input
                id="residentPhone"
                value={newResident.phone}
                onChange={(e) => setNewResident({ ...newResident, phone: e.target.value })}
                placeholder="לדוגמה: 050-1234567"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>ביטול</Button>
              <Button onClick={addResident} disabled={saving || !newResident.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף דייר'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Resident Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת דייר</DialogTitle>
          </DialogHeader>
          {editingResident && (
            <div className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label htmlFor="editName">שם הדייר</Label>
                <Input
                  id="editName"
                  value={editingResident.name}
                  onChange={(e) => setEditingResident({ ...editingResident, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editAddress">כתובת</Label>
                <Input
                  id="editAddress"
                  value={editingResident.address}
                  onChange={(e) => setEditingResident({ ...editingResident, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone">טלפון</Label>
                <Input
                  id="editPhone"
                  value={editingResident.phone}
                  onChange={(e) => setEditingResident({ ...editingResident, phone: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>ביטול</Button>
                <Button onClick={saveEditResident} disabled={saving || !editingResident.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור שינויים'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
