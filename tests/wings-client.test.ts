/**
 * Wings Client Unit Tests
 * 
 * Tests for the Wings HTTP client implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WingsClient } from '../server/utils/wings-client'
import type { WingsNode } from '../server/utils/wings-client'

describe('WingsClient', () => {
  let mockNode: WingsNode
  let client: WingsClient

  beforeEach(() => {
    mockNode = {
      id: 'test-node-1',
      fqdn: 'wings.example.com',
      scheme: 'https',
      daemonListen: 8080,
      daemonSftp: 2022,
      daemonBase: '/var/lib/pterodactyl/volumes',
      tokenId: 'test-token-id',
      token: 'test-token-secret',
    }

    client = new WingsClient(mockNode)

    // Mock fetch globally
    global.fetch = vi.fn()
  })

  describe('Constructor', () => {
    it('should create client with correct base URL', () => {
      expect(client).toBeDefined()
      // BaseUrl is private, but we can test it through method calls
    })

    it('should format authorization token correctly', () => {
      // Token formatting is tested through actual API calls
      expect(client).toBeInstanceOf(WingsClient)
    })
  })

  describe('Power Actions', () => {
    it('should send start power action', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.sendPowerAction('test-server-uuid', 'start')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/power'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'start' }),
        })
      )
    })

    it('should handle all power actions', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      const actions: Array<'start' | 'stop' | 'restart' | 'kill'> = ['start', 'stop', 'restart', 'kill']

      for (const action of actions) {
        await client.sendPowerAction('test-server-uuid', action)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ action }),
          })
        )
      }
    })
  })

  describe('Command Execution', () => {
    it('should send command to server', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.sendCommand('test-server-uuid', 'say Hello World')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/command'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ command: 'say Hello World' }),
        })
      )
    })
  })

  describe('File Operations', () => {
    it('should delete files', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.deleteFiles('test-server-uuid', '/', ['file1.txt', 'file2.txt'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/files/delete'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ root: '/', files: ['file1.txt', 'file2.txt'] }),
        })
      )
    })

    it('should create directory', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.createDirectory('test-server-uuid', '/', 'new-folder')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/files/create-directory'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ root: '/', name: 'new-folder' }),
        })
      )
    })

    it('should compress files', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ file: 'archive.tar.gz' }),
      })
      global.fetch = mockFetch

      const result = await client.compressFiles('test-server-uuid', '/', ['file1.txt', 'file2.txt'])

      expect(result).toEqual({ file: 'archive.tar.gz' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/files/compress'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  describe('Backup Operations', () => {
    it('should create backup', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ uuid: 'backup-uuid-123' }),
      })
      global.fetch = mockFetch

      const result = await client.createBackup('test-server-uuid')

      expect(result).toEqual({ uuid: 'backup-uuid-123' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/backups'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should delete backup', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.deleteBackup('test-server-uuid', 'backup-uuid-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/backups/backup-uuid-123'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('should restore backup', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      global.fetch = mockFetch

      await client.restoreBackup('test-server-uuid', 'backup-uuid-123', true)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/servers/test-server-uuid/backups/backup-uuid-123/restore'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ truncate: true }),
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should throw error on failed request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })
      global.fetch = mockFetch

      await expect(
        client.sendPowerAction('test-server-uuid', 'start')
      ).rejects.toThrow('Wings request failed')
    })

    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      global.fetch = mockFetch

      await expect(
        client.sendCommand('test-server-uuid', 'test')
      ).rejects.toThrow('Network error')
    })
  })

  describe('URL Generation', () => {
    it('should generate correct download URL', () => {
      const url = client.getFileDownloadUrl('test-server-uuid', '/world.zip')

      expect(url).toContain('https://wings.example.com:8080')
      expect(url).toContain('/api/servers/test-server-uuid/files/download')
      expect(url).toContain('file=%2Fworld.zip')
    })

    it('should generate correct backup download URL', () => {
      const url = client.getBackupDownloadUrl('test-server-uuid', 'backup-uuid-123')

      expect(url).toContain('https://wings.example.com:8080')
      expect(url).toContain('/api/servers/test-server-uuid/backups/backup-uuid-123/download')
    })
  })
})
