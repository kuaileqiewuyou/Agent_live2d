import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useNotificationStore } from '@/stores'
import { cn } from '@/utils'

const typeStyles = {
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    iconClassName: 'text-emerald-600',
  },
  error: {
    icon: XCircle,
    className: 'border-red-200 bg-red-50 text-red-900',
    iconClassName: 'text-red-600',
  },
  info: {
    icon: Info,
    className: 'border-slate-200 bg-white text-slate-900',
    iconClassName: 'text-slate-600',
  },
} as const

export function Toaster() {
  const { notifications, remove } = useNotificationStore()

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {notifications.map((item) => {
        const style = typeStyles[item.type]
        const Icon = style.icon
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-xl border shadow-lg backdrop-blur-sm',
              style.className,
            )}
          >
            <div className="flex items-start gap-3 p-4">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', style.iconClassName)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  {(item.repeatCount || 1) > 1 && (
                    <span className="rounded-full border border-current/30 px-1.5 py-0.5 text-[10px] font-medium opacity-80">
                      x{item.repeatCount}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-xs opacity-80">{item.description}</p>
                )}
                {item.action && (
                  <button
                    type="button"
                    className="mt-2 inline-flex rounded-md border border-current/20 px-2 py-1 text-xs font-medium opacity-90 transition hover:bg-black/5 hover:opacity-100"
                    onClick={() => {
                      item.action?.onClick()
                      remove(item.id)
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
                onClick={() => remove(item.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
