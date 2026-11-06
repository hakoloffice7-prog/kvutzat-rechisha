'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileSpreadsheet, FileText, Download, Loader2 } from 'lucide-react'
import { formatCurrency, PAYMENT_STATUS_LABELS, STATUS_LABELS, STATUS_ORDER } from '@/lib/utils'
import { useIsAdmin } from '@/components/RoleProvider'
import { MultiSelect } from '@/components/MultiSelect'

type Supplier = { id: string; name: string }
type Project = { id: string; name: string; cities: { name: string } }

type OrderRow = {
  id: string
  status: string
  payment_status: string
  supplier_id: string | null
  is_global_price: boolean
  total_price: number | null
  global_supplier_price: number | null
  categories: { name: string } | null
  suppliers: { name: string } | null
  residents: { name: string; address: string; phone: string; project_id: string } | null
  order_items: { description: string; model: string | null; customer_price: number; supplier_price: number }[]
}

type DisplayRow = { description: string; model: string; customerPrice: number | null; supplierPrice: number | null; empty?: boolean }

// הזמנה במחיר גלובלי שומרת את הסכום האמיתי ב-total_price/global_supplier_price,
// לא בפריטים (הפריטים משמשים רק לתיאור, ללא מחיר ליחידה) - לכן שורות הפריטים
// מוצגות בלי מחיר, ומתווספת שורת "תשלום כולל" נפרדת עם הסכום האמיתי של ההזמנה
function getOrderDisplayRows(order: OrderRow): DisplayRow[] {
  const rows: DisplayRow[] = (order.order_items || []).map((item) => ({
    description: item.description,
    model: item.model || '',
    customerPrice: order.is_global_price ? null : (item.customer_price || 0),
    supplierPrice: order.is_global_price ? null : (item.supplier_price || 0),
  }))

  if (order.is_global_price) {
    rows.push({
      description: 'תשלום כולל',
      model: '',
      customerPrice: order.total_price || 0,
      supplierPrice: order.global_supplier_price || 0,
    })
  } else if (rows.length === 0) {
    rows.push({ description: '', model: '', customerPrice: null, supplierPrice: null, empty: true })
  }

  return rows
}

