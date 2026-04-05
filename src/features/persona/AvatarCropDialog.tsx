import { useEffect, useMemo, useRef, useState } from 'react'
import { Crop, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface AvatarCropDialogProps {
  open: boolean
  imageSrc: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (avatarDataUrl: string) => void
}

const PREVIEW_SIZE = 240
const EXPORT_SIZE = 256

export function AvatarCropDialog({
  open,
  imageSrc,
  onOpenChange,
  onConfirm,
}: AvatarCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const image = useMemo(() => {
    if (!imageSrc) {
      return null
    }
    const img = new Image()
    img.src = imageSrc
    return img
  }, [imageSrc])

  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)

  useEffect(() => {
    if (!open) {
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
      return
    }
  }, [open])

  useEffect(() => {
    if (!open || !image) {
      return
    }

    const handleLoad = () => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return
      }

      canvas.width = PREVIEW_SIZE
      canvas.height = PREVIEW_SIZE
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

      const scale = Math.max(PREVIEW_SIZE / image.width, PREVIEW_SIZE / image.height) * zoom
      const drawWidth = image.width * scale
      const drawHeight = image.height * scale
      const x = (PREVIEW_SIZE - drawWidth) / 2 + offsetX
      const y = (PREVIEW_SIZE - drawHeight) / 2 + offsetY

      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
      ctx.drawImage(image, x, y, drawWidth, drawHeight)
    }

    if (image.complete) {
      handleLoad()
    }
    else {
      image.onload = handleLoad
    }
  }, [image, offsetX, offsetY, open, zoom])

  function handleReset() {
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
  }

  function handleConfirm() {
    if (!image) {
      return
    }

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = EXPORT_SIZE
    exportCanvas.height = EXPORT_SIZE
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) {
      return
    }

    const scale = Math.max(EXPORT_SIZE / image.width, EXPORT_SIZE / image.height) * zoom
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const x = (EXPORT_SIZE - drawWidth) / 2 + (offsetX / PREVIEW_SIZE) * EXPORT_SIZE
    const y = (EXPORT_SIZE - drawHeight) / 2 + (offsetY / PREVIEW_SIZE) * EXPORT_SIZE

    ctx.fillStyle = '#f5f5f5'
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    ctx.drawImage(image, x, y, drawWidth, drawHeight)
    onConfirm(exportCanvas.toDataURL('image/png'))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-4 w-4" />
            裁剪头像
          </DialogTitle>
          <DialogDescription>
            调整缩放和位置后保存，头像会以内嵌图片形式写入当前人设。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[240px,1fr]">
          <div className="overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card)">
            <canvas ref={canvasRef} className="block h-[240px] w-[240px]" />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>缩放</Label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={event => setZoom(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>水平位置</Label>
              <input
                type="range"
                min="-120"
                max="120"
                step="1"
                value={offsetX}
                onChange={event => setOffsetX(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>垂直位置</Label>
              <input
                type="range"
                min="-120"
                max="120"
                step="1"
                value={offsetY}
                onChange={event => setOffsetY(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重置裁剪
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            保存头像
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
