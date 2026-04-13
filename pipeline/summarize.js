// Gemini 2.5 Flash로 기사 목록을 한 번에 요약 + 트렌드 한 줄 추출.
// responseJsonSchema 사용으로 JSON 파싱 안정성 확보.
// 청킹: 기사 수 > CHUNK_SIZE면 여러 호출로 나눠 items 머지 (trend는 마지막 청크 것 사용).

import { GoogleGenAI, Type } from '@google/genai'
import { retry } from './lib/retry.js'

// Gemini는 특정 모델이 일시적으로 503 UNAVAILABLE("high demand")인 경우가 잦음.
// 첫 모델이 5회 retry 후에도 503/429면 다음 모델로 자동 fallback.
// 우선순위: 신모델(품질) → 안정신모델 → 경량 안정.
// (gemini-1.5-* 계열은 v1beta API에서 404 NOT_FOUND, 2026-04-13 검증 — 사용 X)
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]

const CHUNK_SIZE = 30

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING },
          summary: { type: Type.STRING },
          // 0~10. AI/ML 엔지니어 또는 AI 활용 개발자가 업무에 참고할 가치.
          // main.js에서 임계값 미만 기사는 발송에서 제외.
          engineeringRelevance: { type: Type.INTEGER },
        },
        propertyOrdering: ['title', 'url', 'summary', 'engineeringRelevance'],
      },
    },
    trend: { type: Type.STRING },
  },
  propertyOrdering: ['items', 'trend'],
}

function buildPrompt(articles) {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.url}`)
    .join('\n')
  return `다음은 오늘 수집된 AI 관련 뉴스 목록입니다.

각 기사에 대해 다음을 수행하세요:
1. 1~2문장 요약 (기술 내용은 비전문가도 이해할 수 있게 쉽게)
2. engineeringRelevance 0~10 점수 채점 — AI/ML 엔지니어 또는 AI 활용 개발자가 업무에 직접 참고할 가치가 얼마나 있는가

[채점 기준]
- 9~10: 모델 릴리즈/업데이트, 신규 API·SDK·CLI, 오픈소스 도구, 벤치마크/평가, 아키텍처·기법(RAG·에이전트·파인튜닝·컨텍스트 윈도우 등), 코드 사례, 인프라·서빙·MCP
- 6~8: 기술 컨셉 해설, 도구 비교, 보안·프라이버시, 실제 적용 사례 분석, 개발 워크플로우·생산성
- 3~5: AI 일반론, 산업 동향, 사용 후기 단편, 비기술 적용 사례
- 0~2: 단순 가격/플랜 공지, 마케팅, VC 펀딩·밸류에이션, 정치·규제·거시경제, 비AI 주제

요약 후 전체 뉴스를 관통하는 오늘의 AI 트렌드 한 줄을 마지막에 작성해주세요.

[기사 목록]
${list}`
}

function isModelUnavailable(err) {
  const code = err?.status ?? err?.code
  return code === 503 || code === 429 || code === 'UNAVAILABLE' || code === 'RESOURCE_EXHAUSTED'
}

async function callGemini(ai, articles) {
  let lastErr
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      // 모델당 retry 5회, baseDelay 2s → 누적 대기 2+4+8+16 = 30초.
      const response = await retry(
        () =>
          ai.models.generateContent({
            model,
            contents: buildPrompt(articles),
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: SCHEMA,
            },
          }),
        { retries: 5, baseDelay: 2000 },
      )
      console.log(`[summarize] 사용 모델: ${model}`)
      return JSON.parse(response.text)
    } catch (err) {
      lastErr = err
      if (isModelUnavailable(err)) {
        console.warn(
          `[summarize] ${model} 사용 불가 (status=${err?.status ?? err?.code}), 다음 모델 시도`,
        )
        continue
      }
      // 모델 가용성 외 에러(인증 실패 등)는 즉시 throw — fallback 의미 없음
      throw err
    }
  }
  throw new Error(
    `[summarize] 모든 fallback 모델 사용 불가 (${MODEL_FALLBACK_CHAIN.join(', ')}): ${lastErr?.message ?? lastErr}`,
  )
}

/**
 * @typedef {{ title: string, url: string, summary: string }} SummarizedItem
 * @typedef {{ items: SummarizedItem[], trend: string }} SummaryResult
 */

/**
 * @param {import('./lib/article.js').Article[]} articles
 * @returns {Promise<SummaryResult>}
 */
export async function summarize(articles) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 누락')
  if (articles.length === 0) return { items: [], trend: '' }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  if (articles.length <= CHUNK_SIZE) {
    return await callGemini(ai, articles)
  }

  // 30개 초과: 청크 단위로 호출, items는 머지, trend는 마지막 것
  const allItems = []
  let trend = ''
  for (let i = 0; i < articles.length; i += CHUNK_SIZE) {
    const chunk = articles.slice(i, i + CHUNK_SIZE)
    const result = await callGemini(ai, chunk)
    allItems.push(...result.items)
    trend = result.trend
  }
  return { items: allItems, trend }
}
