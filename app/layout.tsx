import type { Metadata } from 'next'
import './globals.css'
import { createServerClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import { RoleProvider, type Role } from '@/components/RoleProvider'

export const metadata: Metadata = {
  title: 'קבוצות רכישה',
  description: 'מערכת לניהול קבוצות רכישה בפרויקטי דיור',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  let role: Role = null
  if (session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    role = (profile?.role as Role) ?? 'user'
  }

  return (
    <html lang="he" dir="rtl">
      <body>
        <RoleProvider role={role}>
          {session ? (
            <div className="flex min-h-screen bg-gray-50">
              <Sidebar role={role} />
              <main className="flex-1 p-6 pt-16 md:pt-6 overflow-auto">
                {children}
              </main>
            </div>
          ) : (
            <main className="min-h-screen">
              {children}
            </main>
          )}
        </RoleProvider>
      </body>
    </html>
  )
}
