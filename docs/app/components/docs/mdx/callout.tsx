import { cn } from '@/lib/utils'

interface CalloutProps {
  children: React.ReactNode
  title?: string
}

const calloutStyles = {
  info: {
    container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600',
    title: 'text-blue-800 dark:text-blue-400',
    content: 'text-blue-700 dark:text-blue-300',
  },
  tip: {
    container: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    icon: 'text-emerald-600',
    title: 'text-emerald-800 dark:text-emerald-400',
    content: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600',
    title: 'text-amber-800 dark:text-amber-400',
    content: 'text-amber-700 dark:text-amber-300',
  },
  note: {
    container: 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700',
    icon: 'text-gray-600',
    title: 'text-gray-800 dark:text-gray-200',
    content: 'text-gray-700 dark:text-gray-300',
  },
  check: {
    container: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    icon: 'text-green-600',
    title: 'text-green-800 dark:text-green-400',
    content: 'text-green-700 dark:text-green-300',
  },
}

function createCallout(type: keyof typeof calloutStyles, icon: React.ReactNode, defaultTitle: string) {
  return function Callout({ children, title }: CalloutProps) {
    const styles = calloutStyles[type]
    return (
      <div className={cn('my-6 rounded-lg border p-4', styles.container)}>
        <div className="flex gap-3">
          <div className={cn('mt-0.5 shrink-0', styles.icon)}>{icon}</div>
          <div className="flex-1 min-w-0">
            {(title || defaultTitle) && (
              <p className={cn('font-semibold mb-1', styles.title)}>
                {title || defaultTitle}
              </p>
            )}
            <div className={cn('text-sm [&>p]:m-0', styles.content)}>
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export const Info = createCallout(
  'info',
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>,
  'Info'
)

export const Tip = createCallout(
  'tip',
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>,
  'Tip'
)

export const Warning = createCallout(
  'warning',
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>,
  'Warning'
)

export const Note = createCallout(
  'note',
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>,
  'Note'
)

export const Check = createCallout(
  'check',
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>,
  ''
)
