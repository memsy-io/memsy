import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Tabs, Tab } from '../../app/components/docs/mdx/tabs'

describe('Tabs Component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders tab titles', () => {
    render(
      <Tabs>
        <Tab title="First">First content</Tab>
        <Tab title="Second">Second content</Tab>
      </Tabs>
    )
    expect(screen.getAllByText('First')[0]).toBeDefined()
    expect(screen.getAllByText('Second')[0]).toBeDefined()
  })

  it('shows first tab content by default', () => {
    render(
      <Tabs>
        <Tab title="First">First content</Tab>
        <Tab title="Second">Second content</Tab>
      </Tabs>
    )
    expect(screen.getAllByText('First content')[0]).toBeDefined()
  })

  it('switches tab content when clicked', () => {
    render(
      <Tabs>
        <Tab title="First">First content</Tab>
        <Tab title="Second">Second content</Tab>
      </Tabs>
    )

    // Click on second tab
    const secondTabs = screen.getAllByText('Second')
    fireEvent.click(secondTabs[0])

    // Second content should now be visible
    expect(screen.getAllByText('Second content')[0]).toBeDefined()
  })
})

describe('Tab Component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders children when active', () => {
    render(
      <Tabs>
        <Tab title="Test">Tab content here</Tab>
      </Tabs>
    )
    expect(screen.getByText('Tab content here')).toBeDefined()
  })
})
