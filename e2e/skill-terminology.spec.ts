import { expect, test } from '@playwright/test'

test.describe('Terminology guard', () => {
  test('keeps professional terms in English and blocks Chinese fallback terms', async ({ page }) => {
    await page.goto('/skills')

    await expect(page.getByRole('heading', { name: 'Skill 中心' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索 Skill 名称、描述或标签...')).toBeVisible()

    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Skills' })).toBeVisible()
    await page.goto('/chat/conv-3')

    const toolBubble = page.locator('button:has-text("web_search")').first()
    await expect(toolBubble).toBeVisible()
    await page.goto('/model-config')

    await expect(page.getByText('Tool Call').first()).toBeVisible()

    await expect(page.locator('body')).not.toContainText('技能')
    await expect(page.locator('main')).not.toContainText('工具调用')
  })
})
