'use client'

import { useState, useEffect } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Building2, ChevronLeft, Loader2, Trash2, FolderOpen } from 'lucide-react'
import Link from 'next/link'

type City = {
  id: string
  name: string
  created_at: string
  projects?: Project[]
}

type Project = {
  id: string
  city_id: string
  name: string
  address: string
  created_at: string
}

export default function CitiesPage() {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [cityDialogOpen, setCityDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [selectedCityId, setSelectedCityId] = useState('')
  const [newCityName, setNewCityName] = useState('')
  const [newProject, setNewProject] = useState({ name: '', address: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchCities()
  }, [])

  async function fetchCities() {
    setLoading(true)
    const { data, error } = await supabase
      .from('cities')
      .select(`
        *,
        projects(*)
      `)
      .order('name')

    if (!error && data) {
      setCities(data)
    }
    setLoading(false)
  }

  async function addCity() {
    if (!newCityName.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('cities')
      .insert({ name: newCityName.trim() })

    if (!error) {
      setNewCityName('')
      setCityDialogOpen(false)
      fetchCities()
    }
    setSaving(false)
  }

  async function addProject() {
    if (!newProject.name.trim() || !selectedCityId) return
    setSaving(true)

    const { error } = await supabase
      .from('projects')
      .insert({
        city_id: selectedCityId,
        name: newProject.name.trim(),
        address: newProject.address.trim(),
      })

    if (!error) {
      setNewProject({ name: '', address: '' })
      setProjectDialogOpen(false)
      fetchCities()
    }
    setSaving(false)
  }

  async function deleteCity(cityId: string) {
    if (!confirm('האם למחוק עיר זו? כל הפרויקטים והדיירים שבה יימחקו.')) return

    await supabase.from('cities').delete().eq('id', cityId)
    fetchCities()
  }

  async function deleteProject(projectId: string) {
    if (!confirm('האם למחוק פרויקט זה? כל הדיירים וההזמנות שבו יימחקו.')) return

    await supabase.from('projects').delete().eq('id', projectId)
    fetchCities()
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
          <h1 className="text-3xl font-bold text-gray-900">ערים ופרויקטים</h1>
          <p className="text-gray-500 mt-1">ניהול ערים ופרויקטי בנייה</p>
        </div>

        <Dialog open={cityDialogOpen} onOpenChange={setCityDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              הוסף עיר
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הוספת עיר חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cityName">שם העיר</Label>
                <Input
                  id="cityName"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="לדוגמה: תל אביב"
                  onKeyDown={(e) => e.key === 'Enter' && addCity()}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setCityDialogOpen(false)}>ביטול</Button>
                <Button onClick={addCity} disabled={saving || !newCityName.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף עיר'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {cities.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין ערים עדיין</p>
            <p className="text-gray-400 text-sm mt-1">הוסף עיר ראשונה כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cities.map((city) => (
            <Card key={city.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-xl">{city.name}</CardTitle>
                    <span className="text-sm text-gray-500">
                      ({city.projects?.length || 0} פרויקטים)
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCityId(city.id)
                        setProjectDialogOpen(true)
                      }}
                    >
                      <Plus className="h-4 w-4 ml-1" />
                      הוסף פרויקט
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCity(city.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {city.projects && city.projects.length > 0 && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {city.projects.map((project) => (
                      <div
                        key={project.id}
                        className="border rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <Link href={`/projects/${project.id}`} className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <FolderOpen className="h-4 w-4 text-blue-600" />
                              <p className="font-medium text-gray-900 hover:text-blue-700">
                                {project.name}
                              </p>
                            </div>
                            {project.address && (
                              <p className="text-sm text-gray-500">{project.address}</p>
                            )}
                          </Link>
                          <div className="flex items-center gap-1 mr-2">
                            <Link href={`/projects/${project.id}`}>
                              <Button variant="ghost" size="sm">
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteProject(project.id)}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת פרויקט חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>עיר</Label>
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                {cities.find(c => c.id === selectedCityId)?.name || ''}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectName">שם הפרויקט</Label>
              <Input
                id="projectName"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="לדוגמה: מגדל השלום"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectAddress">כתובת</Label>
              <Input
                id="projectAddress"
                value={newProject.address}
                onChange={(e) => setNewProject({ ...newProject, address: e.target.value })}
                placeholder="לדוגמה: רחוב הרצל 1"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>ביטול</Button>
              <Button onClick={addProject} disabled={saving || !newProject.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף פרויקט'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
