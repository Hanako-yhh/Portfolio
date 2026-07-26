const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function withBase(path = ''): string {
  return `${baseUrl}${path.replace(/^\/+/, '')}`;
}

export function withoutBase(pathname: string): string {
  const basePath = baseUrl === '/' ? '' : baseUrl.slice(0, -1);

  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return pathname;
}
