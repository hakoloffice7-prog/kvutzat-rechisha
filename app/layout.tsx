import type { Metadata } from 'next'
import './globals.css'
import { createServerClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'קבוצות רכישה - דודי וייס',
  description: 'מערכת לניהול קבוצות רכישה בפרויקטי דיור',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  return (
    <html lang="he" dir="rtl">
      <body>
        {session ? (
          <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 p-6 pt-16 md:pt-6 overflow-auto">
              {children}
            </main>
          </div>
        ) : (
          <main className="min-h-screen">
            {children}
          </main>
        )}
      </body>
    </html>
  )
}
