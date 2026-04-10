import { XMLParser } from "fast-xml-parser";

const YT_API = "https://www.googleapis.com/youtube/v3";
const RSS = "https://www.youtube.com/feeds/videos.xml";

export type FeedVideo = {
  videoId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
};

export async function fetchSubscriptionChannelIds(
  accessToken: string
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${YT_API}/subscriptions`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouTube subscriptions failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      items?: Array<{
        snippet?: { resourceId?: { channelId?: string } };
      }>;
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      const cid = item.snippet?.resourceId?.channelId;
      if (cid) ids.push(cid);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) => tagName === "entry" || tagName === "link",
});

function textContent(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) {
    return String((v as { "#text": string })["#text"]);
  }
  return "";
}

function extractVideoId(entry: Record<string, unknown>): string | undefined {
  const direct = entry["yt:videoId"];
  if (typeof direct === "string") return direct;
  const id = entry.id;
  if (typeof id === "string") {
    const m = id.match(/video:(.+)/);
    if (m) return m[1];
  }
  const links = entry.link;
  const linkArr = Array.isArray(links) ? links : links ? [links] : [];
  for (const l of linkArr) {
    if (l && typeof l === "object" && "@_href" in l) {
      const href = (l as { "@_href"?: string; "@_rel"?: string })["@_href"];
      const rel = (l as { "@_rel"?: string })["@_rel"];
      if (href && (!rel || rel === "alternate")) {
        const m = href.match(/[?&]v=([^&]+)/);
        if (m) return m[1];
      }
    }
  }
  return undefined;
}

type ThumbPick = { url: string; width: number; height: number };

function pickBestThumbnail(entry: Record<string, unknown>): ThumbPick | undefined {
  const mg = entry["media:group"] as Record<string, unknown> | undefined;
  if (!mg) return undefined;
  const thumbs = mg["media:thumbnail"];
  const arr = Array.isArray(thumbs) ? thumbs : thumbs ? [thumbs] : [];
  let best: ThumbPick | undefined;
  let bestArea = -1;
  for (const t of arr) {
    if (t && typeof t === "object" && "@_url" in t) {
      const w = Number((t as { "@_width"?: string })["@_width"] ?? 0);
      const h = Number((t as { "@_height"?: string })["@_height"] ?? 0);
      const url = (t as { "@_url"?: string })["@_url"];
      if (!url || !Number.isFinite(w) || !Number.isFinite(h)) continue;
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = { url, width: w, height: h };
      }
    }
  }
  return best;
}

/** RSS uses /shorts/VIDEO_ID for Shorts and /watch?v= for normal uploads (thumbnails are often 480×360 for both). */
function extractChannelTitle(entry: Record<string, unknown>): string {
  const author = entry.author;
  if (author && typeof author === "object" && "name" in author) {
    const n = (author as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
    const t = textContent(n).trim();
    if (t) return t;
  }
  return "Unknown channel";
}

function entryAlternateLinkIsShort(entry: Record<string, unknown>): boolean {
  const links = entry.link;
  const linkArr = Array.isArray(links) ? links : links ? [links] : [];
  for (const l of linkArr) {
    if (l && typeof l === "object" && "@_href" in l) {
      const href = (l as { "@_href"?: string; "@_rel"?: string })["@_href"];
      const rel = (l as { "@_rel"?: string })["@_rel"];
      if (rel === "alternate" && href?.includes("/shorts/")) {
        return true;
      }
    }
  }
  return false;
}

function parseFeedEntries(xml: string): FeedVideo[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const feed = (parsed.feed ?? rss?.channel) as
    | Record<string, unknown>
    | undefined;
  if (!feed) return [];
  const entries = feed.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const out: FeedVideo[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (entryAlternateLinkIsShort(e)) continue;
    const videoId = extractVideoId(e);
    if (!videoId) continue;

    const titleRaw = e.title;
    const title =
      typeof titleRaw === "string"
        ? titleRaw
        : textContent(titleRaw).trim() || "Untitled";
    const published = (e.published ?? e.updated) as string | undefined;
    const picked = pickBestThumbnail(e);
    const thumb =
      picked?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    out.push({
      videoId,
      channelTitle: extractChannelTitle(e),
      title,
      thumbnailUrl: thumb,
      publishedAt: published ?? new Date().toISOString(),
    });
  }
  return out;
}

const MAX_PER_CHANNEL = 15;
const BATCH = 12;
const MAX_TOTAL = 100;

export async function buildSubscriptionFeed(
  accessToken: string
): Promise<FeedVideo[]> {
  const channelIds = await fetchSubscriptionChannelIds(accessToken);
  if (channelIds.length === 0) return [];

  const merged: FeedVideo[] = [];
  for (let i = 0; i < channelIds.length; i += BATCH) {
    const batch = channelIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((channelId) => fetchChannelRss(channelId))
    );
    for (const list of results) {
      merged.push(...list.slice(0, MAX_PER_CHANNEL));
    }
  }

  const seen = new Set<string>();
  const deduped: FeedVideo[] = [];
  for (const v of merged) {
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    deduped.push(v);
  }

  deduped.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  return deduped.slice(0, MAX_TOTAL);
}

async function fetchChannelRss(channelId: string): Promise<FeedVideo[]> {
  const url = `${RSS}?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedEntries(xml);
  } catch {
    return [];
  }
}
