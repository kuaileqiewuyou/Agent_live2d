/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/api/errors'

const apiRequestMock = vi.fn()

vi.mock('@/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}))

describe('opsMcpInstallerService', () => {
  beforeEach(() => {
    vi.resetModules()
    apiRequestMock.mockReset()
  })

  it('maps route-level not_found to endpoint_not_available for preview', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiRequestError('请求的资源不存在。', { code: 'not_found', status: 404 }),
    )

    const { opsMcpInstallerService } = await import('@/services/ops-mcp-installer.service')

    await expect(
      opsMcpInstallerService.previewInstall({ link: 'https://example.com/mcp' }),
    ).rejects.toMatchObject({
      code: 'endpoint_not_available',
      status: 404,
      message: expect.stringContaining('后端不支持 MCP 安装接口'),
    })
  })

  it('keeps install session not found error unchanged', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiRequestError('install session not found', { code: 'not_found', status: 404 }),
    )

    const { opsMcpInstallerService } = await import('@/services/ops-mcp-installer.service')

    await expect(
      opsMcpInstallerService.getInstallSession('missing-session'),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'install session not found',
    })
  })

  it('passes through non-not_found errors', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiRequestError('validation failed', { code: 'validation_error', status: 422 }),
    )

    const { opsMcpInstallerService } = await import('@/services/ops-mcp-installer.service')

    await expect(
      opsMcpInstallerService.executeInstallStep({ sessionId: 's-1', stepId: 'check_server' }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
      message: 'validation failed',
    })
  })

  it('maps github_readme_parse_failed to actionable message', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiRequestError('unable to parse MCP config from GitHub README', {
        code: 'github_readme_parse_failed',
        status: 422,
      }),
    )

    const { opsMcpInstallerService } = await import('@/services/ops-mcp-installer.service')

    await expect(
      opsMcpInstallerService.previewInstall({ link: 'https://github.com/example/not-mcp' }),
    ).rejects.toMatchObject({
      code: 'github_readme_parse_failed',
      status: 422,
      message: expect.stringContaining('README 中识别'),
    })
  })

  it('maps github_readme_unavailable to actionable message', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiRequestError('failed to fetch GitHub README', {
        code: 'github_readme_unavailable',
        status: 502,
      }),
    )

    const { opsMcpInstallerService } = await import('@/services/ops-mcp-installer.service')

    await expect(
      opsMcpInstallerService.previewInstall({ link: 'https://github.com/example/downstream' }),
    ).rejects.toMatchObject({
      code: 'github_readme_unavailable',
      status: 502,
      message: expect.stringContaining('无法读取 GitHub README'),
    })
  })
})
