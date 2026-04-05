import { AlertCircle, Loader2, RefreshCw, Sparkles, User } from 'lucide-react'
import type { Live2DState } from '@/types'
import { cn } from '@/utils'
import { useLive2DModel } from './useLive2DModel'

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
  error: '异常',
}

const stateHints: Partial<Record<Live2DState, string>> = {
  thinking: '正在思考回复...',
  talking: '正在回复中...',
  error: '回复遇到问题，可重新发送',
}

/* ---- state indicator dot ---- */
function StateDot({ state, size = 'sm' }: { state: Live2DState; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'rounded-full',
        size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5',
        state === 'idle' && 'bg-emerald-400',
        state === 'talking' && 'animate-pulse bg-blue-400',
        state === 'thinking' && 'animate-pulse bg-amber-400',
        state === 'happy' && 'bg-pink-400',
        state === 'sad' && 'bg-slate-400',
        state === 'error' && 'bg-red-400',
      )}
    />
  )
}

/* ---- loading skeleton for model area ---- */
function LoadingSkeleton({ sizeClass }: { sizeClass: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl bg-(--color-muted)/20',
        sizeClass,
      )}
    >
      <div className="h-12 w-12 animate-pulse rounded-full bg-(--color-muted)/40" />
      <Loader2 className="h-5 w-5 animate-spin text-(--color-primary)/30" />
      <span className="text-[11px] text-(--color-muted-foreground)/60">模型加载中...</span>
    </div>
  )
}

/* ---- error overlay with recovery hint ---- */
function ErrorOverlay({ message, compact }: { message?: string; compact?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-(--color-muted)/30 px-3">
      <AlertCircle className={cn('text-red-400/70', compact ? 'h-4 w-4' : 'h-6 w-6')} />
      <span
        className={cn(
          'line-clamp-3 text-center leading-4 text-(--color-muted-foreground)',
          compact ? 'text-[9px]' : 'text-[11px]',
        )}
      >
        {message || '模型加载失败'}
      </span>
      {!compact && (
        <span className="flex items-center gap-1 text-[10px] text-(--color-muted-foreground)/60">
          <RefreshCw className="h-3 w-3" />
          切换人设或刷新可重试
        </span>
      )}
    </div>
  )
}

/* ---- avatar area: canvas or placeholder ---- */
function AvatarArea({
  hasModel,
  containerRef,
  modelStatus,
  modelError,
  sizeClass,
  iconClass,
  compact,
}: {
  hasModel: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  modelStatus: string
  modelError?: string
  sizeClass: string
  iconClass: string
  compact?: boolean
}) {
  if (hasModel) {
    if (modelStatus === 'loading') {
      return <LoadingSkeleton sizeClass={sizeClass} />
    }
    return (
      <div
        ref={containerRef}
        className={cn('relative overflow-hidden rounded-2xl bg-(--color-muted)/20', sizeClass)}
      >
        {modelStatus === 'error' && <ErrorOverlay message={modelError} compact={compact} />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full border-2 border-dashed border-(--color-primary)/20 bg-gradient-to-br from-(--color-primary)/10 to-(--color-primary)/5',
        sizeClass,
      )}
    >
      <User className={cn('text-(--color-primary)/40', iconClass)} />
    </div>
  )
}

/* ---- state banner for full/companion mode ---- */
function StateBanner({ state }: { state: Live2DState }) {
  const hint = stateHints[state]
  if (!hint) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs',
        state === 'thinking' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        state === 'talking' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
        state === 'error' && 'bg-red-500/10 text-red-700 dark:text-red-400',
      )}
    >
      <StateDot state={state} size="md" />
      {hint}
    </div>
  )
}

/* ---- main component ---- */
export function Live2DStage({
  state = 'idle',
  modelId,
  personaName,
  openingMessage,
  className,
  compact = false,
  full = false,
}: Live2DStageProps) {
  const { containerRef, status, errorMessage } = useLive2DModel(modelId, state)
  const hasModel = Boolean(modelId)

  const displayName = personaName || '当前角色'
  const modelLabel = modelId ? `模型：${modelId}` : 'Live2D 模型待接入'
  const hintText = openingMessage || '创建或切换人设后，这里会同步展示对应的角色状态。'

  if (full) {
    return (
      <div
        className={cn(
          'flex h-full max-h-[600px] w-full max-w-[400px] flex-col items-center justify-end gap-3',
          className,
        )}
      >
        <AvatarArea
          hasModel={hasModel}
          containerRef={containerRef}
          modelStatus={status}
          modelError={errorMessage}
          sizeClass="h-[280px] w-[280px] sm:h-[320px] sm:w-[320px]"
          iconClass="h-36 w-36 sm:h-40 sm:w-40"
        />

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2 text-sm font-medium text-(--color-foreground)/70">
            <Sparkles className="h-4 w-4 text-(--color-primary)/60" />
            {displayName}
          </div>
          <span className="text-xs text-(--color-muted-foreground)">{modelLabel}</span>
        </div>

        <StateBanner state={state} />

        {state !== 'thinking' && state !== 'talking' && state !== 'error' && (
          <div className="flex items-center gap-2">
            <StateDot state={state} size="md" />
            <span className="text-xs text-(--color-muted-foreground)">
              {stateLabels[state]}
            </span>
          </div>
        )}

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
      <AvatarArea
        hasModel={hasModel}
        containerRef={containerRef}
        modelStatus={status}
        modelError={errorMessage}
        sizeClass={compact ? 'h-20 w-20' : 'h-32 w-32'}
        iconClass={compact ? 'h-10 w-10' : 'h-16 w-16'}
        compact={compact}
      />

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
        <StateDot state={state} />
        {!compact && (
          <span className="text-[10px] text-(--color-muted-foreground)">
            {state === 'idle' ? '就绪' : '活动中'}
          </span>
        )}
      </div>
    </div>
  )
}
