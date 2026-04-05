import { expect, test } from '@playwright/test'

test.describe('Terminology guard', () => {
  test('keeps professional terms in English and blocks Chinese fallback terms', async ({ page }) => {
    await page.goto('/skills')

    await expect(page.getByRole('heading', { name: 'Skill 中心' })).toBeVisible()
    await expect(page.getByPlaceholder(/Skill/i)).toBeVisible()

    await expect(page.locator('main')).not.toContainText('技能')
    await expect(page.locator('main')).not.toContainText('工具调用')
  })
})
