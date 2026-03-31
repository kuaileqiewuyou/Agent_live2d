import { User } from 'lucide-react'
import { cn } from '@/utils'
import type { Live2DState } from '@/types'

interface Live2DStageProps {
  state?: Live2DState
  modelId?: string
  className?: string
  compact?: boolean
  /** Full-stage mode for companion layout — no border, larger size */
  full?: boolean
}

const stateLabels: Record<Live2DState, string> = {
  idle: '待机中',
  talking: '说话中',
  thinking: '思考中',
  happy: '开心',
  sad: '难过',
}

export function Live2DStage({
  state = 'idle',
  className,
  compact = false,
  full = false,
}: Live2DStageProps) {
  if (full) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-end gap-4 h-full max-h-[600px] w-[400px]',
          className,
        )}
      >
        {/* Character placeholder — large silhouette */}
        <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-(--color-primary)/8 to-(--color-primary)/3 border-2 border-dashed border-(--color-primary)/15 h-[320px] w-[320px]">
          <User className="h-40 w-40 text-(--color-primary)/20" />
        </div>

        {/* State label */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              state === 'idle' && 'bg-emerald-400',
              state === 'talking' && 'bg-blue-400 animate-pulse',
              state === 'thinking' && 'bg-amber-400 animate-pulse',
              state === 'happy' && 'bg-pink-400',
              state === 'sad' && 'bg-slate-400',
            )}
          />
          <span className="text-xs text-(--color-muted-foreground)">
            {stateLabels[state]}
          </span>
        </div>

        <span className="text-xs text-(--color-muted-foreground)/50">
          Live2D 模型加载区
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        'rounded-2xl border border-(--color-border)',
        'bg-gradient-to-br from-(--color-muted)/30 via-(--color-background) to-(--color-muted)/50',
        compact ? 'p-4 w-48 h-48' : 'p-8 w-72 h-80',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          'bg-gradient-to-br from-(--color-primary)/10 to-(--color-primary)/5',
          'border-2 border-dashed border-(--color-primary)/20',
          compact ? 'h-20 w-20' : 'h-32 w-32',
        )}
      >
        <User
          className={cn(
            'text-(--color-primary)/40',
            compact ? 'h-10 w-10' : 'h-16 w-16',
          )}
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <span
          className={cn(
            'font-medium text-(--color-foreground)/60',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {stateLabels[state]}
        </span>

        {!compact && (
          <span className="text-xs text-(--color-muted-foreground)">
            Live2D 模型加载区
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            state === 'idle' && 'bg-emerald-400',
            state === 'talking' && 'bg-blue-400 animate-pulse',
            state === 'thinking' && 'bg-amber-400 animate-pulse',
            state === 'happy' && 'bg-pink-400',
            state === 'sad' && 'bg-slate-400',
          )}
        />
        {!compact && (
          <span className="text-[10px] text-(--color-muted-foreground)">
            {state === 'idle' ? '就绪' : '活动'}
          </span>
        )}
      </div>
    </div>
  )
}
