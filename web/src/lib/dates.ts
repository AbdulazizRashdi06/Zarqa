// Dates are shown in campus time (Asia/Muscat).

/** Today's date and the current time in campus time, as <input type=date|time> values. */
export function muscatNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

const dayMonth = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "Today", "Yesterday" or "24 Sep". */
export function relativeDay(date: string, today = muscatNow().date) {
  if (date === today) return 'Today'
  const y = new Date(`${today}T12:00:00`)
  y.setDate(y.getDate() - 1)
  if (date === y.toISOString().slice(0, 10)) return 'Yesterday'
  return dayMonth(date)
}

/** "2:30 PM" from "14:30". */
export function clockTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Campus date (yyyy-mm-dd) of an ISO timestamp. */
export function campusDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

export { dayMonth }
