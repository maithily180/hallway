import type { NegoMessage } from '@/lib/contracts';

export type BlockedReason = NonNullable<NegoMessage['blockedReason']>;

const INJECTION: RegExp[] = [
  /ignore\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules?|prompts?|directions?)/i,
  /disregard\s+(all\s+|your\s+|the\s+|previous\s+)*(instructions?|rules?|prompts?)/i,
  /forget\s+(all\s+|everything\s+|your\s+|the\s+|previous\s+)*(instructions?|rules?|above|prompts?)/i,
  /(reveal|tell|show|share|disclose|give|leak|print|repeat|state)\b.{0,40}\b(minimum|floor|lowest|reserve|bottom\s+price|walk[-\s]?away|limit|auto[-\s]?accept|system\s+prompt|instructions|policy|rules)/i,
  /what('| i)?s\s+(the\s+|your\s+)?(seller'?s?\s+)?(minimum|floor|lowest|reserve|bottom)/i,
  /(system|developer)\s+(prompt|message|instructions?)/i,
  /you\s+are\s+now\b|act\s+as\b|pretend\s+(to\s+be|you)|role[-\s]?play|new\s+instructions?|jailbreak|\bDAN\b/i,
  /(seller|owner|maya|admin|manager)\s+(has\s+)?(already\s+)?(said|approved|agreed|authorized|authorised|confirmed|told\s+me)/i,
  /(i|we)\s+(already|have)\s+(paid|sent|transferred)|payment\s+(was\s+)?(already\s+)?(sent|made|received)|check\s+your\s+(app|account|email)\s+(i|we)\s+paid/i,
  /(override|bypass|skip)\s+(the\s+)?(rules?|policy|floor|limit|check|guard|price)/i,
  /\[\s*(system|admin|developer)\s*\]|<\s*\/?\s*(system|instructions?)\s*>/i,
];

const OFF_PLATFORM: RegExp[] = [
  /\b(venmo|zelle|cash\s?app|cashapp|apple\s?pay|google\s?pay|paypal\.me|western\s+union|crypto|bitcoin|btc|wire\s+transfer)\b.{0,40}\b(me|us|directly|instead|outside|off)\b/i,
  /\b(pay|send|transfer)\b.{0,30}\b(outside|off)\b.{0,20}\b(app|platform|hallway)\b/i,
  /\b(pay|send)\s+(me\s+)?(in\s+)?cash\b|\bcash\s+(only|on\s+pickup|in\s+person)\b/i,
  /\b(dm|text|whatsapp|message)\s+me\b.{0,30}\b(pay|payment|number|venmo|zelle)\b/i,
];

const SCAM: RegExp[] = [
  /(overpa(y|id)|send\s+(you\s+)?(extra|more))\b.{0,60}\b(refund|send\s+back|return\s+the\s+(difference|rest|extra))/i,
  /(refund|send\s+back|return)\s+(me\s+)?the\s+(difference|extra|rest|overpayment)/i,
  /\b(urgent|immediately|right\s+now|last\s+chance)\b.{0,40}\b(or\s+i('| wi)ll|before\s+i|otherwise)\b/i,
];

/**
 * Deal guard: deterministic scan of a buyer message before anything else sees it.
 * It only flags; it never bans. Returns the first matching reason.
 */
export function scanBuyerMessage(text: string): BlockedReason | undefined {
  if (INJECTION.some((re) => re.test(text))) return 'injection';
  if (OFF_PLATFORM.some((re) => re.test(text))) return 'off_platform_payment';
  if (SCAM.some((re) => re.test(text))) return 'scam_pattern';
  return undefined;
}
