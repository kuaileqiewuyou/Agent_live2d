import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ImagePlus, Trash2, Upload, X } from 'lucide-react'
import type { ChatLayoutMode, Persona } from '@/types'
import { LAYOUT_MODE_LABELS } from '@/constants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AvatarCropDialog } from '@/features/persona/AvatarCropDialog'

const personaSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  avatar: z.string().optional().default(''),
  description: z.string().min(1, '简介不能为空'),
  personalityTags: z.array(z.string()).default([]),
  speakingStyle: z.string().optional().default(''),
  backgroundStory: z.string().optional().default(''),
  openingMessage: z.string().min(1, '开场白不能为空'),
  longTermMemoryEnabled: z.boolean().default(false),
  live2dModel: z.string().optional().default(''),
  defaultLayoutMode: z.enum(['chat', 'companion'] as const).default('chat'),
  systemPromptTemplate: z.string().optional().default(''),
})

type PersonaFormValues = z.infer<typeof personaSchema>

interface PersonaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  persona?: Persona | null
  onSubmit: (data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}

const EMPTY_VALUES: PersonaFormValues = {
  name: '',
  avatar: '',
  description: '',
  personalityTags: [],
  speakingStyle: '',
  backgroundStory: '',
  openingMessage: '',
  longTermMemoryEnabled: false,
  live2dModel: '',
  defaultLayoutMode: 'chat',
  systemPromptTemplate: '',
}

function toFormValues(persona?: Persona | null): PersonaFormValues {
  if (!persona) {
    return EMPTY_VALUES
  }

  return {
    name: persona.name,
    avatar: persona.avatar,
    description: persona.description,
    personalityTags: persona.personalityTags,
    speakingStyle: persona.speakingStyle,
    backgroundStory: persona.backgroundStory,
    openingMessage: persona.openingMessage,
    longTermMemoryEnabled: persona.longTermMemoryEnabled,
    live2dModel: persona.live2dModel ?? '',
    defaultLayoutMode: persona.defaultLayoutMode,
    systemPromptTemplate: persona.systemPromptTemplate,
  }
}

