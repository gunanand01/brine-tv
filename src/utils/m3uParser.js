import fallbackChannels from '../data/fallbackChannels.json';

export const IPTV_INDIA_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/countries/in.m3u';

export const CORE_CATEGORIES = [
  'All',
  'Pinned',
  'News',
  'Entertainment',
  'Sports',
  'Movies',
  'Music',
  'Kids',
  'Devotional',
  'Regional',
];

export const INDIAN_LANGUAGES = [
  'All Languages',
  'Hindi',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
  'Odia',
  'Bhojpuri',
  'English',
];

/**
 * Generates 2-letter uppercase initials for a channel name when its logo fails to load.
 * Example: 'Aaj Tak' -> 'AT', 'DD India' -> 'DI', '9XM' -> '9X'
 */
export function getChannelInitials(name = '') {
  const cleaned = String(name || 'TV')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  if (!cleaned) return 'TV';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function inferIndianLanguage(name = '', groupTitle = '', tvgId = '') {
  const combined = `${name} ${groupTitle} ${tvgId}`.toLowerCase();
  if (/tamil|puthiya|thanthi|polimer|sun\b|kalaignar|jaya|adithya|sirippoli|isaiaruvi|murasu|raj\s*tv|makkal|vasanth/i.test(combined)) return 'Tamil';
  if (/telugu|sakshi|eenadu|etv\s*telugu|tv9\s*telugu|ntv|v6|abn|tv5|maa\b|gemini|vanitha/i.test(combined)) return 'Telugu';
  if (/malayalam|asianet|manorama|mathrubhumi|kairali|amrita|mazhavil|surya|flowers|twentyfour|24\s*news|reporter|janam|mediaone|kaumudy/i.test(combined)) return 'Malayalam';
  if (/kannada|suvarna|udaya|public\s*tv|tv9\s*kannada|digvijaya|kasturi|power\s*tv|btv/i.test(combined)) return 'Kannada';
  if (/bengali|bangla|ananda|jalsha|zee\s*bangla|sangeet\s*bangla|aakash\s*aath|r\s*plus|kolkata\s*tv|rupashi/i.test(combined)) return 'Bengali';
  if (/marathi|majha|lokmat|saam|zee\s*talkies|fakt\s*marathi|sangeet\s*marathi|jai\s*maharashtra|pudhari/i.test(combined)) return 'Marathi';
  if (/punjabi|ptc|mh1|chardikla|baani|pitaara|9x\s*tashan|jus\s*punjabi/i.test(combined)) return 'Punjabi';
  if (/gujarati|asmita|sandesh|tv9\s*gujarati|vtv\s*gujarati|gstv/i.test(combined)) return 'Gujarati';
  if (/odia|odisha|otv|kanak|kalinga|argus|prameya|tarang|alankar|prarthana/i.test(combined)) return 'Odia';
  if (/bhojpuri|bihari|kashish|filamchi|oscar|dabangg|sangam|b4u\s*bhojpuri/i.test(combined)) return 'Bhojpuri';
  if (/india\s*today|ndtv\s*24x7|dd\s*india|wion|mirror\s*now|times\s*now|cnbc\s*tv18|et\s*now/i.test(combined)) return 'English';
  return 'Hindi';
}

export function normalizeCategory(rawGroup = '', name = '', language = 'Hindi') {
  const combined = `${rawGroup} ${name}`.toLowerCase();
  if (/sport|cricket|kabaddi|khel|dd\s*sports|star\s*sports|sony\s*ten|fancode/i.test(combined)) return 'Sports';
  if (/kid|cartoon|animation|nick|pogo|hungama|gubbare|chumbak|sonic|discovery\s*kids|sony\s*yay/i.test(combined)) return 'Kids';
  if (/religio|devotion|spiritual|aastha|sanskar|satsang|bhajan|peace\s*of\s*mind|ishwar|sadhna|shubh|darshan|simran|prarthana/i.test(combined)) return 'Devotional';
  if (/music|song|9xm|mastiii|mtv|vh1|zing|jalwa|tashan|jhakaas|sangeet|isaiaruvi|melody|tune|beats|b4u\s*music/i.test(combined)) return 'Music';
  if (/movie|cinema|film|bollywood|talkies|goldmines|b4u\s*movies|b4u\s*kadak|pictures|action|max\b|zee\s*cinema|star\s*gold|filamchi/i.test(combined)) return 'Movies';
  if (/news|samachar|khabar|varta|headlines|business|cnbc|ndtv|aaj\s*tak|abp|republic|tv9|india\s*today|zee\s*news|dd\s*news|sansad|times\s*now|wion/i.test(combined)) {
    if (!['Hindi', 'English'].includes(language) && !/national|india/i.test(name)) return 'Regional';
    return 'News';
  }
  if (!['Hindi', 'English'].includes(language)) return 'Regional';
  return 'Entertainment';
}

export function parseM3UPlaylist(m3uText) {
  if (!m3uText || typeof m3uText !== 'string') return [];

  const lines = m3uText.split(/\r?\n/);
  const channels = [];
  let currentMeta = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
      const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupTitleMatch = line.match(/group-title="([^"]*)"/i);

      const commaIndex = line.lastIndexOf(',');
      const rawName = commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : 'Indian TV Channel';
      const isHD = /\b(1080p|720p|HD|FHD)\b/i.test(rawName);
      const cleanName = rawName
        .replace(/\s*\(\d+p\)/gi, '')
        .replace(/\s*\[(Geo-blocked|Not 24\/7|720p|1080p|576p|480p|360p)\]/gi, '')
        .trim();

      const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';
      const rawGroup = groupTitleMatch ? groupTitleMatch[1].trim() : '';
      const logo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
      const language = inferIndianLanguage(cleanName, rawGroup, tvgId);
      const category = normalizeCategory(rawGroup, cleanName, language);

      currentMeta = {
        tvgId,
        name: cleanName || rawName,
        logo,
        rawGroup,
        language,
        category,
        isHD,
      };
    } else if (!line.startsWith('#') && currentMeta) {
      if (/^https?:\/\//i.test(line)) {
        const slug = (currentMeta.tvgId || currentMeta.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        channels.push({
          id: `iptv-${slug}-${channels.length}`,
          name: currentMeta.name,
          category: currentMeta.category,
          language: currentMeta.language,
          logo: currentMeta.logo || '',
          streamUrl: line,
          network: currentMeta.rawGroup || 'IPTV-org India',
          isHD: currentMeta.isHD,
          source: 'iptv-org',
        });
      }
      currentMeta = null;
    }
  }

  return channels;
}

export async function fetchAndMergeIndianChannels() {
  const curated = fallbackChannels.map((ch) => ({
    ...ch,
    source: 'curated',
  }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(IPTV_INDIA_PLAYLIST_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const m3uText = await response.text();
    const parsedLive = parseM3UPlaylist(m3uText);

    if (!parsedLive.length) {
      return {
        channels: curated,
        liveCount: 0,
        status: 'fallback',
      };
    }

    const seenNames = new Set(curated.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const seenUrls = new Set(curated.map((c) => c.streamUrl));

    const uniqueLive = [];
    for (const item of parsedLive) {
      const normName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenUrls.has(item.streamUrl) && !seenNames.has(normName)) {
        seenNames.add(normName);
        seenUrls.add(item.streamUrl);
        uniqueLive.push(item);
      }
    }

    return {
      channels: [...curated, ...uniqueLive],
      liveCount: parsedLive.length,
      status: 'live',
    };
  } catch (_error) {
    return {
      channels: curated,
      liveCount: 0,
      status: 'offline-fallback',
    };
  }
}
