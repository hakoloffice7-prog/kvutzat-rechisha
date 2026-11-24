export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, ShoppingCart, Bell, TrendingUp } from 'lucide-react'
import { formatCurrency, STATUS_LABELS, PAYMENT_STATUS_LABELS, getDebtStatus } from '@/lib/utils'
import Link from 'next/link'
import { ActionBoard } from '@/components/ActionBoard'

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  // Fetch stats in parallel
  const [
    { count: citiesCount },
    { count: projectsCount },
    { count: residentsCount },
    { count: ordersCount },
    { data: ordersForTotals },
    { count: unreadNotifications },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('cities').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    isAdmin
      ? supabase.from('orders').select('total_price, is_global_price, order_costs(global_supplier_price), order_items(customer_price, order_item_costs(supplier_price))')
      : supabase.from('orders').select('total_price, is_global_price, order_items(customer_price)'),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false),
    supabase.from('orders')
      .select(`
        id, status, payment_status, created_at, total_price,
        residents(name),
        categories(name),
        order_payments(amount)
      `)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // מחיר גלובלי נשמר ב-order.total_price/global_supplier_price ולא בפריטים
  // (הפריטים משמשים רק לתיאור במצב הזה) - אסור לחשב את הסכום מהפריטים בלבד
  function orderRevenue(order: any) {
    if (order.is_global_price) return order.total_price || 0
    return (order.order_items || []).reduce((s: number, i: any) => s + (i.customer_price || 0), 0)
  }
  function orderCost(order: any) {
    if (order.is_global_price) return order.order_costs?.global_supplier_price || 0
    return (order.order_items || []).reduce((s: number, i: any) => s + (i.order_item_costs?.supplier_price || 0), 0)
  }

  const totalRevenue = (ordersForTotals || []).reduce((sum, o: any) => sum + orderRevenue(o), 0)
  const totalProfit = isAdmin
    ? (ordersForTotals || []).reduce((sum, o: any) => sum + (orderRevenue(o) - orderCost(o)), 0)
    : 0

  const paymentColors: Record<string, string> = {
    not_paid: 'text-red-600',
    advance: 'text-yellow-600',
    paid_full: 'text-green-600',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">לוח פעולה</h1>
        <p className="text-gray-500 mt-1">מה צריך לעשות היום</p>
      </div>

      <ActionBoard />

      <h2 className="text-xl font-semibold text-gray-700 pt-4 border-t">סיכום כללי</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/cities">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">ערים</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{citiesCount || 0}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/projects">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">פרויקטים</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projectsCount || 0}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/residents">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">דיירים</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{residentsCount || 0}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/orders">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">הזמנות</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{ordersCount || 0}</p>
                </div>
                <div className="bg-orange-100 p-3 rounded-full">
                  <ShoppingCart className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Financial Stats */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-2' : ''} gap-4`}>
        <Link href="/orders">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">סך הכנסות</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
                </div>
                <div className="bg-indigo-100 p-3 rounded-full">
                  <TrendingUp className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {isAdmin && (
        <Link href="/orders">
          <Card className={`cursor-pointer hover:shadow-md transition-shadow ${totalProfit >= 0 ? 'border-green-200' : 'border-red-200'}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">סך רווח</p>
                  <p className={`text-2xl font-bold mt-1 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalProfit)}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${totalProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <TrendingUp className={`h-6 w-6 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        )}
      </div>

      {/* Notifications alert */}
      {(unreadNotifications || 0) > 0 && (
        <Link href="/notifications">
          <Card className="border-yellow-300 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-yellow-600" />
                <p className="text-yellow-800 font-medium">
                  יש לך {unreadNotifications} התראות שלא נקראו
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>הזמנות אחרונות</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order: any) => {
                const totalPaid = (order.order_payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
                const effectivePaymentStatus = getDebtStatus(order.total_price || 0, totalPaid)
                return (
                  <Link key={order.id} href={`/orders/${order.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="font-medium text-gray-900">
                          {order.residents?.name || 'לא ידוע'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.categories?.name || 'ללא קטגוריה'}
                        </p>
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-medium">
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                        <p className={`text-xs mt-1 ${paymentColors[effectivePaymentStatus]}`}>
                          {PAYMENT_STATUS_LABELS[effectivePaymentStatus]}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">אין הזמנות עדיין</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
