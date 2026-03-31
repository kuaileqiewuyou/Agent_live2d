import { useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Persona, ChatLayoutMode } from '@/types'
import { LAYOUT_MODE_LABELS } from '@/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'

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
  onSubmit: (data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => void
}

export function PersonaDialog({
  open,
  onOpenChange,
  persona,
  onSubmit,
}: PersonaDialogProps) {
  const isEditing = !!persona
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(personaSchema) as any,
    defaultValues: persona
      ? {
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
      : {
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
        },
  })

  const [tagInput, setTagInput] = useState('')
  const avatarUrl = watch('avatar')
  const nameValue = watch('name')
  const tags = watch('personalityTags')

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const value = tagInput.trim()
        if (value && !(tags as string[]).includes(value)) {
          setValue('personalityTags', [...tags, value] as any)
        }
        setTagInput('')
      }
    },
    [tagInput, tags, setValue],
  )

  const removeTag = useCallback(
    (tag: string) => {
      setValue(
        'personalityTags',
        tags.filter((t) => t !== tag),
      )
    },
    [tags, setValue],
  )

  const onFormSubmit = (data: PersonaFormValues) => {
    onSubmit({
      ...data,
      avatar: data.avatar ?? '',
      speakingStyle: data.speakingStyle ?? '',
      backgroundStory: data.backgroundStory ?? '',
      live2dModel: data.live2dModel || undefined,
      defaultLayoutMode: data.defaultLayoutMode as ChatLayoutMode,
      systemPromptTemplate: data.systemPromptTemplate || '',
    })
    reset()
    setTagInput('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{isEditing ? '编辑人设' : '新建人设'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '修改人设信息与行为设定' : '创建一个新的 AI 人设角色'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)]">
          <form
            id="persona-form"
            onSubmit={handleSubmit(onFormSubmit as any)}
            className="space-y-5 px-6 pb-2"
          >
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={nameValue || '头像'} />}
                <AvatarFallback className="text-xl">
                  {nameValue ? nameValue.charAt(0) : '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <div>
                  <Label htmlFor="name">名称 *</Label>
                  <Input id="name" placeholder="输入人设名称" {...register('name')} />
                  {errors.name && <p className="text-xs text-(--color-destructive) mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="avatar">头像</Label>
                  <Input id="avatar" placeholder="输入头像图片 URL" {...register('avatar')} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">简介 *</Label>
              <Textarea id="description" rows={2} {...register('description')} />
              {errors.description && <p className="text-xs text-(--color-destructive) mt-1">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>性格标签</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
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
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="speakingStyle">说话风格</Label>
              <Textarea id="speakingStyle" rows={2} {...register('speakingStyle')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="backgroundStory">背景设定</Label>
              <Textarea id="backgroundStory" rows={3} {...register('backgroundStory')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="openingMessage">开场白 *</Label>
              <Textarea id="openingMessage" rows={2} {...register('openingMessage')} />
              {errors.openingMessage && <p className="text-xs text-(--color-destructive) mt-1">{errors.openingMessage.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="systemPromptTemplate">System Prompt</Label>
              <Textarea
                id="systemPromptTemplate"
                rows={3}
                placeholder="你是 {{persona_name }}，请始终以这个人设风格回答。"
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
                  <Select value={field.value || 'none'} onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}>
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
            {isSubmitting ? '保存中...' : isEditing ? '保存修改' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
