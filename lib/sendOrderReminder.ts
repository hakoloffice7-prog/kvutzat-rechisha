// צד לקוח: מבקש מהשרת לשלוח תזכורת מיידית להזמנה (אם בכלל צריך), ומקפיץ הודעה אם השליחה נכשלה.
export async function requestOrderReminder(orderId: string): Promise<void> {
  let failure: string | null = null
  try {
    const res = await fetch('/api/pbx/order-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      failure = json?.error || 'שגיאה בתקשורת עם השרת'
    } else {
      const failed = (json?.results ?? []).find((r: { result: string }) => r.result === 'failed')
      if (failed) failure = failed.reason || 'שגיאה לא ידועה'
    }
  } catch {
    failure = 'שגיאה בתקשורת עם השרת'
  }
  if (failure) {
    window.alert(`המערכת לא הצליחה לשלוח ללקוח תזכורת קולית.\nסיבה: ${failure}\n\nההזמנה נשמרה. אחרי הטיפול אפשר ללחוץ שמירה שוב כדי לנסות לשלוח.`)
  }
}
