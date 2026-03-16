import { z } from 'zod'

const ConfigSchema = z.object({
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  dataDir: z.string().default('./data'),
  llmProvider: z.enum(['openai', 'anthropic']).default('openai'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  corsOrigin: z.string().default('*'),
  apiKey: z.string().optional(),
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    dataDir: process.env.IDOL_FRAME_DATA_DIR,
    llmProvider: process.env.LLM_PROVIDER,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    apiKey: process.env.IDOL_FRAME_API_KEY,
  })
}
