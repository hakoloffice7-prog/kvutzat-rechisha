'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2, Trash2, Edit2, ShieldCheck, User as UserIcon } from 'lucide-react'
import { createUser, updateUserRole, updateUserFullName, updateUserAssignments, deleteUser } from './actions'

// חשבון מנהל המערכת - לא ניתן להוריד אותו מ-admin (גם ה-DB חוסם את זה)
const PROTECTED_OWNER_EMAIL = 'hakol.office7@gmail.com'

type Project = { id: string; name: string }
type City = { id: string; name: string; projects: Project[] }

type UserRow = {
  id: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'user'
  created_at: string
  user_city_access: { city_id: string; cities: { id: string; name: string } | null }[]
  user_project_access: { project_id: string; projects: { id: string; name: string; city_id: string } | null }[]
}

type Assignments = { role: 'admin' | 'user'; cityIds: Set<string>; projectIds: Set<string> }

function AccessCheckboxList({
  cities,
  assignments,
  onChange,
}: {
  cities: City[]
  assignments: Assignments
  onChange: (next: Assignments) => void
}) {
  function toggleCity(cityId: string) {
    const cityIds = new Set(assignments.cityIds)
    cityIds.has(cityId) ? cityIds.delete(cityId) : cityIds.add(cityId)
    onChange({ ...assignments, cityIds })
  }
  function toggleProject(projectId: string) {
    const projectIds = new Set(assignments.projectIds)
    projectIds.has(projectId) ? projectIds.delete(projectId) : projectIds.add(projectId)
    onChange({ ...assignments, projectIds })
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto border rounded-md p-3">
      {cities.length === 0 && <p className="text-sm text-gray-400">אין ערים במערכת</p>}
      {cities.map((city) => (
        <div key={city.id}>
          <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={assignments.cityIds.has(city.id)}
              onChange={() => toggleCity(city.id)}
            />
            {city.name}
            <span className="text-xs text-gray-400 font-normal">(כל העיר)</span>
          </label>
          {city.projects.length > 0 && (
            <div className="mr-6 mt-1 space-y-1">
              {city.projects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={assignments.cityIds.has(city.id)}
                    checked={assignments.cityIds.has(city.id) || assignments.projectIds.has(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  {project.name}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function UsersManager({
  initialUsers,
  cities,
  currentUserId,
}: {
  initialUsers: UserRow[]
  cities: City[]
  currentUserId: string
}) {
  const router = useRouter()
  const users = initialUsers
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newAssignments, setNewAssignments] = useState<Assignments>({ role: 'user', cityIds: new Set(), projectIds: new Set() })

  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editAssignments, setEditAssignments] = useState<Assignments>({ role: 'user', cityIds: new Set(), projectIds: new Set() })
  const [saving, setSaving] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; email: string }>({ open: false, id: '', email: '' })
  const [deleting, setDeleting] = useState(false)

  function resetCreateForm() {
    setNewEmail('')
    setNewPassword('')
    setNewFullName('')
    setNewAssignments({ role: 'user', cityIds: new Set(), projectIds: new Set() })
  }

  async function refresh() {
    router.refresh()
  }

  async function handleCreate() {
    if (!newEmail.trim() || !newPassword.trim()) return
    setCreating(true)
    setError('')
    try {
      await createUser({
        email: newEmail.trim(),
        password: newPassword,
        fullName: newFullName,
        role: newAssignments.role,
        cityIds: Array.from(newAssignments.cityIds),
        projectIds: Array.from(newAssignments.projectIds),
      })
      setCreateOpen(false)
      resetCreateForm()
      await refresh()
    } catch (e: any) {
      setError(e.message || 'שגיאה ביצירת המשתמש')
    }
    setCreating(false)
  }

  function openEdit(user: UserRow) {
    setEditUser(user)
    setEditFullName(user.full_name || '')
    setEditAssignments({
      role: user.role,
      cityIds: new Set(user.user_city_access.map((a) => a.city_id)),
      projectIds: new Set(user.user_project_access.map((a) => a.project_id)),
    })
  }

  async function handleSaveEdit() {
    if (!editUser) return
    setSaving(true)
    setError('')
    try {
      await updateUserFullName(editUser.id, editFullName)
      await updateUserRole(editUser.id, editAssignments.role)
      await updateUserAssignments(editUser.id, Array.from(editAssignments.cityIds), Array.from(editAssignments.projectIds))
      setEditUser(null)
      await refresh()
    } catch (e: any) {
      setError(e.message || 'שגיאה בשמירת השינויים')
    }
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteUser(deleteConfirm.id)
      setDeleteConfirm({ open: false, id: '', email: '' })
      await refresh()
    } catch (e: any) {
      setError(e.message || 'שגיאה במחיקת המשתמש')
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm() }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              הוסף משתמש
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הוספת משתמש חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newFullName">שם משתמש (לתצוגה במערכת)</Label>
                <Input id="newFullName" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="לדוגמה: דני כהן" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">אימייל</Label>
                <Input id="newEmail" type="email" dir="ltr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">סיסמה</Label>
                <Input id="newPassword" type="text" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>תפקיד</Label>
                <Select
                  value={newAssignments.role}
                  onChange={(e) => setNewAssignments({ ...newAssignments, role: e.target.value as 'admin' | 'user' })}
                >
                  <option value="user">משתמש</option>
                  <option value="admin">מנהל</option>
                </Select>
              </div>
              {newAssignments.role === 'user' && (
                <div className="space-y-2">
                  <Label>ערים / פרויקטים משויכים</Label>
                  <AccessCheckboxList cities={cities} assignments={newAssignments} onChange={setNewAssignments} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>ביטול</Button>
                <Button onClick={handleCreate} disabled={creating || !newEmail.trim() || !newPassword.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'צור משתמש'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {users.length === 0 && (
              <p className="text-gray-500 text-center py-12">אין משתמשים עדיין</p>
            )}
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{user.full_name || user.email}</p>
                    {user.full_name && <p className="text-xs text-gray-400 truncate" dir="ltr">{user.email}</p>}
                    <Badge variant={user.role === 'admin' ? 'info' : 'secondary'}>
                      {user.role === 'admin' ? (
                        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> מנהל</span>
                      ) : (
                        <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> משתמש</span>
                      )}
                    </Badge>
                  </div>
                  {user.role === 'user' && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {user.user_city_access.map((a) => (
                        a.cities && <Badge key={a.city_id} variant="outline">{a.cities.name} (כל העיר)</Badge>
                      ))}
                      {user.user_project_access.map((a) => (
                        a.projects && <Badge key={a.project_id} variant="outline">{a.projects.name}</Badge>
                      ))}
                      {user.user_city_access.length === 0 && user.user_project_access.length === 0 && (
                        <span className="text-xs text-gray-400">אין שיוך - לא יראה נתונים</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(user)} className="text-blue-400 hover:text-blue-600">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={user.id === currentUserId}
                    onClick={() => setDeleteConfirm({ open: true, id: user.id, email: user.email || '' })}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת {editUser?.full_name || editUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">שם משתמש (לתצוגה במערכת)</Label>
              <Input id="editFullName" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} placeholder="לדוגמה: דני כהן" />
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              {editUser?.email === PROTECTED_OWNER_EMAIL ? (
                <div>
                  <Badge variant="info">מנהל (קבוע)</Badge>
                  <p className="text-xs text-gray-400 mt-1">חשבון מנהל המערכת - לא ניתן להוריד אותו מתפקיד admin</p>
                </div>
              ) : (
                <Select
                  value={editAssignments.role}
                  onChange={(e) => setEditAssignments({ ...editAssignments, role: e.target.value as 'admin' | 'user' })}
                >
                  <option value="user">משתמש</option>
                  <option value="admin">מנהל</option>
                </Select>
              )}
            </div>
            {editAssignments.role === 'user' && (
              <div className="space-y-2">
                <Label>ערים / פרויקטים משויכים</Label>
                <AccessCheckboxList cities={cities} assignments={editAssignments} onChange={setEditAssignments} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditUser(null)}>ביטול</Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, id: '', email: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת משתמש</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            למחוק את המשתמש <strong dir="ltr">{deleteConfirm.email}</strong>? הפעולה בלתי הפיכה.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, id: '', email: '' })}>ביטול</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
