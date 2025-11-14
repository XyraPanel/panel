import { defineEventHandler } from 'h3'

import type { AdminScheduleResponse } from '#shared/types/admin'

export default defineEventHandler(() => {
  const schedules: AdminScheduleResponse[] = []

  return {
    data: schedules,
  }
})
