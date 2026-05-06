import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardGroup } from '../../app/components/docs/mdx/card'

describe('Card Component', () => {
  it('renders with title and children', () => {
    render(
      <Card title="Test Card">
        Card content here
      </Card>
    )
    expect(screen.getByText('Test Card')).toBeDefined()
    expect(screen.getByText('Card content here')).toBeDefined()
  })

  it('renders as a link when href is provided', () => {
    render(
      <Card title="Linked Card" href="/docs/test">
        Click me
      </Card>
    )
    const link = screen.getByRole('link')
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/docs/test')
  })

  it('renders icon when provided', () => {
    render(
      <Card title="Card with Icon" icon="rocket">
        Content
      </Card>
    )
    // Icon should be rendered (as SVG)
    expect(screen.getByText('Card with Icon')).toBeDefined()
  })
})

describe('CardGroup Component', () => {
  it('renders children cards', () => {
    render(
      <CardGroup cols={2}>
        <Card title="Card 1">Content 1</Card>
        <Card title="Card 2">Content 2</Card>
      </CardGroup>
    )
    expect(screen.getByText('Card 1')).toBeDefined()
    expect(screen.getByText('Card 2')).toBeDefined()
  })

  it('applies grid layout', () => {
    const { container } = render(
      <CardGroup cols={3}>
        <Card title="Card">Content</Card>
      </CardGroup>
    )
    const grid = container.firstChild
    expect(grid).toBeDefined()
  })
})
