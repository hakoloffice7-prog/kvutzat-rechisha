'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type City = { id: string; name: string }
type Project = { id: string; name: string }

// בחירת עיר + פרויקט לדייר: הפרויקט נבחר רק מתוך הפרויקטים הקיימים של העיר שנבחרה
export function ResidentProjectPicker({
  projectId,
  onChange,
  idPrefix = 'residentPicker',
  labelClassName,
}: {
  projectId: string
  onChange: (projectId: string) => void
  idPrefix?: string
  labelClassName?: string
}) {
  const supabase = createClient()
  const [cities, setCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [cityId, setCityId] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: citiesData } = await supabase.from('cities').select('id, name').order('name')
      setCities(citiesData || [])
      if (projectId) {
        const { data: current } = await supabase.from('projects').select('city_id').eq('id', projectId).single()
        if (current?.city_id) setCityId(current.city_id)
      }
    })()
  }, [])

  useEffect(() => {
    if (!cityId) { setProjects([]); return }
    let cancelled = false
    supabase.from('projects').select('id, name').eq('city_id', cityId).order('name').then(({ data }) => {
      if (!cancelled) setProjects(data || [])
    })
    return () => { cancelled = true }
  }, [cityId])

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}City`} className={labelClassName}>עיר</Label>
        <Select
          id={`${idPrefix}City`}
          value={cityId}
          onChange={(e) => { setCityId(e.target.value); onChange('') }}
        >
          <option value="">-- בחר עיר --</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}Project`} className={labelClassName}>פרויקט</Label>
        <Select
          id={`${idPrefix}Project`}
          value={projects.some((p) => p.id === projectId) ? projectId : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!cityId}
        >
          <option value="">-- בחר פרויקט --</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
    </>
  )
}