export default function ReportsPage() {
  const isAdmin = useIsAdmin()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const supabase = createClient()

  const hasProject = selectedProjectIds.length > 0
  const multiProject = selectedProjectIds.length > 1
  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id))
  const projectNameOf = (id?: string | null) => projects.find((p) => p.id === id)?.name || ''
  // שם הפרויקט בשם הקובץ ובכותרת: פרויקט בודד בשמו, כמה פרויקטים כמספרם
  const reportProjectName = selectedProjects.length === 1 ? selectedProjects[0].name : `${selectedProjects.length}_פרויקטים`
  const reportProjectTitle = selectedProjects.length === 1
    ? `${selectedProjects[0].cities?.name || ''} · ${selectedProjects[0].name}`
    : `${selectedProjects.length} פרויקטים`

  useEffect(() => {
    fetchProjects()
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => {
      if (data) setSuppliers(data.sort((a, b) => a.name.localeCompare(b.name, 'he')))
    })
  }, [])

  useEffect(() => {
    setSelectedSupplierIds([])
    setSelectedStatuses([])
    if (selectedProjectIds.length > 0) {
      fetchOrders()
    } else {
      setOrders([])
    }
  }, [selectedProjectIds])

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
        status,
        payment_status,
        supplier_id,
        is_global_price,
        total_price,
        residents!inner(name, address, phone, project_id),
        categories(name),
        suppliers(name),
        order_items(description, model, customer_price, order_item_costs(supplier_price)),
        order_costs(global_supplier_price)
      `)
      .in('residents.project_id', selectedProjectIds)

    const flattened = ((data as any) || []).map((order: any) => ({
      ...order,
      global_supplier_price: order.order_costs?.global_supplier_price ?? 0,
      order_items: (order.order_items || []).map((item: any) => ({
        ...item,
        supplier_price: item.order_item_costs?.supplier_price ?? 0,
      })),
    }))
    setOrders(flattened)
    setOrdersLoading(false)
  }

  // כל הספקים במערכת, עם מספר ההזמנות של כל אחד בפרויקט הנבחר
  const supplierOptions = useMemo(() => {
    const counts = new Map<string, number>()
    orders.forEach((o) => {
      if (o.supplier_id) counts.set(o.supplier_id, (counts.get(o.supplier_id) || 0) + 1)
    })
    return suppliers.map((s) => ({
      value: s.id,
      label: hasProject ? `${s.name} (${counts.get(s.id) || 0})` : s.name,
    }))
  }, [suppliers, orders, hasProject])

  const filteredOrders = useMemo(() => {
    return orders.filter((o) =>
      (selectedSupplierIds.length === 0 || (!!o.supplier_id && selectedSupplierIds.includes(o.supplier_id))) &&
      (selectedStatuses.length === 0 || selectedStatuses.includes(o.status))
    )
  }, [orders, selectedSupplierIds, selectedStatuses])

  const statusOptions = STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))

  async function exportToExcel() {
    if (!hasProject || filteredOrders.length === 0) return
    setExporting(true)

    try {
      const supplierName = selectedSupplierIds.length === 0
        ? ''
        : selectedSupplierIds.length === 1
          ? suppliers.find(s => s.id === selectedSupplierIds[0])?.name
          : `${selectedSupplierIds.length}_ספקים`

      // Dynamic import of xlsx
      const XLSX = await import('xlsx')

      const rows: any[] = []

      filteredOrders.forEach(order => {
        const resident = order.residents
        const paymentStatus = PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status

        getOrderDisplayRows(order).forEach(row => {
          rows.push({
            ...(multiProject ? { 'פרויקט': projectNameOf(resident?.project_id) } : {}),
            'שם דייר': resident?.name || '',
            'כתובת': resident?.address || '',
            'טלפון': resident?.phone || '',
            'קטגוריה': order.categories?.name || '',
            'ספק': order.suppliers?.name || '',
            'סטטוס הזמנה': STATUS_LABELS[order.status] || order.status,
            'סטטוס תשלום': paymentStatus,
            'תיאור פריט': row.description,
            'דגם': row.model,
            'מחיר לקוח': row.customerPrice ?? '',
            ...(isAdmin ? { 'מחיר ספק': row.supplierPrice ?? '' } : {}),
          })
        })
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'הזמנות')

      // Set column widths (must match the number of columns above)
      ws['!cols'] = [
        ...(multiProject ? [{ width: 20 }] : []),
        { width: 20 }, { width: 25 }, { width: 15 },
        { width: 15 }, { width: 18 }, { width: 15 }, { width: 15 },
        { width: 25 }, { width: 15 }, { width: 12 },
        ...(isAdmin ? [{ width: 12 }] : []),
      ]

      const namePart = supplierName ? `_${supplierName}` : ''
      const fileName = `הזמנות_${reportProjectName}${namePart}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (error) {
      console.error('Export error:', error)
      alert('שגיאה בייצוא הקובץ')
    }

    setExporting(false)
  }

  // בונה מסמך HTML מעוצב (כמו הטבלה באתר) ל-PDF (הדפסה) או ל-Word.
  // כך העברית וה-RTL מוצגים נכון בלי ספריות נוספות
  function buildReportHtml(mode: 'print' | 'word'): string | null {
    if (!hasProject || filteredOrders.length === 0) return null
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ))
    const supplierText = selectedSupplierIds.length === 0
      ? 'כל הספקים'
      : suppliers.filter((s) => selectedSupplierIds.includes(s.id)).map((s) => s.name).join(', ')
    const statusText = selectedStatuses.length === 0
      ? 'כל הסטטוסים'
      : selectedStatuses.map((s) => STATUS_LABELS[s] || s).join(', ')
    const statusClass: Record<string, string> = {
      done: 'green', cancelled: 'red', interested: 'gray',
      awaiting_selection: 'yellow', selection_approved: 'blue', awaiting_quote: 'yellow', awaiting_approval: 'yellow', quoted: 'yellow',
    }
    const payClass: Record<string, string> = { not_paid: 'red', advance: 'yellow', partial: 'blue', paid_full: 'green' }

    const body = filteredOrders.map((order) => {
      const resident = order.residents
      const rows = getOrderDisplayRows(order)
      return rows.map((row, idx) => {
        const first = idx === 0
        const span = `rowspan="${rows.length}"`
        const head = first ? `
          ${multiProject ? `<td ${span}>${esc(projectNameOf(resident?.project_id))}</td>` : ''}
          <td ${span} class="strong">${esc(resident?.name)}</td>
          <td ${span}>${esc(resident?.address)}</td>
          <td ${span} dir="ltr" class="num">${esc(resident?.phone)}</td>
          <td ${span}>${esc(order.categories?.name || '-')}</td>
          <td ${span}>${esc(order.suppliers?.name || '-')}</td>
          <td ${span}><span class="badge ${statusClass[order.status] || 'blue'}">${esc(STATUS_LABELS[order.status] || order.status)}</span></td>
          <td ${span}><span class="badge ${payClass[order.payment_status] || 'gray'}">${esc(PAYMENT_STATUS_LABELS[order.payment_status] || '')}</span></td>` : ''
        const rest = row.empty
          ? `<td class="muted" colspan="${isAdmin ? 4 : 3}">אין פריטים</td>`
          : `<td>${esc(row.description)}</td>
             <td>${esc(row.model || '-')}</td>
             <td class="strong">${row.customerPrice !== null ? esc(formatCurrency(row.customerPrice)) : '-'}</td>
             ${isAdmin ? `<td class="strong">${row.supplierPrice !== null ? esc(formatCurrency(row.supplierPrice)) : '-'}</td>` : ''}`
        return `<tr class="${first ? 'first' : ''}">${head}${rest}</tr>`
      }).join('')
    }).join('')

    const html = `<!doctype html>
<html ${mode === 'word' ? 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" ' : ''}lang="he" dir="rtl"><head><meta charset="utf-8">
<title>הזמנות - ${esc(reportProjectTitle)}</title>
<style>
  ${mode === 'word'
    ? '@page Section1 { size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 1.2cm; } div.Section1 { page: Section1; }'
    : '@page { size: A4 landscape; margin: 12mm; }'}
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, 'Noto Sans Hebrew', sans-serif; color: #111827; margin: 0; font-size: 11px; }
  .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { margin: 0; font-size: 22px; color: #1d4ed8; }
  .meta { color: #4b5563; margin-top: 4px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #eff6ff; color: #1e3a8a; text-align: right; font-weight: 700; padding: 6px 8px; border: 1px solid #bfdbfe; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; text-align: right; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tr.first td { border-top: 1px solid #9ca3af; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .strong { font-weight: 600; }
  .muted { color: #9ca3af; }
  .num { direction: ltr; text-align: right; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; white-space: nowrap; }
  .green { background: #dcfce7; color: #166534; }
  .red { background: #fee2e2; color: #991b1b; }
  .yellow { background: #fef9c3; color: #854d0e; }
  .blue { background: #dbeafe; color: #1e40af; }
  .gray { background: #f3f4f6; color: #374151; }
  .footer { margin-top: 8px; color: #6b7280; font-size: 10px; }
</style></head><body>
<div class="Section1">
<div class="header">
  <h1>דוח הזמנות — ${esc(reportProjectTitle)}</h1>
  <div class="meta">ספקים: ${esc(supplierText)} · סטטוסים: ${esc(statusText)} · ${filteredOrders.length} הזמנות · ${esc(new Date().toLocaleDateString('he-IL'))}</div>
</div>
<table>
  <thead><tr>
    ${multiProject ? '<th>פרויקט</th>' : ''}<th>דייר</th><th>כתובת</th><th>טלפון</th><th>קטגוריה</th><th>ספק</th>
    <th>סטטוס הזמנה</th><th>סטטוס תשלום</th><th>תיאור פריט</th><th>דגם</th><th>מחיר לקוח</th>${isAdmin ? '<th>מחיר ספק</th>' : ''}
  </tr></thead>
  <tbody>${body}</tbody>
</table>
<div class="footer">קבוצות רכישה — מערכת ניהול</div>
</div>
${mode === 'print' ? '<script>window.onload = function () { setTimeout(function () { window.print() }, 300) }</script>' : ''}
</body></html>`
    return html
  }

  // PDF: פותח את המסמך בחלון חדש ומפעיל את חלון ההדפסה של הדפדפן — שם בוחרים "שמור כ-PDF"
  function exportToPdf() {
    const html = buildReportHtml('print')
    if (!html) return

    const win = window.open('', '_blank')
    if (!win) {
      alert('הדפדפן חסם את החלון. אפשר חלונות קופצים לאתר ונסה שוב')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  // Word: קובץ HTML בסיומת .doc — Word פותח אותו כמסמך רגיל (עברית, RTL וטבלה נשמרים)
  function exportToWord() {
    const html = buildReportHtml('word')
    if (!html) return
    const supplierName = selectedSupplierIds.length === 0
      ? ''
      : selectedSupplierIds.length === 1
        ? suppliers.find((s) => s.id === selectedSupplierIds[0])?.name
        : `${selectedSupplierIds.length}_ספקים`
    const namePart = supplierName ? `_${supplierName}` : ''
    const fileName = `הזמנות_${reportProjectName}${namePart}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.doc`
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">דוחות</h1>
        <p className="text-gray-500 mt-1">יצוא הזמנות לפי פרויקט ל-Excel, ל-PDF או ל-Word, וניתן לסנן גם לפי ספק וסטטוס הזמנה</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            יצוא הזמנות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
            <MultiSelect
              label="בחר פרויקט (אפשר כמה)"
              options={projects.map((p) => ({ value: p.id, label: `${p.cities?.name} - ${p.name}` }))}
              selected={selectedProjectIds}
              onChange={setSelectedProjectIds}
              emptyLabel={loading ? 'טוען פרויקטים...' : 'בחר פרויקט לייצוא'}
              pluralLabel="פרויקטים"
              clearLabel="נקה בחירה"
              disabled={loading}
            />

            <MultiSelect
              label="סנן לפי ספק (אופציונלי)"
              options={supplierOptions}
              selected={selectedSupplierIds}
              onChange={setSelectedSupplierIds}
              emptyLabel="כל הספקים"
              pluralLabel="ספקים"
              clearLabel="נקה בחירה (כל הספקים)"
              disabled={!hasProject}
            />

            <MultiSelect
              label="סנן לפי סטטוס הזמנה (אופציונלי)"
              options={statusOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              emptyLabel="כל הסטטוסים"
              pluralLabel="סטטוסים"
              clearLabel="נקה בחירה (כל הסטטוסים)"
              disabled={!hasProject}
            />
          </div>

          <Button
            onClick={exportToExcel}
            disabled={!hasProject || filteredOrders.length === 0 || exporting}
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
          <Button
            onClick={exportToPdf}
            disabled={!hasProject || filteredOrders.length === 0}
            className="bg-blue-600 hover:bg-blue-700 mr-2"
          >
            <FileText className="h-4 w-4 ml-2" />
            הורד PDF
          </Button>
          <Button
            onClick={exportToWord}
            disabled={!hasProject || filteredOrders.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 mr-2"
          >
            <FileText className="h-4 w-4 ml-2" />
            הורד Word
          </Button>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium mb-2">הקובץ יכלול את הנתונים הבאים:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>שם דייר, כתובת וטלפון</li>
              <li>קטגוריה, ספק, סטטוס הזמנה וסטטוס תשלום</li>
              <li>תיאור ודגם לכל פריט</li>
              <li>{isAdmin ? 'מחיר לקוח ומחיר ספק' : 'מחיר לקוח'}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {hasProject && (
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
                      {multiProject && <th className="text-right py-2 px-3 font-semibold">פרויקט</th>}
                      <th className="text-right py-2 px-3 font-semibold">דייר</th>
                      <th className="text-right py-2 px-3 font-semibold">כתובת</th>
                      <th className="text-right py-2 px-3 font-semibold">טלפון</th>
                      <th className="text-right py-2 px-3 font-semibold">קטגוריה</th>
                      <th className="text-right py-2 px-3 font-semibold">ספק</th>
                      <th className="text-right py-2 px-3 font-semibold">סטטוס הזמנה</th>
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
                      const displayRows = getOrderDisplayRows(order)
                      return displayRows.map((row, idx) => (
                        <tr key={`${order.id}-${idx}`} className="border-b hover:bg-gray-50">
                          {idx === 0 ? (
                            <>
                              {multiProject && <td className="py-2 px-3" rowSpan={displayRows.length}>{projectNameOf(resident?.project_id)}</td>}
                              <td className="py-2 px-3 font-medium" rowSpan={displayRows.length}>{resident?.name}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{resident?.address}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{resident?.phone}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{order.categories?.name || '-'}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{order.suppliers?.name || '-'}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{STATUS_LABELS[order.status] || order.status}</td>
                              <td className="py-2 px-3" rowSpan={displayRows.length}>{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                            </>
                          ) : null}
                          {row.empty ? (
                            <td className="py-2 px-3 text-gray-400" colSpan={isAdmin ? 4 : 3}>אין פריטים</td>
                          ) : (
                            <>
                              <td className="py-2 px-3">{row.description}</td>
                              <td className="py-2 px-3">{row.model || '-'}</td>
                              <td className="py-2 px-3 font-medium">{row.customerPrice !== null ? formatCurrency(row.customerPrice) : '-'}</td>
                              {isAdmin && <td className="py-2 px-3 font-medium">{row.supplierPrice !== null ? formatCurrency(row.supplierPrice) : '-'}</td>}
                            </>
                          )}
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
