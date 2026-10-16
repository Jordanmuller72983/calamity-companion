// Admin key for managing (deleting) reports. Set once on a device by opening the app with ?admin=<key>;
// kept on that device only. The server checks it against the ADMIN_KEY environment variable.

const STORAGE_KEY = 'cc.adminKey'

export function getAdminKey(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('admin')
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl)
      const url = new URL(window.location.href)
      url.searchParams.delete('admin')
      window.history.replaceState(null, '', url)
    }
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function forgetAdminKey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing stored
  }
}
