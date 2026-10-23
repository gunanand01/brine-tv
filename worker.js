/**
 * Brinetv — Cloudflare Worker HLS (.m3u8 & .ts/.m4s) CORS Proxy
 *
 * Usage:
 *   https://brinetv-proxy.brinetube.workers.dev/?url=<encoded-stream-url>
 *
 * Features:
 * 1. Reads target stream URL from `?url=` query parameter.
 * 2. Adds `Access-Control-Allow-Origin: *` and handles OPTIONS preflight requests.
 * 3. Detects `.m3u8` master/media playlists and rewrites all relative & absolute
 *    segment URLs (.ts, .m4s, .aac), variant `.m3u8` URLs, and `URI="..."` attributes
 *    (such as #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA) to route through this Worker proxy.
 * 4. Streams binary media segments (.ts, .m4s, .mp4) directly with Range header support.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Origin, Accept, Content-Type, Authorization, X-Requested-With',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
};

/**
 * Wraps an absolute target URL into a proxied Worker URL.
 */
function toProxyUrl(workerOrigin, targetUrl, customReferer = '') {
  const proxyUrl = new URL(workerOrigin);
  proxyUrl.searchParams.set('url', targetUrl);
  if (customReferer) {
    proxyUrl.searchParams.set('referer', customReferer);
  }
  return proxyUrl.toString();
}

/**
 * Rewrites all child playlist URLs, segment URLs, and URI="..." attributes inside an M3U8 manifest
 * so every subsequent request also flows through the Cloudflare Worker proxy.
 */
function rewriteM3u8Manifest(manifestText, baseStreamUrl, workerOrigin, customReferer = '') {
  const lines = manifestText.split(/\r?\n/);

  const rewrittenLines = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return rawLine;

    // 1. Handle HLS tags that contain URI="..." (e.g. #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA)
    if (line.startsWith('#')) {
      if (line.includes('URI="')) {
        return rawLine.replace(/URI="([^"]+)"/gi, (_match, uriValue) => {
          try {
            const absoluteUri = new URL(uriValue, baseStreamUrl).href;
            return `URI="${toProxyUrl(workerOrigin, absoluteUri, customReferer)}"`;
          } catch (_err) {
            return _match;
          }
        });
      }
      return rawLine;
    }

    // 2. Non-comment lines are segment URLs (.ts, .m4s, .aac) or variant .m3u8 playlists
    try {
      const absoluteSegmentUrl = new URL(line, baseStreamUrl).href;
      return toProxyUrl(workerOrigin, absoluteSegmentUrl, customReferer);
    } catch (_err) {
      return rawLine;
    }
  });

  return rewrittenLines.join('\n');
}

export default {
  async fetch(request) {
    // 1. Handle CORS Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const requestUrl = new URL(request.url);
    const workerOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
    const targetUrlParam = requestUrl.searchParams.get('url');
    const customReferer = requestUrl.searchParams.get('referer') || '';

    if (!targetUrlParam) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'Brinetv Cloudflare Worker CORS Proxy',
          usage: `${workerOrigin}/?url=<encoded-m3u8-or-ts-url>`,
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrlParam);
      if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
        throw new Error('Unsupported protocol');
      }
    } catch (_err) {
      return new Response('Invalid target URL parameter', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // 2. Build upstream request headers (forward Range and spoof standard browser headers)
    const upstreamHeaders = new Headers();
    upstreamHeaders.set(
      'User-Agent',
      request.headers.get('User-Agent') ||
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    upstreamHeaders.set('Accept', '*/*');
    upstreamHeaders.set('Referer', customReferer || `${parsedTarget.origin}/`);
    upstreamHeaders.set('Origin', customReferer ? new URL(customReferer).origin : parsedTarget.origin);

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upstreamHeaders.set('Range', rangeHeader);
    }

    try {
      const upstreamResponse = await fetch(parsedTarget.href, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
      });

      const finalUpstreamUrl = upstreamResponse.url || parsedTarget.href;
      const contentType = (upstreamResponse.headers.get('Content-Type') || '').toLowerCase();

      const isM3u8 =
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl') ||
        /\.m3u8(\?.*)?$/i.test(finalUpstreamUrl) ||
        /\.m3u8(\?.*)?$/i.test(parsedTarget.pathname);

      // 3. If response is an .m3u8 playlist, rewrite all internal segment & variant URLs
      if (isM3u8 && request.method !== 'HEAD' && upstreamResponse.ok) {
        const rawText = await upstreamResponse.text();
        if (rawText.trimStart().startsWith('#EXTM3U')) {
          const rewrittenPlaylist = rewriteM3u8Manifest(
            rawText,
            finalUpstreamUrl,
            workerOrigin,
            customReferer
          );

          return new Response(rewrittenPlaylist, {
            status: upstreamResponse.status,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          });
        }

        // Fallback if text wasn't an M3U8 manifest
        return new Response(rawText, {
          status: upstreamResponse.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': contentType || 'text/plain; charset=utf-8',
          },
        });
      }

      // 4. For binary media segments (.ts, .m4s, .mp4, .aac), stream body directly with CORS headers
      const responseHeaders = new Headers(CORS_HEADERS);
      const passthroughHeaders = [
        'Content-Type',
        'Content-Length',
        'Content-Range',
        'Accept-Ranges',
        'Cache-Control',
      ];
      passthroughHeaders.forEach((headerName) => {
        const val = upstreamResponse.headers.get(headerName);
        if (val) responseHeaders.set(headerName, val);
      });

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'Upstream stream fetch failed',
          details: err?.message || 'Unknown error',
        }),
        {
          status: 502,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }
  },
};