export function PersonaDialog({
  open,
  onOpenChange,
  persona,
  onSubmit,
}: PersonaDialogProps) {
  const isEditing = !!persona
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonaFormValues>({
    resolver: zodResolver(personaSchema) as any,
    defaultValues: toFormValues(persona),
  })

  const [tagInput, setTagInput] = useState('')
  const avatarUrl = watch('avatar')
  const nameValue = watch('name')
  const tags = watch('personalityTags')

  useEffect(() => {
    if (!open) {
      return
    }

    reset(toFormValues(persona))
    setTagInput('')
  }, [open, persona, reset])

  const handleTagKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      const value = tagInput.trim()
      if (value && !tags.includes(value)) {
        setValue('personalityTags', [...tags, value], { shouldDirty: true })
      }
      setTagInput('')
    },
    [setValue, tagInput, tags],
  )

  const removeTag = useCallback(
    (tag: string) => {
      setValue(
        'personalityTags',
        tags.filter(existingTag => existingTag !== tag),
        { shouldDirty: true },
      )
    },
    [setValue, tags],
  )

  const handlePickAvatar = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleAvatarFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropSource(String(reader.result || ''))
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }, [])

  const handleCropConfirm = useCallback((avatarDataUrl: string) => {
    setValue('avatar', avatarDataUrl, { shouldDirty: true })
    setCropSource(null)
  }, [setValue])

  const handleRemoveAvatar = useCallback(() => {
    setValue('avatar', '', { shouldDirty: true })
  }, [setValue])

  const onFormSubmit = async (data: PersonaFormValues) => {
    await onSubmit({
      ...data,
      avatar: data.avatar ?? '',
      speakingStyle: data.speakingStyle ?? '',
      backgroundStory: data.backgroundStory ?? '',
      live2dModel: data.live2dModel || undefined,
      defaultLayoutMode: data.defaultLayoutMode as ChatLayoutMode,
      systemPromptTemplate: data.systemPromptTemplate || '',
    })

    reset(EMPTY_VALUES)
    setTagInput('')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{isEditing ? '编辑人设' : '新建人设'}</DialogTitle>
            <DialogDescription>
              {isEditing ? '修改人设信息与行为设定。' : '创建一个新的 AI 人设角色。'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-10rem)]">
            <form
              id="persona-form"
              onSubmit={handleSubmit(onFormSubmit as any)}
              className="space-y-5 px-6 pb-2"
            >
              <div className="flex items-start gap-4">
                <Avatar className="h-20 w-20">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={nameValue || '头像'} />}
                  <AvatarFallback className="text-2xl">
                    {nameValue ? nameValue.charAt(0) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div>
                    <Label htmlFor="name">名称 *</Label>
                    <Input id="name" placeholder="输入人设名称" {...register('name')} />
                    {errors.name && <p className="mt-1 text-xs text-(--color-destructive)">{errors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>头像</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={handlePickAvatar}>
                        <Upload className="mr-2 h-4 w-4" />
                        {avatarUrl ? '替换头像' : '上传图片'}
                      </Button>
                      {avatarUrl && (
                        <Button type="button" variant="outline" onClick={() => setCropOpen(true)}>
                          <ImagePlus className="mr-2 h-4 w-4" />
                          重新裁剪
                        </Button>
                      )}
                      {avatarUrl && (
                        <Button type="button" variant="outline" onClick={handleRemoveAvatar}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          移除头像
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-(--color-muted-foreground)">
                      支持本地图片上传。裁剪后会以内嵌图片形式保存到当前人设。
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">简介 *</Label>
                <Textarea id="description" rows={2} placeholder="用一句话概括这个角色。" {...register('description')} />
                {errors.description && <p className="mt-1 text-xs text-(--color-destructive)">{errors.description.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>性格标签</Label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="rounded-full p-0.5 hover:bg-(--color-muted-foreground)/20">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  placeholder="输入标签后按回车添加"
                  value={tagInput}
                  onChange={event => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="speakingStyle">说话风格</Label>
                <Textarea id="speakingStyle" rows={2} placeholder="例如：温柔、简洁、鼓励式。" {...register('speakingStyle')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="backgroundStory">背景设定</Label>
                <Textarea id="backgroundStory" rows={3} placeholder="角色的背景故事、经历或设定。" {...register('backgroundStory')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="openingMessage">开场白 *</Label>
                <Textarea id="openingMessage" rows={2} placeholder="例如：今天想聊点什么？" {...register('openingMessage')} />
                {errors.openingMessage && <p className="mt-1 text-xs text-(--color-destructive)">{errors.openingMessage.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="systemPromptTemplate">System Prompt（系统提示词）</Label>
                <Textarea
                  id="systemPromptTemplate"
                  rows={3}
                  placeholder="例如：你是 {{persona_name}}，请始终保持该角色的表达风格。"
                  {...register('systemPromptTemplate')}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="longTermMemoryEnabled" className="cursor-pointer">启用长期记忆</Label>
                <Controller
                  name="longTermMemoryEnabled"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="longTermMemoryEnabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Live2D 模型</Label>
                <Controller
                  name="live2dModel"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || 'none'} onValueChange={value => field.onChange(value === 'none' ? '' : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择 Live2D 模型（可选）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>默认聊天模式</Label>
                <Controller
                  name="defaultLayoutMode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(LAYOUT_MODE_LABELS) as [ChatLayoutMode, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </form>
          </ScrollArea>

          <DialogFooter className="px-6 pb-6 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
              取消
            </Button>
            <Button type="submit" form="persona-form" disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : isEditing ? '保存修改' : '创建人设'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AvatarCropDialog
        open={cropOpen}
        imageSrc={cropSource || avatarUrl || null}
        onOpenChange={setCropOpen}
        onConfirm={handleCropConfirm}
      />
    </>
  )
}
