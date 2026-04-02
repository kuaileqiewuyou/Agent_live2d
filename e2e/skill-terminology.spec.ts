import { expect, test } from '@playwright/test'

test.describe('Skill terminology', () => {
  test('Skills page keeps Skill wording and blocks Chinese fallback term', async ({ page }) => {
    await page.goto('/skills')

    await expect(page.getByRole('heading', { name: 'Skill 中心' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索 Skill 名称、描述或标签...')).toBeVisible()

    await expect(page.locator('body')).not.toContainText('技能')
  })

  test('Sidebar navigation keeps Skills label in English', async ({ page }) => {
    await page.goto('/skills')

    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Skills' })).toBeVisible()
    await expect(sidebar).not.toContainText('技能')
  })
})

test.describe('Tool usage terminology', () => {
  test('Tool message bubble keeps tool identifier and avoids Chinese fallback title', async ({ page }) => {
    await page.goto('/chat/conv-3')

    const toolBubble = page.locator('button:has-text("web_search")').first()
    await expect(toolBubble).toBeVisible()
    await expect(toolBubble).not.toContainText('工具调用')
  })
})

test.describe('Model config terminology', () => {
  test('Model config card keeps Tool Call wording and blocks Chinese fallback', async ({ page }) => {
    await page.goto('/model-config')

    await expect(page.getByText('Tool Call').first()).toBeVisible()
    await expect(page.locator('main')).not.toContainText('工具调用')
  })
})
