import { getToken } from '#auth'
import { ensureCors } from '~~/server/utils/http/cors'

export default defineEventHandler(async (event) => {
  if (ensureCors(event)) {
    return
  }

  const token = await getToken({ event })

  return token ?? null
})
