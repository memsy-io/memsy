import { cn } from '@/lib/utils'

interface FrameProps {
  children: React.ReactNode
  className?: string
}

export function Frame({ children, className }: FrameProps) {
  return (
    <div className={cn('my-6 rounded-lg overflow-hidden border border-border', className)}>
      {children}
    </div>
  )
}
