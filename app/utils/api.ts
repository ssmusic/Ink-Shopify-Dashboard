export async function fetchWithAppBridge(shopify: any, path: string, options: RequestInit = {}) {
  const token = await shopify.idToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  
  return fetch(path, {
    ...options,
    headers
  });
}
