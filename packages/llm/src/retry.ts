export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const status = (err as any)?.status ?? (err as any)?.statusCode
      // Only retry on transient errors
      if (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('ECONNRESET')
      ) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
      }
      throw lastError
    }
  }
  throw lastError!
}
