import type { Cents } from "@/lib/contracts";

const CHANNEL3_URL = "https://api.trychannel3.com/v1/search";

type Channel3Response = {
  products?: { offers?: { price?: { price?: number; currency?: string } }[] }[];
};

/** Median USD offer price in cents from a Channel3 search response, or undefined. */
export function medianUsdCents(res: Channel3Response): Cents | undefined {
  const prices = (res.products ?? [])
    .flatMap((p) => p.offers?.slice(0, 1) ?? [])
    .map((o) => o.price)
    .filter((p) => p?.currency === "USD" && typeof p.price === "number" && p.price > 0)
    .map((p) => Math.round(p!.price! * 100))
    .sort((a, b) => a - b);
  if (prices.length === 0) return undefined;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

/** New-price anchor from Channel3; undefined when there is no key, no result or an error. */
export async function lookupNewPrice(query: string, fetchFn: typeof fetch = fetch): Promise<Cents | undefined> {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key || process.env.MOCK_LLM === "1") return undefined;
  try {
    const res = await fetchFn(CHANNEL3_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ query, limit: 10 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    return medianUsdCents((await res.json()) as Channel3Response);
  } catch {
    return undefined;
  }
}
