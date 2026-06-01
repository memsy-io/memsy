import type { ComponentType, SVGProps } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  BookOpen,
  Bot,
  Box,
  Brain,
  Clock,
  Code,
  Code2,
  Gauge,
  Globe,
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
  Terminal,
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
  'claude-code': Bot,
  codex: Terminal,
  openclaw: Globe,
  hermes: Brain,

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
