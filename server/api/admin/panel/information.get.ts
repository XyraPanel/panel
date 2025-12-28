import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineEventHandler } from 'h3'

import { requireAdmin } from '~~/server/utils/security'
import type { PanelInformation } from '#shared/types/admin'

function getPackageVersion(): string {
  try {
    const pkgPath = resolve(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  }
  catch {
    return '0.0.0'
  }
}

const packageVersion = getPackageVersion()

const RELEASE_NOTES_URL = process.env.XYRA_RELEASES_URL ?? 'https://github.com/XyraPanel/panel/releases'
const DOCUMENTATION_URL = process.env.XYRA_DOCUMENTATION_URL ?? 'https://xyrapanel.com'
const SUPPORT_URL = process.env.XYRA_SUPPORT_URL ?? 'https://xyrapanel.com/discord'
const DONATIONS_URL = process.env.XYRA_DONATIONS_URL ?? 'https://ko-fi.com/26bzz'
const REPOSITORY_URL = process.env.XYRA_REPOSITORY_URL ?? 'https://github.com/XyraPanel/panel'

export default defineEventHandler(async (event): Promise<PanelInformation> => {
  await requireAdmin(event)

  return {
    panelVersion: packageVersion,
    latestPanelVersion: null,
    isPanelUpToDate: null,
    documentationUrl: DOCUMENTATION_URL,
    supportUrl: SUPPORT_URL,
    donationsUrl: DONATIONS_URL,
    releaseNotesUrl: RELEASE_NOTES_URL,
    repositoryUrl: REPOSITORY_URL,
    lastCheckedAt: new Date().toISOString(),
  }
})
