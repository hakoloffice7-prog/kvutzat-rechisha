'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users, ChevronLeft, Loader2, Trash2, Phone, MapPin, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { STATUS_LABELS, STATUS_COLORS, STATUS_ORDER } from '@/lib/utils'

type Project = {
  id: string
  name: string
  address: string
  city_id: string
  cities: { name: string }
}

type Resident = {
  id: string
  name: string
  address: string
  phone: string
  orders: { status: string }[]
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [residents, setResidents] = useState<Resident[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [projectId])

  async function fetchData() {
    setLoading(true)
    const [{ data: projectData }, { data: residentsData }] = await Promise.all([
      supabase
        .from('projects')
        .select('*, cities(name)')
        .eq('id', projectId)
        .single(),
      supabase
        .from('residents')
        .select('*, orders(status)')
        .eq('project_id', projectId)
        .order('name'),
    ])

    if (projectData) setProject(projectData)
    if (residentsData) setResidents(residentsData)
    setLoading(false)
  }

  function goToAddResident() {
    if (!project) return
    try {
      sessionStorage.setItem('residents-filter', JSON.stringify({
        cityId: project.city_id,
        projectId: projectId,
      }))
      sessionStorage.setItem('residents-pending-add', '1')
    } catch {}
    router.push('/residents')
  }

  function openDeleteConfirm(resident: Resident) {
    setDeleteConfirm({ open: true, id: resident.id, name: resident.name })
  }

  async function confirmDeleteResident() {
    await supabase.from('residents').delete().eq('id', deleteConfirm.id)
    setDeleteConfirm({ open: false, id: '', name: '' })
    fetchData()
    router.refresh()
  }

  const statusPriority: Record<string, number> = {
    ordered: 7, quoted: 6, measured: 5, considering: 4, interested: 3, lead: 2, cancelled: 1,
  }

  const getResidentStatus = (orders: { status: string }[]) => {
    if (!orders || orders.length === 0) return null
    const highestStatus = orders.reduce((best, order) => {
      return (statusPriority[order.status as keyof typeof statusPriority] || 0) >
        (statusPriority[best?.status as keyof typeof statusPriority] || 0)
        ? order
        : best
    }, orders[0])
    return highestStatus?.status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!project) {
    return <div className="text-center py-12 text-gray-500">פרויקט לא נמצא</div>
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/cities" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          ערים
        </Link>
        <span>/</span>
        <span>{project.cities?.name}</span>
        <span>/</span>
        <span className="text-gray-900 font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
          {project.address && (
            <p className="text-gray-500 mt-1 flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {project.address}
            </p>
          )}
          <p className="text-sm text-gray-400 mt-1">{residents.length} דיירים</p>
        </div>

        <Button onClick={goToAddResident}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף דייר
        </Button>
      </div>

      {/* Residents List */}
      {residents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין דיירים עדיין</p>
            <p className="text-gray-400 text-sm mt-1">לחץ על "הוסף דייר" להוספת דייר ראשון</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {residents.map((resident) => {
            const topStatus = getResidentStatus(resident.orders)
            return (
              <Card key={resident.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/residents/${resident.id}`} className="flex-1">
                      <h3 className="font-semibold text-gray-900 hover:text-blue-700 text-lg">
                        {resident.name}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Link href={`/residents/${resident.id}`}>
                        <Button variant="ghost" size="sm">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteConfirm(resident)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {resident.address && (
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {resident.address}
                      </p>
                    )}
                    {resident.phone && (
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span dir="ltr">{resident.phone}</span>
                        <a href={`tel:${resident.phone}`} className="inline-flex items-center justify-center p-1 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors" title="חייג">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {resident.orders?.length || 0} הזמנות
                    </span>
                    {topStatus && (
                      <Badge variant={STATUS_COLORS[topStatus] as any}>
                        {STATUS_LABELS[topStatus]}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Resident Confirmation */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת דייר</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <p className="text-gray-700">האם אתה בטוח שברצונך למחוק את <strong>{deleteConfirm.name}</strong>?</p>
            <p className="text-sm text-red-600">פעולה זו תמחק את כל ההזמנות של הדייר ולא ניתן לבטלה.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, id: '', name: '' })}>ביטול</Button>
              <Button variant="destructive" onClick={confirmDeleteResident}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
