import { Sparkles, User } from 'lucide-react'
import type { Live2DState } from '@/types'
import { cn } from '@/utils'

interface Live2DStageProps {
  state?: Live2DState
  modelId?: string
  personaName?: string
  openingMessage?: string
  className?: string
  compact?: boolean
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
  modelId,
  personaName,
  openingMessage,
  className,
  compact = false,
  full = false,
}: Live2DStageProps) {
  const displayName = personaName || '当前角色'
  const modelLabel = modelId ? `模型：${modelId}` : 'Live2D 模型待接入'
  const hintText = openingMessage || '创建或切换人设后，这里会同步展示对应的角色状态。'

  if (full) {
    return (
      <div
        className={cn(
          'flex h-full max-h-[600px] w-[400px] flex-col items-center justify-end gap-4',
          className,
        )}
      >
        <div className="flex h-[320px] w-[320px] items-center justify-center rounded-full border-2 border-dashed border-(--color-primary)/15 bg-gradient-to-br from-(--color-primary)/8 to-(--color-primary)/3">
          <User className="h-40 w-40 text-(--color-primary)/20" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-sm font-medium text-(--color-foreground)/70">
            <Sparkles className="h-4 w-4 text-(--color-primary)/60" />
            {displayName}
          </div>
          <span className="text-xs text-(--color-muted-foreground)">{modelLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              state === 'idle' && 'bg-emerald-400',
              state === 'talking' && 'animate-pulse bg-blue-400',
              state === 'thinking' && 'animate-pulse bg-amber-400',
              state === 'happy' && 'bg-pink-400',
              state === 'sad' && 'bg-slate-400',
            )}
          />
          <span className="text-xs text-(--color-muted-foreground)">
            {stateLabels[state]}
          </span>
        </div>

        <p className="max-w-xs text-center text-xs leading-5 text-(--color-muted-foreground)/70">
          {hintText}
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--color-border) bg-gradient-to-br from-(--color-muted)/30 via-(--color-background) to-(--color-muted)/50',
        compact ? 'h-48 w-48 p-4' : 'h-80 w-72 p-8',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full border-2 border-dashed border-(--color-primary)/20 bg-gradient-to-br from-(--color-primary)/10 to-(--color-primary)/5',
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

      <div className="flex flex-col items-center gap-1 text-center">
        <span
          className={cn(
            'font-medium text-(--color-foreground)/70',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {displayName}
        </span>
        <span className="text-xs text-(--color-muted-foreground)">
          {stateLabels[state]}
        </span>

        {!compact && (
          <>
            <span className="text-xs text-(--color-muted-foreground)">
              {modelLabel}
            </span>
            <p className="max-w-[14rem] text-[11px] leading-5 text-(--color-muted-foreground)/70">
              {hintText}
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            state === 'idle' && 'bg-emerald-400',
            state === 'talking' && 'animate-pulse bg-blue-400',
            state === 'thinking' && 'animate-pulse bg-amber-400',
            state === 'happy' && 'bg-pink-400',
            state === 'sad' && 'bg-slate-400',
          )}
        />
        {!compact && (
          <span className="text-[10px] text-(--color-muted-foreground)">
            {state === 'idle' ? '就绪' : '活动中'}
          </span>
        )}
      </div>
    </div>
  )
}
