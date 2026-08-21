'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { formatCurrency, PAYMENT_STATUS_LABELS } from '@/lib/utils'
import { useIsAdmin } from '@/components/RoleProvider'

type Project = { id: string; name: string; cities: { name: string } }

type OrderRow = {
  id: string
  payment_status: string
  supplier_id: string | null
  categories: { name: string } | null
  suppliers: { name: string } | null
  residents: { name: string; address: string; phone: string; project_id: string } | null
  order_items: { description: string; model: string | null; customer_price: number; supplier_price: number }[]
}

export default function ReportsPage() {
  const isAdmin = useIsAdmin()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    setSelectedSupplierId('')
    if (selectedProject) {
      fetchOrders()
    } else {
      setOrders([])
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

  async function fetchOrders() {
    setOrdersLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id,
        payment_status,
        supplier_id,
        residents!inner(name, address, phone, project_id),
        categories(name),
        suppliers(name),
        order_items(description, model, customer_price, order_item_costs(supplier_price))
      `)
      .eq('residents.project_id', selectedProject)

    const flattened = ((data as any) || []).map((order: any) => ({
      ...order,
      order_items: (order.order_items || []).map((item: any) => ({
        ...item,
        supplier_price: item.order_item_costs?.supplier_price ?? 0,
      })),
    }))
    setOrders(flattened)
    setOrdersLoading(false)
  }

  // ספקים שיש להם בפועל הזמנות בפרויקט הנבחר - לבחירה בפילטר
  const availableSuppliers = useMemo(() => {
    const map = new Map<string, string>()
    orders.forEach((o) => {
      if (o.supplier_id && o.suppliers?.name) map.set(o.supplier_id, o.suppliers.name)
    })
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [orders])

  const filteredOrders = useMemo(() => {
    if (!selectedSupplierId) return orders
    return orders.filter((o) => o.supplier_id === selectedSupplierId)
  }, [orders, selectedSupplierId])

  async function exportToExcel() {
    if (!selectedProject || filteredOrders.length === 0) return
    setExporting(true)

    try {
      const project = projects.find(p => p.id === selectedProject)
      const supplierName = availableSuppliers.find(s => s.id === selectedSupplierId)?.name

      // Dynamic import of xlsx
      const XLSX = await import('xlsx')

      const rows: any[] = []

      filteredOrders.forEach(order => {
        const resident = order.residents
        const items = order.order_items
        const paymentStatus = PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status

        if (!items || items.length === 0) {
          rows.push({
            'שם דייר': resident?.name || '',
            'כתובת': resident?.address || '',
            'טלפון': resident?.phone || '',
            'קטגוריה': order.categories?.name || '',
            'ספק': order.suppliers?.name || '',
            'סטטוס תשלום': paymentStatus,
            'תיאור פריט': '',
            'דגם': '',
            'מחיר לקוח': '',
            ...(isAdmin ? { 'מחיר ספק': '' } : {}),
          })
        } else {
          items.forEach(item => {
            rows.push({
              'שם דייר': resident?.name || '',
              'כתובת': resident?.address || '',
              'טלפון': resident?.phone || '',
              'קטגוריה': order.categories?.name || '',
              'ספק': order.suppliers?.name || '',
              'סטטוס תשלום': paymentStatus,
              'תיאור פריט': item.description,
              'דגם': item.model || '',
              'מחיר לקוח': item.customer_price || 0,
              ...(isAdmin ? { 'מחיר ספק': item.supplier_price || 0 } : {}),
            })
          })
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'הזמנות')

      // Set column widths (must match the number of columns above)
      ws['!cols'] = [
        { width: 20 }, { width: 25 }, { width: 15 },
        { width: 15 }, { width: 18 }, { width: 15 },
        { width: 25 }, { width: 15 }, { width: 12 },
        ...(isAdmin ? [{ width: 12 }] : []),
      ]

      const namePart = supplierName ? `_${supplierName}` : ''
      const fileName = `הזמנות_${project?.name || 'פרויקט'}${namePart}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`
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
        <p className="text-gray-500 mt-1">יצוא הזמנות לפי פרויקט, וניתן לסנן גם לפי ספק</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            יצוא הזמנות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
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

            <div className="space-y-2">
              <Label>סנן לפי ספק (אופציונלי)</Label>
              <Select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                disabled={!selectedProject || availableSuppliers.length === 0}
              >
                <option value="">כל הספקים</option>
                {availableSuppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <Button
            onClick={exportToExcel}
            disabled={!selectedProject || filteredOrders.length === 0 || exporting}
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
              <li>קטגוריה, ספק וסטטוס תשלום</li>
              <li>תיאור ודגם לכל פריט</li>
              <li>{isAdmin ? 'מחיר לקוח ומחיר ספק' : 'מחיר לקוח'}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle>תצוגה מקדימה ({filteredOrders.length} הזמנות)</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">אין הזמנות התואמות את הסינון הנבחר</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-right py-2 px-3 font-semibold">דייר</th>
                      <th className="text-right py-2 px-3 font-semibold">כתובת</th>
                      <th className="text-right py-2 px-3 font-semibold">טלפון</th>
                      <th className="text-right py-2 px-3 font-semibold">קטגוריה</th>
                      <th className="text-right py-2 px-3 font-semibold">ספק</th>
                      <th className="text-right py-2 px-3 font-semibold">סטטוס תשלום</th>
                      <th className="text-right py-2 px-3 font-semibold">תיאור פריט</th>
                      <th className="text-right py-2 px-3 font-semibold">דגם</th>
                      <th className="text-right py-2 px-3 font-semibold">מחיר לקוח</th>
                      {isAdmin && <th className="text-right py-2 px-3 font-semibold">מחיר ספק</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const resident = order.residents
                      const items = order.order_items
                      if (!items || items.length === 0) {
                        return (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium">{resident?.name}</td>
                            <td className="py-2 px-3">{resident?.address}</td>
                            <td className="py-2 px-3">{resident?.phone}</td>
                            <td className="py-2 px-3">{order.categories?.name || '-'}</td>
                            <td className="py-2 px-3">{order.suppliers?.name || '-'}</td>
                            <td className="py-2 px-3">{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                            <td className="py-2 px-3 text-gray-400" colSpan={isAdmin ? 4 : 3}>אין פריטים</td>
                          </tr>
                        )
                      }
                      return items.map((item, idx) => (
                        <tr key={`${order.id}-${idx}`} className="border-b hover:bg-gray-50">
                          {idx === 0 ? (
                            <>
                              <td className="py-2 px-3 font-medium" rowSpan={items.length}>{resident?.name}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{resident?.address}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{resident?.phone}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{order.categories?.name || '-'}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{order.suppliers?.name || '-'}</td>
                              <td className="py-2 px-3" rowSpan={items.length}>{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                            </>
                          ) : null}
                          <td className="py-2 px-3">{item.description}</td>
                          <td className="py-2 px-3">{item.model || '-'}</td>
                          <td className="py-2 px-3 font-medium">{formatCurrency(item.customer_price || 0)}</td>
                          {isAdmin && <td className="py-2 px-3 font-medium">{formatCurrency(item.supplier_price || 0)}</td>}
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
