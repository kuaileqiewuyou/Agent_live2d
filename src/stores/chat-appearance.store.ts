import { create } from 'zustand'

const CHAT_APPEARANCE_STORAGE_KEY = 'agent-live2d-chat-appearance'
const DEFAULT_BUBBLE_OPACITY = 0.8
const DEFAULT_INPUT_OPACITY = 0.8

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_BUBBLE_OPACITY
  return Math.min(1, Math.max(0.2, value))
}

function readStoredAppearance() {
  if (typeof window === 'undefined') {
    return {
      bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
      inputOpacity: DEFAULT_INPUT_OPACITY,
    }
  }

  try {
    const raw = window.localStorage.getItem(CHAT_APPEARANCE_STORAGE_KEY)
    if (!raw) {
      return {
        bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
        inputOpacity: DEFAULT_INPUT_OPACITY,
      }
    }
    const parsed = JSON.parse(raw) as Partial<{ bubbleOpacity: number, inputOpacity: number }>
    return {
      bubbleOpacity: clampOpacity(parsed.bubbleOpacity ?? DEFAULT_BUBBLE_OPACITY),
      inputOpacity: clampOpacity(parsed.inputOpacity ?? DEFAULT_INPUT_OPACITY),
    }
  }
  catch {
    return {
      bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
      inputOpacity: DEFAULT_INPUT_OPACITY,
    }
  }
}

function persistAppearance(bubbleOpacity: number, inputOpacity: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    CHAT_APPEARANCE_STORAGE_KEY,
    JSON.stringify({
      bubbleOpacity,
      inputOpacity,
    }),
  )
}

interface ChatAppearanceState {
  bubbleOpacity: number
  inputOpacity: number
  setBubbleOpacity: (value: number) => void
  setInputOpacity: (value: number) => void
  resetChatAppearance: () => void
}

const initial = readStoredAppearance()

export const useChatAppearanceStore = create<ChatAppearanceState>((set, get) => ({
  bubbleOpacity: initial.bubbleOpacity,
  inputOpacity: initial.inputOpacity,
  setBubbleOpacity: (value) => {
    const nextValue = clampOpacity(value)
    const currentInputOpacity = get().inputOpacity
    persistAppearance(nextValue, currentInputOpacity)
    set({ bubbleOpacity: nextValue })
  },
  setInputOpacity: (value) => {
    const nextValue = clampOpacity(value)
    const currentBubbleOpacity = get().bubbleOpacity
    persistAppearance(currentBubbleOpacity, nextValue)
    set({ inputOpacity: nextValue })
  },
  resetChatAppearance: () => {
    persistAppearance(DEFAULT_BUBBLE_OPACITY, DEFAULT_INPUT_OPACITY)
    set({
      bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
      inputOpacity: DEFAULT_INPUT_OPACITY,
    })
  },
}))

