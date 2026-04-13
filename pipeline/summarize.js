// Gemini 2.5 Flash로 기사 목록을 한 번에 요약 + 트렌드 한 줄 추출.
// responseJsonSchema 사용으로 JSON 파싱 안정성 확보.
// 청킹: 기사 수 > CHUNK_SIZE면 여러 호출로 나눠 items 머지 (trend는 마지막 청크 것 사용).

import { GoogleGenAI, Type } from '@google/genai'
import { retry } from './lib/retry.js'

const MODEL = 'gemini-2.5-flash'
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
        },
        propertyOrdering: ['title', 'url', 'summary'],
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
각 기사를 1~2문장으로 요약하되, 기술적인 내용은 비전문가도 이해할 수 있도록 쉽게 작성해주세요.
요약 후 전체 뉴스를 관통하는 오늘의 AI 트렌드 한 줄을 마지막에 작성해주세요.

[기사 목록]
${list}`
}

async function callGemini(ai, articles) {
  const response = await retry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: buildPrompt(articles),
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: SCHEMA,
        },
      }),
    { retries: 3 },
  )
  return JSON.parse(response.text)
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
