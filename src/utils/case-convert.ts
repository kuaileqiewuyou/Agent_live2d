/** snake_case → camelCase */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** camelCase → snake_case */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

/** 递归转换对象所有 key 为 camelCase（后端响应 → 前端） */
export function keysToCamel<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => keysToCamel(item)) as T
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const entries = Object.entries(obj as Record<string, unknown>)
    return Object.fromEntries(
      entries.map(([key, value]) => [toCamelCase(key), keysToCamel(value)]),
    ) as T
  }
  return obj as T
}

/** 递归转换对象所有 key 为 snake_case（前端请求 → 后端） */
export function keysToSnake<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => keysToSnake(item)) as T
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const entries = Object.entries(obj as Record<string, unknown>)
    return Object.fromEntries(
      entries.map(([key, value]) => [toSnakeCase(key), keysToSnake(value)]),
    ) as T
  }
  return obj as T
}
