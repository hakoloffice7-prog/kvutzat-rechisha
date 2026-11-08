// תאריכי חג (יום טוב) שבהם לא שולחים תזכורות קוליות. פורמט YYYY-MM-DD.
// כרגע מתעלמים מחגים לפי החלטה (הרשימה ריקה). להפעלה: להוסיף תאריכים כאן.
// שבת נחסמת בנפרד בקוד ואינה צריכה להופיע כאן.
export const HOLIDAYS: string[] = []

const HOLIDAY_SET = new Set(HOLIDAYS)

export function isHoliday(date: string): boolean {
  return HOLIDAY_SET.has(date)
}
