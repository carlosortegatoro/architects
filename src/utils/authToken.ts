export function authTokenFromLocation(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
  return token?.trim() || null
}
