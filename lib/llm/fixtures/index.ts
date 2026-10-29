import inspection from "./inspection.json";
import listingDraft from "./listingDraft.json";
import parsedOffer from "./parsedOffer.json";
import want from "./want.json";

/** JSON fixtures returned by llm.json / llm.vision when MOCK_LLM=1, keyed by CallOpts.name. */
export const fixtures = { listingDraft, want, inspection, parsedOffer } as const;

/** Text fixtures returned by llm.text when MOCK_LLM=1. */
export const textFixtures: Record<string, string> = {
  priceExplanation: "Similar projectors cost about $300 new; in good condition, $40/day with a $150 deposit rents fast.",
  phrase: "Thanks for the offer! I can do $36 for the night, HDMI cable included.",
};
