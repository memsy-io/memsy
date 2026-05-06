import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Info, Tip, Warning, Note, Check } from '../../app/components/docs/mdx/callout'

describe('Callout Components', () => {
  describe('Info', () => {
    it('renders children content', () => {
      render(<Info>Test information message</Info>)
      expect(screen.getByText('Test information message')).toBeDefined()
    })

    it('has accessible structure', () => {
      render(<Info>Accessible content</Info>)
      const callout = screen.getByText('Accessible content').closest('div')
      expect(callout).toBeDefined()
    })
  })

  describe('Tip', () => {
    it('renders children content', () => {
      render(<Tip>Helpful tip content</Tip>)
      expect(screen.getByText('Helpful tip content')).toBeDefined()
    })
  })

  describe('Warning', () => {
    it('renders children content', () => {
      render(<Warning>Warning message</Warning>)
      expect(screen.getByText('Warning message')).toBeDefined()
    })
  })

  describe('Note', () => {
    it('renders children content', () => {
      render(<Note>Note content</Note>)
      expect(screen.getByText('Note content')).toBeDefined()
    })
  })

  describe('Check', () => {
    it('renders children content', () => {
      render(<Check>Success message</Check>)
      expect(screen.getByText('Success message')).toBeDefined()
    })
  })
})
