'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { formatCurrency, STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/utils'

type Project = { id: string; name: string; cities: { name: string } }

export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    if (selectedProject) {
      fetchPreview()
    } else {
      setPreviewData([])
    }
  }, [selectedProject])

  async function fetchProjects() {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*, cities(name)')
      .order('name')

    if (data) setProjects(data)
    setLoading(false)
  }

  async function fetchPreview() {
    setPreviewLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        residents!inner(name, address, phone, project_id),
        categories(name),
        suppliers(name),
        order_items(description, model, customer_price, supplier_price)
      `)
      .eq('residents.project_id', selectedProject)

    if (data) setPreviewData(data)
    setPreviewLoading(false)
  }

  async function exportToExcel() {
    if (!selectedProject) return
    setExporting(true)

    try {
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          *,
          residents!inner(name, address, phone, project_id),
          categories(name),
          suppliers(name),
          order_items(description, model, customer_price, supplier_price)
        `)
        .eq('residents.project_id', selectedProject)

      if (!orders) {
        setExporting(false)
        return
      }

      const project = projects.find(p => p.id === selectedProject)

      // Dynamic import of xlsx
      const XLSX = await import('xlsx')

      const rows: any[] = []

      orders.forEach(order => {
        const resident = order.residents as any
        const items = order.order_items as any[]

        if (!items || items.length === 0) {
          rows.push({
            'שם דייר': resident?.name || '',
            'כתובת דייר': resident?.address || '',
            'טלפון': resident?.phone || '',
            'קטגוריה': (order.categories as any)?.name || '',
            'ספק': (order.suppliers as any)?.name || '',
            'סטטוס': STATUS_LABELS[order.status] || order.status,
            'סטטוס תשלום': PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status,
            'תיאור פריט': '',
            'דגם': '',
            'מחיר לקוח': 0,
            'מחיר ספק': 0,
            'רווח': 0,
          })
        } else {
          items.forEach(item => {
            const profit = (item.customer_price || 0) - (item.supplier_price || 0)
            rows.push({
              'שם דייר': resident?.name || '',
              'כתובת דייר': resident?.address || '',
              'טלפון': resident?.phone || '',
              'קטגוריה': (order.categories as any)?.name || '',
              'ספק': (order.suppliers as any)?.name || '',
              'סטטוס': STATUS_LABELS[order.status] || order.status,
              'סטטוס תשלום': PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status,
              'תיאור פריט': item.description,
              'דגם': item.model || '',
              'מחיר לקוח': item.customer_price || 0,
              'מחיר ספק': item.supplier_price || 0,
              'רווח': profit,
            })
          })
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'הזמנות')

      // Set column widths
      ws['!cols'] = [
        { width: 20 }, { width: 20 }, { width: 15 },
        { width: 15 }, { width: 20 }, { width: 15 },
        { width: 15 }, { width: 30 }, { width: 15 },
        { width: 15 }, { width: 15 }, { width: 15 },
      ]

      const fileName = `הזמנות_${project?.name || 'פרויקט'}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Export error:', error)
      alert('שגיאה בייצוא הקובץ')
    }

    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">דוחות Excel</h1>
        <p className="text-gray-500 mt-1">יצוא הזמנות לפי פרויקט</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            יצוא הזמנות לפרויקט
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>בחר פרויקט</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען פרויקטים...
              </div>
            ) : (
              <Select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="max-w-md"
              >
                <option value="">בחר פרויקט לייצוא</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.cities?.name} - {project.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <Button
            onClick={exportToExcel}
            disabled={!selectedProject || exporting}
            className="bg-green-600 hover:bg-green-700"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                מייצא...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 ml-2" />
                ייצא לאקסל
              </>
            )}
          </Button>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium mb-2">הקובץ יכלול את הנתונים הבאים:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>שם דייר, כתובת וטלפון</li>
              <li>קטגוריה וספק</li>
              <li>סטטוס הזמנה וסטטוס תשלום</li>
              <li>תיאור ודגם לכל פריט</li>
              <li>מחיר לקוח, מחיר ספק ורווח</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle>תצוגה מקדימה</CardTitle>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : previewData.length === 0 ? (
              <p className="text-gray-500 text-center py-8">אין הזמנות בפרויקט זה</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-right py-2 px-3 font-semibold">דייר</th>
                      <th className="text-right py-2 px-3 font-semibold">קטגוריה</th>
                      <th className="text-right py-2 px-3 font-semibold">ספק</th>
                      <th className="text-right py-2 px-3 font-semibold">סטטוס</th>
                      <th className="text-right py-2 px-3 font-semibold">תשלום</th>
                      <th className="text-right py-2 px-3 font-semibold">פריטים</th>
                      <th className="text-right py-2 px-3 font-semibold">הכנסה</th>
                      <th className="text-right py-2 px-3 font-semibold">רווח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((order: any) => {
                      const revenue = order.order_items?.reduce((s: number, i: any) => s + (i.customer_price || 0), 0) || 0
                      const cost = order.order_items?.reduce((s: number, i: any) => s + (i.supplier_price || 0), 0) || 0
                      return (
                        <tr key={order.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{order.residents?.name}</td>
                          <td className="py-2 px-3">{order.categories?.name || '-'}</td>
                          <td className="py-2 px-3">{order.suppliers?.name || '-'}</td>
                          <td className="py-2 px-3">{STATUS_LABELS[order.status]}</td>
                          <td className="py-2 px-3">{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                          <td className="py-2 px-3">{order.order_items?.length || 0}</td>
                          <td className="py-2 px-3">{formatCurrency(revenue)}</td>
                          <td className={`py-2 px-3 font-medium ${revenue - cost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(revenue - cost)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
