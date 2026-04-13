// 외부 API 호출용 재시도 헬퍼.
//   기본 max 3회, exponential backoff: 500ms → 1s → 2s.
//   마지막 시도까지 실패하면 마지막 에러를 throw.

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, baseDelay?: number }} [options]
 * @returns {Promise<T>}
 */
export async function retry(fn, { retries = 3, baseDelay = 500 } = {}) {
  let lastErr
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}
