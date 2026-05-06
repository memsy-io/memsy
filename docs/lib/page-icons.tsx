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
  Rocket,
  RotateCw,
  Search,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'

/**
 * Slug → icon map for sidebar entries. Keys match the doc-page slug
 * (the part after `/docs/`); the index page uses an empty string.
 */
const PAGE_ICONS: Record<string, LucideIcon> = {
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
  'API Reference': Code,
  Reference: Bookmark,
}

/**
 * Lookup a page icon by URL (e.g. `/docs/quickstart`).
 * Falls back to `BookOpen` for any unmapped page.
 */
export function getPageIcon(url: string): LucideIcon {
  const slug = url.replace(/^\/docs\/?/, '')
  return PAGE_ICONS[slug] ?? BookOpen
}

/** Lookup a separator icon by label. Returns `null` if unmapped. */
export function getSectionIcon(name: string): LucideIcon | null {
  return SECTION_ICONS[name] ?? null
}
