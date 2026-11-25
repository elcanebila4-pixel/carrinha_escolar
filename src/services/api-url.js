const configuredApiBase = String(
  import.meta.env.VITE_API_BASE_URL || 'https://carrinha-escolar.onrender.com/api'
).replace(/\/+$/, '')

export function apiUrl(path) {
  const normalizedPath = `/${String(path).replace(/^\/+/, '')}`

  if (
    configuredApiBase.endsWith('/api') &&
    normalizedPath.startsWith('/api/')
  ) {
    return `${configuredApiBase}${normalizedPath.slice(4)}`
  }

  return `${configuredApiBase}${normalizedPath}`
}

export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers)
  const sessionToken = globalThis.localStorage?.getItem(
    'carrinha_api_session_token'
  )
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`)
  }

  return fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: options.credentials || 'include'
  })
}
