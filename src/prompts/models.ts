export interface PromptScope {
  languages?: string[]
  paths?: string[]
}

export interface Prompt {
  id: string
  title: string
  content?: string
  tags?: string[]
  scope?: PromptScope
  createdAt: number
  updatedAt: number
  usageCount: number
  pinned?: boolean
  fileUri?: string
  variables?: string[] // Auto-detected variables
}

export interface PromptFile {
  version: number
  prompts: Prompt[]
}
