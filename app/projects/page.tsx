'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Users, Loader2, ChevronLeft, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

type Project = {
  id: string
  name: string
  address: string
  cities: { name: string }
  residents: { count: number }[]
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [revenueByProject, setRevenueByProject] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchProjects() {
      const [{ data }, { data: ordersData }] = await Promise.all([
        supabase
          .from('projects')
          .select('*, cities(name), residents(count)')
          .order('name'),
        supabase
          .from('orders')
          .select('total_price, is_global_price, order_items(customer_price), residents!inner(project_id)'),
      ])
      if (data) setProjects(data as any)

      const revenue: Record<string, number> = {}
      ;(ordersData || []).forEach((order: any) => {
        const projectId = order.residents?.project_id
        if (!projectId) return
        const orderRevenue = order.is_global_price
          ? (order.total_price || 0)
          : (order.order_items || []).reduce((sum: number, item: any) => sum + (item.customer_price || 0), 0)
        revenue[projectId] = (revenue[projectId] || 0) + orderRevenue
      })
      setRevenueByProject(revenue)

      setLoading(false)
    }
    fetchProjects()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">פרויקטים</h1>
        <p className="text-gray-500 mt-1">{projects.length} פרויקטים במערכת</p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">אין פרויקטים עדיין</p>
            <p className="text-gray-400 text-sm mt-1">
              הוסף פרויקטים דרך{' '}
              <Link href="/cities" className="text-blue-600 hover:underline">עמוד הערים</Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const residentCount = (project.residents as any)?.[0]?.count ?? 0
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-lg truncate">
                          {project.name}
                        </h3>
                        {project.cities?.name && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {project.cities.name}
                          </Badge>
                        )}
                      </div>
                      <ChevronLeft className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" />
                    </div>

                    <div className="space-y-1.5">
                      {project.address && (
                        <p className="text-sm text-gray-500 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{project.address}</span>
                        </p>
                      )}
                      <p className="text-sm text-gray-500 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        {residentCount} דיירים
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" />
                        סך הכנסות: <span className="font-medium text-gray-700">{formatCurrency(revenueByProject[project.id] || 0)}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
