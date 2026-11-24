'use client'

// קישור למייל של לקוח: פותח "אימייל חדש" ב-Gmail של המשרד (בדפדפן) עם כתובת הלקוח ב"אל".
// חשבון המשרד מוגדר במשתנה NEXT_PUBLIC_OFFICE_EMAIL ב-Vercel (לא בקוד). בלי הגדרה — mailto רגיל.
export function emailHref(to: string) {
  const office = process.env.NEXT_PUBLIC_OFFICE_EMAIL
  if (!office) return `mailto:${to}`
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, authuser: office })
  return `https://mail.google.com/mail/?${params.toString()}`
}

export function EmailLink({ email, className }: { email: string; className?: string }) {
  return (
    <a
      href={emailHref(email)}
      target="_blank"
      rel="noopener noreferrer"
      className={className || 'hover:text-blue-600 hover:underline'}
      dir="ltr"
      title="אימייל חדש מהמשרד"
    >
      {email}
    </a>
  )
}
