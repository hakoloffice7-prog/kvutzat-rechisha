'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Building2,
  FolderOpen,
  Users,
  Package,
  Truck,
  FileSpreadsheet,
  Bell,
  LogOut,
  Menu,
  X,
  BarChart2,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Role } from '@/components/RoleProvider'

const navItems = [
  { href: '/dashboard', label: 'דשבורד', icon: LayoutDashboard },
  { href: '/cities', label: 'ערים ופרויקטים', icon: Building2 },
  { href: '/residents', label: 'דיירים', icon: Users },
  { href: '/overview', label: 'סקירת פרויקט', icon: BarChart2 },
  { href: '/suppliers', label: 'ספקים', icon: Truck },
  { href: '/categories', label: 'קטגוריות', icon: Package },
  { href: '/reports', label: 'דוחות', icon: FileSpreadsheet },
  { href: '/notifications', label: 'התראות', icon: Bell },
]

export default function Sidebar({ role, name }: { role: Role; name: string | null }) {
  const pathname = usePathname()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)

  const items = role === 'admin'
    ? [...navItems, { href: '/admin/users', label: 'ניהול משתמשים', icon: ShieldCheck }]
    : navItems

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      {/* כפתור המבורגר - מוצג רק ב-md ומטה */}
      <button
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-200"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="תפריט"
      >
        {isOpen ? <X className="h-5 w-5 text-gray-700" /> : <Menu className="h-5 w-5 text-gray-700" />}
      </button>

      {/* Overlay לנייד */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* תפריט עליון (בנייד: מגירה) */}
      <aside
        className={cn(
          'w-64 bg-gradient-to-b from-blue-800 to-blue-700 flex flex-col shadow-lg',
          'fixed inset-y-0 right-0 z-40 transition-transform duration-200',
          'md:static md:inset-auto md:sticky md:top-0 md:w-full md:flex-row md:items-center md:gap-4 md:px-6 md:py-2 md:bg-gradient-to-l md:from-blue-800 md:to-blue-600',
          isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
          'hidden md:flex',
          isOpen && 'flex'
        )}
      >
        <div className="p-6 border-b border-blue-600/50 md:p-0 md:border-0 md:shrink-0">
          <h1 className="text-xl font-bold text-white">קבוצות רכישה</h1>
          <p className="text-sm text-blue-200 mt-1 md:hidden">מערכת ניהול</p>
          {name && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-600/50 text-sm text-blue-50 md:hidden">
              <UserCircle className="h-5 w-5 text-blue-200 shrink-0" />
              <span className="truncate">מחובר בתור: <strong>{name}</strong></span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1 md:p-0 md:space-y-0 md:flex md:flex-wrap md:items-center md:gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors md:gap-2 md:py-2',
                  isActive
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-blue-50 hover:bg-white/15 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0 md:h-4 md:w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-blue-600/50 md:p-0 md:border-0 md:flex md:items-center md:gap-3 md:shrink-0">
          {name && (
            <div className="hidden md:flex items-center gap-1.5 text-sm text-blue-50 max-w-[10rem]">
              <UserCircle className="h-5 w-5 text-blue-200 shrink-0" />
              <span className="truncate">{name}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-50 hover:bg-white/15 hover:text-white w-full transition-colors md:w-auto md:gap-2 md:py-2"
          >
            <LogOut className="h-5 w-5 md:h-4 md:w-4" />
            יציאה
          </button>
        </div>
      </aside>
    </>
  )
}
