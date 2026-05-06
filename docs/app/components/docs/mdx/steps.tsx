import { cn } from '@/lib/utils'

interface StepsProps {
  children: React.ReactNode
}

export function Steps({ children }: StepsProps) {
  return (
    <div className="my-8 space-y-0 [counter-reset:step]">
      {children}
    </div>
  )
}

interface StepProps {
  title: string
  children: React.ReactNode
}

export function Step({ title, children }: StepProps) {
  return (
    <div className="relative [counter-increment:step] group">
      {/* Connecting line */}
      <div className="absolute left-[19px] top-12 bottom-0 w-px bg-gradient-to-b from-border to-transparent group-last:hidden" />

      {/* Step container */}
      <div className="flex gap-4 pb-8 group-last:pb-0">
        {/* Step number badge */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'w-10 h-10 rounded-xl',
              'flex items-center justify-center',
              'bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_oklch,var(--accent),black_20%)]',
              'text-[var(--accent-foreground)] font-semibold text-sm',
              'shadow-sm shadow-[var(--accent)]/20',
              'before:content-[counter(step)]'
            )}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 pt-1.5 min-w-0">
          <h4 className="font-semibold text-lg text-foreground mb-3 leading-tight">
            {title}
          </h4>
          <div className={cn(
            'text-muted-foreground leading-relaxed',
            '[&>p]:mb-4 [&>p:last-child]:mb-0',
            '[&>pre]:my-4 [&>pre]:rounded-lg [&>pre]:border [&>pre]:border-border/50',
            '[&>ul]:my-3 [&>ol]:my-3'
          )}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
