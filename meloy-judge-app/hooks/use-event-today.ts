'use client'

import { useEffect, useState } from 'react'
import { getEventToday } from '@/lib/event-dates'

export function useEventToday() {
  const [today, setToday] = useState(getEventToday)

  useEffect(() => {
    const refresh = () => setToday(getEventToday())
    refresh()
    // Keep a card left open overnight current, including after device sleep.
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
