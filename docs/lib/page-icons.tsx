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

/** OpenAI logomark — the gear/swirl symbol from simple-icons. */
function OpenAIIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>OpenAI</title>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
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
  codex: OpenAIIcon,

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
