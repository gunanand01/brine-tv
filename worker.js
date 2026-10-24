/**
 * Brinetv V6 — Smart Famelack/Cricfy-Style Cloudflare Worker HLS Proxy
 * Deployed URL: https://brinetv-proxy.brinetube.workers.dev/
 *
 * Key Capabilities:
 * 1. Header Spoofing: Uses latest Chrome 131 User-Agent + Sec-Ch-Ua client hints,
 *    and sets Referer & Origin to the target stream URL's domain (`parsedTarget.origin`).
 * 2. Smart 403/404 Bypass: If the IPTV server returns 403 or 404 (blocking standard
 *    proxy headers), automatically retries with stripped headers (removing X-Forwarded-For,
 *    Origin, Referer) and alternate Mobile Chrome / OTT Player User-Agents.
 * 3. Deep M3U8 Rewriting: Rewrites all relative & absolute child .m3u8 playlists,
 *    .ts/.m4s segments, and URI="..." tags (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA)
 *    to route through this Worker with `Access-Control-Allow-Origin: *`.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Origin, Accept, Content-Type, Authorization, X-Requested-With',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
};

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHROME_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const OTT_PLAYER_UA =
  'ExoPlayerLib/2.19.1 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
 * Rewrites all child playlist URLs, segment URLs, and URI="..." attributes inside an M3U8 manifest.
 */
function rewriteM3u8Manifest(manifestText, baseStreamUrl, workerOrigin, customReferer = '') {
  const lines = manifestText.split(/\r?\n/);

  const rewrittenLines = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return rawLine;

    // 1. Rewrite URI="..." inside #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.
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

    // 2. Rewrite non-comment lines (variant .m3u8 playlists or .ts/.m4s/.aac segments)
    try {
      const absoluteSegmentUrl = new URL(line, baseStreamUrl).href;
      return toProxyUrl(workerOrigin, absoluteSegmentUrl, customReferer);
    } catch (_err) {
      return rawLine;
    }
  });

  return rewrittenLines.join('\n');
}

/**
 * Builds clean upstream headers for each retry profile, ensuring X-Forwarded-For
 * and proxy-leaking headers are never sent.
 */
function buildSpoofedHeaders(parsedTarget, rangeHeader, customReferer, profileIndex = 0) {
  const targetOrigin = customReferer ? new URL(customReferer).origin : parsedTarget.origin;
  const targetReferer = customReferer || `${parsedTarget.origin}/`;

  const headers = new Headers();

  if (profileIndex === 0) {
    // Profile 0: Latest Chrome 131 Desktop + Target Domain Referer & Origin
    headers.set('User-Agent', CHROME_DESKTOP_UA);
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6');
    headers.set('Referer', targetReferer);
    headers.set('Origin', targetOrigin);
    headers.set('Sec-Ch-Ua', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"');
    headers.set('Sec-Ch-Ua-Mobile', '?0');
    headers.set('Sec-Ch-Ua-Platform', '"Windows"');
    headers.set('Sec-Fetch-Dest', 'empty');
    headers.set('Sec-Fetch-Mode', 'cors');
    headers.set('Sec-Fetch-Site', 'same-site');
  } else if (profileIndex === 1) {
    // Profile 1 (403/404 Bypass): Strip Origin & X-Forwarded-For, keep only Referer + Mobile Chrome UA
    headers.set('User-Agent', CHROME_MOBILE_UA);
    headers.set('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, */*');
    headers.set('Accept-Language', 'en-IN,en;q=0.9');
    headers.set('Referer', targetReferer);
  } else {
    // Profile 2 (403/404 Deep Bypass): Strip Origin, Referer, and X-Forwarded-For completely; use OTT Player UA
    headers.set('User-Agent', OTT_PLAYER_UA);
    headers.set('Accept', '*/*');
    headers.set('Connection', 'keep-alive');
  }

  // Ensure X-Forwarded-For / CF headers are explicitly absent
  headers.delete('X-Forwarded-For');
  headers.delete('X-Real-IP');
  headers.delete('CF-Connecting-IP');

  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }

  return headers;
}

/**
 * Fetches upstream URL with automatic 403/404 bypass retries across 3 header profiles.
 */
async function fetchWithSmartBypass(targetHref, method, rangeHeader, customReferer) {
  const parsedTarget = new URL(targetHref);
  let lastResponse = null;

  for (let profile = 0; profile < 3; profile++) {
    const upstreamHeaders = buildSpoofedHeaders(parsedTarget, rangeHeader, customReferer, profile);

    const response = await fetch(parsedTarget.href, {
      method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    lastResponse = response;

    // If upstream succeeded (not 403/404/401), return immediately
    if (response.status !== 403 && response.status !== 404 && response.status !== 401) {
      return response;
    }
  }

  return lastResponse;
}

export default {
  async fetch(request) {
    // 1. Handle CORS Preflight
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
          service: 'Brinetv V6 Smart Cloudflare Worker Proxy',
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

    const rangeHeader = request.headers.get('Range') || '';
    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';

    try {
      const upstreamResponse = await fetchWithSmartBypass(
        parsedTarget.href,
        method,
        rangeHeader,
        customReferer
      );

      const finalUpstreamUrl = upstreamResponse.url || parsedTarget.href;
      const contentType = (upstreamResponse.headers.get('Content-Type') || '').toLowerCase();

      const isM3u8 =
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl') ||
        /\.m3u8(\?.*)?$/i.test(finalUpstreamUrl) ||
        /\.m3u8(\?.*)?$/i.test(parsedTarget.pathname);

      // 2. Rewrite .m3u8 playlists so all internal segments & child playlists also route via Worker
      if (isM3u8 && method !== 'HEAD' && upstreamResponse.ok) {
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

        return new Response(rawText, {
          status: upstreamResponse.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': contentType || 'text/plain; charset=utf-8',
          },
        });
      }

      // 3. Stream binary segments (.ts, .m4s, .mp4, .aac) directly
      const responseHeaders = new Headers(CORS_HEADERS);
      [
        'Content-Type',
        'Content-Length',
        'Content-Range',
        'Accept-Ranges',
        'Cache-Control',
      ].forEach((headerName) => {
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
