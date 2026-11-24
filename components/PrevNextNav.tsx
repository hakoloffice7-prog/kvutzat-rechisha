'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronLeft } from 'lucide-react'

// ניווט קודם/הבא בין פריטים של הרשימה שממנה נכנסו (סקירת פרויקט / דיירים).
// הרשימה נשמרת ב-sessionStorage ברגע הלחיצה במסך הרשימה, בסדר ובסינון שהוצגו.
type NavList = { ids: string[]; from?: string }

const key = (kind: string) => `navList:${kind}`

export function saveNavList(kind: 'orders' | 'residents', ids: string[], from?: string) {
  try {
    sessionStorage.setItem(key(kind), JSON.stringify({ ids, from } satisfies NavList))
  } catch {}
}

export function PrevNextNav({
  kind,
  currentId,
  basePath,
  label,
}: {
  kind: 'orders' | 'residents'
  currentId: string
  basePath: string // למשל '/orders' או '/residents'
  label: string // למשל 'הזמנה' או 'דייר'
}) {
  const [list, setList] = useState<NavList | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key(kind))
      setList(raw ? (JSON.parse(raw) as NavList) : null)
    } catch {
      setList(null)
    }
  }, [kind, currentId])

  if (!list) return null
  const idx = list.ids.indexOf(currentId)
  if (idx === -1 || list.ids.length < 2) return null

  // "חזור" מהפריט שעברנו אליו יחזיר לרשימה ויגלול לשורה שלו (פרמטר row)
  const href = (id: string) => {
    if (!list.from) return `${basePath}/${id}`
    const [path, query = ''] = list.from.split('?')
    const params = new URLSearchParams(query)
    if (params.has('row')) params.set('row', id)
    return `${basePath}/${id}?from=${encodeURIComponent(`${path}?${params.toString()}`)}`
  }
  const prevId = idx > 0 ? list.ids[idx - 1] : null
  const nextId = idx < list.ids.length - 1 ? list.ids[idx + 1] : null
  const btn = 'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm'
  const on = 'bg-white hover:bg-gray-50 text-gray-700'
  const off = 'text-gray-300 cursor-not-allowed'

  return (
    <div className="flex items-center gap-2">
      {prevId ? (
        <Link href={href(prevId)} className={`${btn} ${on}`}>
          <ChevronRight className="h-4 w-4" />
          הקודם
        </Link>
      ) : (
        <span className={`${btn} ${off}`}><ChevronRight className="h-4 w-4" />הקודם</span>
      )}
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {label} {idx + 1} מתוך {list.ids.length}
      </span>
      {nextId ? (
        <Link href={href(nextId)} className={`${btn} ${on}`}>
          הבא
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${btn} ${off}`}>הבא<ChevronLeft className="h-4 w-4" /></span>
      )}
    </div>
  )
}
