'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Loader2, ArrowRight, Phone, Mail, Save, X, Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  formatCurrency,
  getDebtStatus,
  DEBT_STATUS_LABELS,
  DEBT_STATUS_COLORS,
} from '@/lib/utils'

type Supplier = {
  id: string
  name: string
  phone: string | null
  phone2: string | null
  email: string | null
  advance_amount: number | null
  advance_note: string | null
}

type Ledger = {
  id?: string
  supplier_id: string
  project_id: string
  commission_paid: number
  rep_name: string
  rep_percent: number
  rep_paid: number
}

type ProjectGroup = {
  projectId: string
  projectName: string
  totalCollected: number
  commissionOwed: number
  paidOrderCount: number
  ledger: Ledger
}

type ProjectOption = { id: string; name: string; cityName: string }

export default function SupplierPaymentsPage() {
  const params = useParams()
  const supplierId = params.id as string

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addProjectId, setAddProjectId] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    commission_paid: '',
    rep_name: '',
    rep_percent: '1.25',
    rep_paid: '',
  })

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [supplierId])

  async function fetchData() {
    setLoading(true)
    const [{ data: supplierData }, { data: ordersData }, { data: ledgerData }, { data: projectsData }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).single(),
      supabase
        .from('orders')
        .select('id, total_price, payment_status, order_items(customer_price, supplier_price), residents(projects(id, name))')
        .eq('supplier_id', supplierId),
      supabase.from('supplier_project_ledger').select('*').eq('supplier_id', supplierId),
      supabase.from('projects').select('id, name, cities(name)').order('name'),
    ])

    if (supplierData) setSupplier(supplierData)

    const projectNameById = new Map<string, string>()
    const projectOptions: ProjectOption[] = (projectsData || []).map((p: any) => {
      projectNameById.set(p.id, p.name)
      return { id: p.id, name: p.name, cityName: p.cities?.name || '' }
    })
    setAllProjects(projectOptions)

    const ledgerByProject = new Map<string, Ledger>()
    ;(ledgerData || []).forEach((l: any) => ledgerByProject.set(l.project_id, l))

    const byProject = new Map<string, ProjectGroup>()

    function ensureGroup(projectId: string, projectName: string) {
      if (!byProject.has(projectId)) {
        const existingLedger = ledgerByProject.get(projectId)
        byProject.set(projectId, {
          projectId,
          projectName,
          totalCollected: 0,
          commissionOwed: 0,
          paidOrderCount: 0,
          ledger: existingLedger || {
            supplier_id: supplierId,
            project_id: projectId,
            commission_paid: 0,
            rep_name: '',
            rep_percent: 1.25,
            rep_paid: 0,
          },
        })
      }
      return byProject.get(projectId)!
    }

    ;(ordersData || []).forEach((order: any) => {
      const project = order.residents?.projects
      if (!project) return
      const group = ensureGroup(project.id, project.name)
      if (order.payment_status === 'paid_full') {
        group.totalCollected += order.total_price || 0
        group.paidOrderCount += 1
        const itemsMargin = (order.order_items || []).reduce(
          (sum: number, item: any) => sum + ((item.customer_price || 0) - (item.supplier_price || 0)),
          0
        )
        group.commissionOwed += itemsMargin
      }
    })

    // פרויקטים שנוספו ידנית לספק (עדיין ללא הזמנות בפועל)
    ;(ledgerData || []).forEach((l: any) => {
      const projectName = projectNameById.get(l.project_id)
      if (projectName) ensureGroup(l.project_id, projectName)
    })

    setGroups(Array.from(byProject.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, 'he')))
    setLoading(false)
  }

  async function addProjectToSupplier() {
    if (!addProjectId) return
    setAddingProject(true)
    const { error } = await supabase.from('supplier_project_ledger').upsert(
      {
        supplier_id: supplierId,
        project_id: addProjectId,
        commission_paid: 0,
        rep_name: '',
        rep_percent: 1.25,
        rep_paid: 0,
      },
      { onConflict: 'supplier_id,project_id' }
    )
    if (!error) {
      setAddProjectId('')
      fetchData()
    }
    setAddingProject(false)
  }

  async function removeProjectFromSupplier(projectId: string) {
    if (!confirm('להסיר את הפרויקט מרשימת התשלומים של הספק?')) return
    await supabase.from('supplier_project_ledger').delete().eq('supplier_id', supplierId).eq('project_id', projectId)
    fetchData()
  }

  function startEdit(group: ProjectGroup) {
    setEditingProjectId(group.projectId)
    setEditForm({
      commission_paid: String(group.ledger.commission_paid || ''),
      rep_name: group.ledger.rep_name || '',
      rep_percent: String(group.ledger.rep_percent ?? 1.25),
      rep_paid: String(group.ledger.rep_paid || ''),
    })
  }

  async function saveLedger(group: ProjectGroup) {
    setSaving(true)
    const { error } = await supabase
      .from('supplier_project_ledger')
      .upsert(
        {
          supplier_id: supplierId,
          project_id: group.projectId,
          commission_paid: parseFloat(editForm.commission_paid) || 0,
          rep_name: editForm.rep_name.trim(),
          rep_percent: parseFloat(editForm.rep_percent) || 0,
          rep_paid: parseFloat(editForm.rep_paid) || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'supplier_id,project_id' }
      )

    if (!error) {
      setEditingProjectId(null)
      fetchData()
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!supplier) {
    return <div className="text-center py-12 text-gray-500">ספק לא נמצא</div>
  }

  const totalCollectedAll = groups.reduce((s, g) => s + g.totalCollected, 0)
  const totalCommissionOwedAll = groups.reduce((s, g) => s + g.commissionOwed, 0)
  const totalCommissionPaidAll = groups.reduce((s, g) => s + (g.ledger.commission_paid || 0), 0)
  const groupedProjectIds = new Set(groups.map((g) => g.projectId))
  const availableProjectsToAdd = allProjects.filter((p) => !groupedProjectIds.has(p.id))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/suppliers" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          ספקים
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{supplier.name}</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{supplier.name}</h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
          {supplier.phone && (
            <span className="flex items-center gap-1" dir="ltr">
              <Phone className="h-3.5 w-3.5" />
              {supplier.phone}
            </span>
          )}
          {supplier.phone2 && (
            <span className="flex items-center gap-1" dir="ltr">
              <Phone className="h-3.5 w-3.5" />
              {supplier.phone2}
            </span>
          )}
          {supplier.email && (
            <span className="flex items-center gap-1" dir="ltr">
              <Mail className="h-3.5 w-3.5" />
              {supplier.email}
            </span>
          )}
        </div>
        {!!supplier.advance_amount && (
          <p className="text-sm text-amber-700 bg-amber-50 inline-block rounded px-2 py-1 mt-2">
            מקדמה ששולמה לספק: {formatCurrency(supplier.advance_amount)}
            {supplier.advance_note ? ` — ${supplier.advance_note}` : ''}
          </p>
        )}
      </div>

      {/* Overall summary */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">סה"כ נאסף מלקוחות (הזמנות ששולמו)</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalCollectedAll)}</p>
          </div>
          <div>
            <p className="text-gray-500">סה"כ עמלה שהספק חייב לנו</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalCommissionOwedAll)}</p>
          </div>
          <div>
            <p className="text-gray-500">מזה שולם</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalCommissionPaidAll)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Add project manually (before any orders exist) */}
      {availableProjectsToAdd.length > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-sm">הוסף פרויקט לספק (גם ללא הזמנות עדיין)</Label>
              <Select value={addProjectId} onChange={(e) => setAddProjectId(e.target.value)}>
                <option value="">בחר פרויקט</option>
                {availableProjectsToAdd.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.cityName ? ` (${p.cityName})` : ''}</option>
                ))}
              </Select>
            </div>
            <Button onClick={addProjectToSupplier} disabled={!addProjectId || addingProject}>
              {addingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 ml-1" />}
              הוסף
            </Button>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">אין עדיין פרויקטים משויכים לספק זה</p>
            <p className="text-gray-400 text-sm mt-1">שייך הזמנה לספק, או הוסף פרויקט ידנית למעלה</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isEditing = editingProjectId === group.projectId
            const commissionDebt = Math.max(0, group.commissionOwed - (group.ledger.commission_paid || 0))
            const commissionStatus = getDebtStatus(group.commissionOwed, group.ledger.commission_paid || 0)

            const repPercent = isEditing ? (parseFloat(editForm.rep_percent) || 0) : (group.ledger.rep_percent ?? 1.25)
            const repCommissionTotal = group.totalCollected * (repPercent / 100)
            const repPaid = group.ledger.rep_paid || 0
            const repDebt = Math.max(0, repCommissionTotal - repPaid)
            const repStatus = getDebtStatus(repCommissionTotal, repPaid)

            return (
              <Card key={group.projectId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{group.projectName}</CardTitle>
                    {!isEditing ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => startEdit(group)}>
                          <Pencil className="h-3.5 w-3.5 ml-1" />
                          ערוך תשלומים
                        </Button>
                        {group.paidOrderCount === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProjectFromSupplier(group.projectId)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveLedger(group)} disabled={saving}>
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 ml-1" />}
                          שמור
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingProjectId(null)}>
                          <X className="h-3.5 w-3.5 ml-1" />
                          בטל
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {group.paidOrderCount > 0
                      ? `${group.paidOrderCount} הזמנות בסטטוס "שילם הכל"`
                      : 'טרם קיימות הזמנות משויכות (נוסף ידנית)'}
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier commission */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700">עמלת ספק</h4>
                      <Badge variant={DEBT_STATUS_COLORS[commissionStatus] as any}>
                        {DEBT_STATUS_LABELS[commissionStatus]}
                      </Badge>
                    </div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500">סה"כ נאסף מלקוחות</span>
                        <span className="font-medium">{formatCurrency(group.totalCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">עמלה (מחיר לקוח - מחיר ספק)</span>
                        <span className="font-medium">{formatCurrency(group.commissionOwed)}</span>
                      </div>
                      {isEditing ? (
                        <div className="flex justify-between items-center gap-2">
                          <Label className="shrink-0">עמלה ששולמה</Label>
                          <Input
                            type="number"
                            className="h-8 text-sm"
                            dir="ltr"
                            value={editForm.commission_paid}
                            onChange={(e) => setEditForm({ ...editForm, commission_paid: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-gray-500">עמלה ששולמה</span>
                          <span className="font-medium">{formatCurrency(group.ledger.commission_paid || 0)}</span>
                        </div>
                      )}
                      {commissionDebt > 0 && (
                        <div className="flex justify-between border-t pt-1.5">
                          <span className="text-gray-500">נותר חוב</span>
                          <span className="font-semibold text-red-600">{formatCurrency(commissionDebt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sales rep commission */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700">עמלת נציג מכירות</h4>
                      <Badge variant={DEBT_STATUS_COLORS[repStatus] as any}>
                        {DEBT_STATUS_LABELS[repStatus]}
                      </Badge>
                    </div>
                    <div className="text-sm space-y-1.5">
                      {isEditing ? (
                        <div className="flex justify-between items-center gap-2">
                          <Label className="shrink-0">שם נציג</Label>
                          <Input
                            className="h-8 text-sm"
                            value={editForm.rep_name}
                            onChange={(e) => setEditForm({ ...editForm, rep_name: e.target.value })}
                            placeholder="שם הנציג"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-gray-500">נציג</span>
                          <span className="font-medium">{group.ledger.rep_name || '—'}</span>
                        </div>
                      )}
                      {isEditing ? (
                        <div className="flex justify-between items-center gap-2">
                          <Label className="shrink-0">אחוז עמלה</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 text-sm"
                            dir="ltr"
                            value={editForm.rep_percent}
                            onChange={(e) => setEditForm({ ...editForm, rep_percent: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-gray-500">אחוז עמלה</span>
                          <span className="font-medium">{repPercent}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500">עמלה מחושבת</span>
                        <span className="font-medium">{formatCurrency(repCommissionTotal)}</span>
                      </div>
                      {isEditing ? (
                        <div className="flex justify-between items-center gap-2">
                          <Label className="shrink-0">שולם בפועל</Label>
                          <Input
                            type="number"
                            className="h-8 text-sm"
                            dir="ltr"
                            value={editForm.rep_paid}
                            onChange={(e) => setEditForm({ ...editForm, rep_paid: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-gray-500">שולם בפועל</span>
                          <span className="font-medium">{formatCurrency(repPaid)}</span>
                        </div>
                      )}
                      {repDebt > 0 && (
                        <div className="flex justify-between border-t pt-1.5">
                          <span className="text-gray-500">נותר חוב</span>
                          <span className="font-semibold text-red-600">{formatCurrency(repDebt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
