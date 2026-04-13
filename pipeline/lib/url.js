// URL 정규화: 중복 제거의 안정적인 키를 만들기 위함.
//   - hostname 소문자
//   - hash 제거
//   - 모든 query string 제거 (뉴스 URL은 query 거의 없고, 있으면 보통 트래킹)
//   - 끝 슬래시 제거 (단, 루트 '/'는 유지)
// 파싱 실패하면 원본을 그대로 반환 (방어적).

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    u.hash = ''
    u.search = ''
    let pathname = u.pathname
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }
    u.pathname = pathname
    return u.toString()
  } catch {
    return raw
  }
}
