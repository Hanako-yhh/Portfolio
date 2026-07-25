const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') {
      return response;
    }

    const url = new URL(request.url);
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    const hasFileExtension = /\.[a-z0-9]+$/i.test(url.pathname);

    if (!acceptsHtml || hasFileExtension) {
      return response;
    }

    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  },
};

export default worker;
