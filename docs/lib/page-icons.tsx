import type { ComponentType, SVGProps } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  BookOpen,
  Box,
  Clock,
  Code,
  Code2,
  Gauge,
  HelpCircle,
  Lightbulb,
  type LucideIcon,
  MessageSquare,
  Package,
  Plug,
  Puzzle,
  Rocket,
  RotateCw,
  Search,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/** Official LangChain logomark, lifted from langchain.com's navbar SVG (new
 * brand mark — the four geometric pieces, not the wordmark). Uses
 * currentColor so it inherits the sidebar's active / muted text color. */
function LangChainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 22 22"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      {...props}
    >
      <title>LangChain</title>
      <path d="M6.64803 14.103C7.89438 12.8566 8.595 11.1643 8.595 9.40177C8.595 7.63928 7.89378 5.94697 6.64803 4.70058L1.94697 0C0.701225 1.24639 0 2.9387 0 4.70119C0 6.46368 0.701225 8.15599 1.94697 9.40238L6.64742 14.103H6.64803Z" />
      <path d="M16.4845 14.5379C15.2388 13.2921 13.5459 12.5908 11.7841 12.5908C10.0222 12.5908 8.32936 13.2921 7.08301 14.5379L11.7841 19.239C13.0298 20.4848 14.7227 21.1861 16.4851 21.1861C18.2476 21.1861 19.9398 20.4848 21.1862 19.239L16.4851 14.5379H16.4845Z" />
      <path d="M1.95832 19.228C3.20468 20.4738 4.89693 21.1751 6.65938 21.1751V14.5269H0.0107422C0.0113472 16.2893 0.711968 17.9817 1.95832 19.228Z" />
      <path d="M18.2997 7.58717C17.0533 6.34138 15.3611 5.63953 13.598 5.64014C11.8356 5.64014 10.1433 6.34138 8.89697 7.58777L13.598 12.289L18.2997 7.58717Z" />
    </svg>
  )
}

/** Official Model Context Protocol logomark, lifted from
 * modelcontextprotocol.io/favicon.svg. Three interweaving arcs forming
 * the MCP chain motif. Stroke color uses currentColor so it inherits
 * the sidebar's active / muted text color; the original's solid black
 * rounded-rect background is intentionally omitted since the sidebar
 * draws its own selection state. */
function McpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 180 180"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="11.0667"
      strokeLinecap="round"
      {...props}
    >
      <title>MCP</title>
      <path d="M23.5996 85.2532L86.2021 22.6507C94.8457 14.0071 108.86 14.0071 117.503 22.6507C126.147 31.2942 126.147 45.3083 117.503 53.9519L70.2254 101.23" />
      <path d="M70.8789 100.578L117.504 53.952C126.148 45.3083 140.163 45.3083 148.806 53.952L149.132 54.278C157.776 62.9216 157.776 76.9357 149.132 85.5792L92.5139 142.198C89.6327 145.079 89.6327 149.75 92.5139 152.631L104.14 164.257" />
      <path d="M101.853 38.3013L55.553 84.6011C46.9094 93.2447 46.9094 107.258 55.553 115.902C64.1966 124.546 78.2106 124.546 86.8543 115.902L133.154 69.6025" />
    </svg>
  )
}

/** OpenClaw official logomark — lobster body + claws, gradient replaced with currentColor.
 *  viewBox cropped to the claw/body region (y 10–80) to maximise claw visibility at small sizes. */
function OpenClawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 10 120 70" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>OpenClaw</title>
      <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" />
      <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" />
      <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" />
    </svg>
  )
}

/** Anthropic logomark — the angular "A" mark from simple-icons. */
function AnthropicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Anthropic</title>
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  )
}

/**
 * Slug → icon map for sidebar entries. Keys match the doc-page slug
 * (the part after `/docs/`); the index page uses an empty string.
 */
const PAGE_ICONS: Record<string, IconComponent> = {
  '': BookOpen,

  // Getting Started
  signup: UserPlus,
  installation: Package,
  quickstart: Rocket,

  // Concepts
  'events-and-memories': MessageSquare,
  'actors-and-sessions': Users,
  'async-processing': Clock,

  // Guides
  'ingesting-events': Upload,
  'searching-memory': Search,
  'async-client': Zap,
  'usage-and-rate-limits': Gauge,
  'error-handling': AlertCircle,
  retries: RotateCw,

  // Integrations
  langchain: LangChainIcon,
  mcp: McpIcon,

  // Plugins
  'claude-code': AnthropicIcon,
  openclaw: OpenClawIcon,

  // API Reference
  'memsy-client': Code,
  'async-memsy-client': Code2,
  models: Box,
  exceptions: AlertTriangle,

  // Reference
  faq: HelpCircle,
}

/** Section-separator labels mapped to a lucide icon. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  'Getting Started': Sparkles,
  Concepts: Lightbulb,
  Guides: BookOpen,
  Integrations: Plug,
  Plugins: Puzzle,
  'API Reference': Code,
  Reference: Bookmark,
}

/**
 * Lookup a page icon by URL (e.g. `/docs/quickstart`).
 * Falls back to `BookOpen` for any unmapped page.
 */
export function getPageIcon(url: string): IconComponent {
  const slug = url.replace(/^\/docs\/?/, '')
  return PAGE_ICONS[slug] ?? BookOpen
}

/** Lookup a separator icon by label. Returns `null` if unmapped. */
export function getSectionIcon(name: string): LucideIcon | null {
  return SECTION_ICONS[name] ?? null
}
