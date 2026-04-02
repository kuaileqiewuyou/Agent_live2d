import { expect, test } from '@playwright/test'

test.describe('Skill terminology', () => {
  test('Skills page keeps Skill wording and blocks Chinese fallback term', async ({ page }) => {
    await page.goto('/skills')

    await expect(page.getByRole('heading', { name: 'Skill 中心' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索 Skill 名称、描述或标签...')).toBeVisible()

    await expect(page.locator('body')).not.toContainText('技能')
  })
})
