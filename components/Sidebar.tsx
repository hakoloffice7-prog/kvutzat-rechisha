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
  { href: '/reports', label: 'דוחות Excel', icon: FileSpreadsheet },
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

      {/* Sidebar */}
      <aside
        className={cn(
          'w-64 bg-white border-l border-gray-200 flex flex-col shadow-sm',
          'fixed md:static inset-y-0 right-0 z-40 transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
          'hidden md:flex',
          isOpen && 'flex'
        )}
      >
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700">קבוצות רכישה</h1>
          <p className="text-sm text-gray-500 mt-1">מערכת ניהול</p>
          {name && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-sm text-gray-700">
              <UserCircle className="h-5 w-5 text-gray-400 shrink-0" />
              <span className="truncate">מחובר בתור: <strong>{name}</strong></span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="h-5 w-5" />
            יציאה מהמערכת
          </button>
        </div>
      </aside>
    </>
  )
}
