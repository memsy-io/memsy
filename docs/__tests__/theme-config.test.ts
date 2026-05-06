import { describe, it, expect } from 'vitest'
import { siteConfig, themeConfig, getCSSVariables } from '../lib/theme-config'

describe('theme-config', () => {
  describe('siteConfig', () => {
    it('should have required fields', () => {
      expect(siteConfig.name).toBeDefined()
      expect(siteConfig.description).toBeDefined()
      expect(siteConfig.url).toBeDefined()
    })

    it('should have logo configuration', () => {
      expect(siteConfig.logo).toBeDefined()
      expect(siteConfig.logo.srcLight).toBeDefined()
      expect(siteConfig.logo.srcDark).toBeDefined()
      expect(siteConfig.logo.width).toBeGreaterThan(0)
      expect(siteConfig.logo.height).toBeGreaterThan(0)
    })
  })

  describe('themeConfig', () => {
    it('should have light and dark color schemes', () => {
      expect(themeConfig.colors.light).toBeDefined()
      expect(themeConfig.colors.dark).toBeDefined()
    })

    it('should have accent colors', () => {
      expect(themeConfig.colors.light.accent).toBeDefined()
      expect(themeConfig.colors.dark.accent).toBeDefined()
    })

    it('should have OG image configuration', () => {
      expect(themeConfig.ogImage).toBeDefined()
      expect(themeConfig.ogImage.gradient).toBeDefined()
      expect(themeConfig.ogImage.titleColor).toBeDefined()
    })
  })

  describe('getCSSVariables', () => {
    it('should return CSS variables for light mode', () => {
      const vars = getCSSVariables('light')
      expect(vars['--accent']).toBe(themeConfig.colors.light.accent)
    })

    it('should return CSS variables for dark mode', () => {
      const vars = getCSSVariables('dark')
      expect(vars['--accent']).toBe(themeConfig.colors.dark.accent)
    })
  })
})
