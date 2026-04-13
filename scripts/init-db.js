// Turso의 subscribers 테이블을 멱등하게 생성한다.
// 실행: node scripts/init-db.js
//
// 환경변수: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (.env에 채운 후 실행)

import 'dotenv/config'
import { createClient } from '@libsql/client'

const REQUIRED = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']

const SCHEMA = `
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

async function main() {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[init-db] 필수 환경변수 누락: ${missing.join(', ')}`)
    console.error('         .env 파일에 채운 후 다시 실행하세요.')
    process.exit(1)
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  try {
    await client.execute(SCHEMA)
    console.log('[init-db] subscribers 테이블 준비 완료 ✅')
  } catch (err) {
    console.error('[init-db] 실패:', err.message ?? err)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
