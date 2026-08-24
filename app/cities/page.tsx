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
import { Plus, Building2, ChevronLeft, Loader2, Trash2, FolderOpen, Edit2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/components/RoleProvider'

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
  const isAdmin = useIsAdmin()
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [cityDialogOpen, setCityDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [selectedCityId, setSelectedCityId] = useState('')
  const [newCityName, setNewCityName] = useState('')
  const [newProject, setNewProject] = useState({ name: '', address: '' })
  const [saving, setSaving] = useState(false)

  // Edit dialogs
  const [editCityDialogOpen, setEditCityDialogOpen] = useState(false)
  const [editingCity, setEditingCity] = useState<{ id: string; name: string } | null>(null)
  const [editProjectDialogOpen, setEditProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; address: string } | null>(null)

  // Delete confirmation dialogs
  const [deleteCityConfirm, setDeleteCityConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  // Error dialog when deletion is blocked
  const [blockError, setBlockError] = useState<{ open: boolean; message: string }>({ open: false, message: '' })

  const supabase = createClient()
  const router = useRouter()

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
      router.refresh()
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
      router.refresh()
    }
    setSaving(false)
  }

  async function saveEditCity() {
    if (!editingCity || !editingCity.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('cities')
      .update({ name: editingCity.name.trim() })
      .eq('id', editingCity.id)
    if (!error) {
      setEditCityDialogOpen(false)
      setEditingCity(null)
      fetchCities()
      router.refresh()
    }
    setSaving(false)
  }

  async function saveEditProject() {
    if (!editingProject || !editingProject.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('projects')
      .update({
        name: editingProject.name.trim(),
        address: editingProject.address.trim(),
      })
      .eq('id', editingProject.id)
    if (!error) {
      setEditProjectDialogOpen(false)
      setEditingProject(null)
      fetchCities()
      router.refresh()
    }
    setSaving(false)
  }

  function openDeleteCity(city: City) {
    if ((city.projects?.length || 0) > 0) {
      setBlockError({ open: true, message: 'לא ניתן למחוק עיר שיש בה פרויקטים. יש למחוק את כל הפרויקטים תחילה.' })
      return
    }
    setDeleteCityConfirm({ open: true, id: city.id, name: city.name })
  }

  async function confirmDeleteCity() {
    await supabase.from('cities').delete().eq('id', deleteCityConfirm.id)
    setDeleteCityConfirm({ open: false, id: '', name: '' })
    fetchCities()
    router.refresh()
  }

  async function openDeleteProject(project: Project) {
    const { count } = await supabase
      .from('residents')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)

    if ((count || 0) > 0) {
      setBlockError({ open: true, message: 'לא ניתן למחוק פרויקט שיש בו דיירים. יש למחוק את כל הדיירים תחילה.' })
      return
    }
    setDeleteProjectConfirm({ open: true, id: project.id, name: project.name })
  }

  async function confirmDeleteProject() {
    await supabase.from('projects').delete().eq('id', deleteProjectConfirm.id)
    setDeleteProjectConfirm({ open: false, id: '', name: '' })
    fetchCities()
    router.refresh()
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

        {isAdmin && (
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
        )}
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
                    {isAdmin && (
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
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingCity({ id: city.id, name: city.name })
                            setEditCityDialogOpen(true)
                          }}
                          className="text-blue-400 hover:text-blue-600"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteCity(city)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
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
                            {isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingProject({ id: project.id, name: project.name, address: project.address || '' })
                                    setEditProjectDialogOpen(true)
                                  }}
                                  className="text-blue-400 hover:text-blue-600"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openDeleteProject(project)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
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
      <Dialog open={isAdmin && projectDialogOpen} onOpenChange={setProjectDialogOpen}>
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

      {/* Edit City Dialog */}
      <Dialog open={isAdmin && editCityDialogOpen} onOpenChange={setEditCityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת עיר</DialogTitle>
          </DialogHeader>
          {editingCity && (
            <div className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label>שם העיר</Label>
                <Input
                  value={editingCity.name}
                  onChange={(e) => setEditingCity({ ...editingCity, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditCity()}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditCityDialogOpen(false)}>ביטול</Button>
                <Button onClick={saveEditCity} disabled={saving || !editingCity.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={isAdmin && editProjectDialogOpen} onOpenChange={setEditProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת פרויקט</DialogTitle>
          </DialogHeader>
          {editingProject && (
            <div className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label>שם הפרויקט</Label>
                <Input
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>כתובת</Label>
                <Input
                  value={editingProject.address}
                  onChange={(e) => setEditingProject({ ...editingProject, address: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditProjectDialogOpen(false)}>ביטול</Button>
                <Button onClick={saveEditProject} disabled={saving || !editingProject.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete City Confirmation */}
      <Dialog open={isAdmin && deleteCityConfirm.open} onOpenChange={(open) => setDeleteCityConfirm(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת עיר</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק את העיר <strong>{deleteCityConfirm.name}</strong>?</p>
            <p className="text-sm text-red-600">פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteCityConfirm({ open: false, id: '', name: '' })}>ביטול</Button>
              <Button variant="destructive" onClick={confirmDeleteCity}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation */}
      <Dialog open={isAdmin && deleteProjectConfirm.open} onOpenChange={(open) => setDeleteProjectConfirm(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת פרויקט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק את הפרויקט <strong>{deleteProjectConfirm.name}</strong>?</p>
            <p className="text-sm text-red-600">פעולה זו אינה ניתנת לביטול.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteProjectConfirm({ open: false, id: '', name: '' })}>ביטול</Button>
              <Button variant="destructive" onClick={confirmDeleteProject}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Error Dialog */}
      <Dialog open={blockError.open} onOpenChange={(open) => setBlockError(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>לא ניתן למחוק</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">{blockError.message}</p>
            <div className="flex justify-end">
              <Button onClick={() => setBlockError({ open: false, message: '' })}>הבנתי</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
