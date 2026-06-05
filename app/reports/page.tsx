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
      .eq('status', 'ordered')

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
        .eq('status', 'ordered')

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
        const paymentStatus = PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status

        if (!items || items.length === 0) {
          rows.push({
            'שם דייר': resident?.name || '',
            'כתובת': resident?.address || '',
            'טלפון': resident?.phone || '',
            'קטגוריה': (order.categories as any)?.name || '',
            'סטטוס תשלום': paymentStatus,
            'תיאור פריט': '',
            'דגם': '',
            'מחיר לתשלום': '',
          })
        } else {
          items.forEach(item => {
            rows.push({
              'שם דייר': resident?.name || '',
              'כתובת': resident?.address || '',
              'טלפון': resident?.phone || '',
              'קטגוריה': (order.categories as any)?.name || '',
              'סטטוס תשלום': paymentStatus,
              'תיאור פריט': item.description,
              'דגם': item.model || '',
              'מחיר לתשלום': item.customer_price || 0,
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
              <li>קטגוריה וסטטוס הזמנה</li>
              <li>תיאור ודגם לכל פריט</li>
              <li>מחיר לקוח</li>
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
                      <th className="text-right py-2 px-3 font-semibold">כתובת</th>
                      <th className="text-right py-2 px-3 font-semibold">טלפון</th>
                      <th className="text-right py-2 px-3 font-semibold">קטגוריה</th>
                      <th className="text-right py-2 px-3 font-semibold">סטטוס תשלום</th>
                      <th className="text-right py-2 px-3 font-semibold">תיאור פריט</th>
                      <th className="text-right py-2 px-3 font-semibold">דגם</th>
                      <th className="text-right py-2 px-3 font-semibold">מחיר לתשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((order: any) => {
                      const resident = order.residents as any
                      const items = order.order_items as any[]
                      if (!items || items.length === 0) {
                        return (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium">{resident?.name}</td>
                            <td className="py-2 px-3">{resident?.address}</td>
                            <td className="py-2 px-3">{resident?.phone}</td>
                            <td className="py-2 px-3">{order.categories?.name || '-'}</td>
                            <td className="py-2 px-3">{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                            <td className="py-2 px-3 text-gray-400" colSpan={3}>אין פריטים</td>
                          </tr>
                        )
                      }
                      return items.map((item: any, idx: number) => (
                        <tr key={`${order.id}-${idx}`} className="border-b hover:bg-gray-50">
                          {idx === 0 ? (
                            <>
                              <td className="py-2 px-3 font-medium" rowSpan={items.length}>{resident?.name}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{resident?.address}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{resident?.phone}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{order.categories?.name || '-'}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                            </>
                          ) : null}
                          <td className="py-2 px-3">{item.description}</td>
                          <td className="py-2 px-3">{item.model || '-'}</td>
                          <td className="py-2 px-3 font-medium">{formatCurrency(item.customer_price || 0)}</td>
                        </tr>
                      ))
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
