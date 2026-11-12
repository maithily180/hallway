# Submission (Devpost)

Deadline: **Nov 12, 12:00 PM PST = Nov 13, 1:30 AM IST**. Our own cutoff: Nov 12, 11:00 PM IST. Maithily submits as Representative.

## Checklist

| Item | Owner | Status |
| --- | --- | --- |
| PR #1 (PayPal, deals, negotiation) merged to `main` | M | open |
| Repo public | M | private |
| `LICENSE` (MIT) on `main` | M | on m/spike only |
| `README.md` with run steps on `main` | M | on m/spike only |
| Hosted demo URL (Render) | M | – |
| Video under 3 min, public on YouTube, no copyrighted music | C | – |
| Survey numbers for the "problem" section | C | – |
| Thumbnail (3:2) and gallery images | C | thumbnail in `NOTES/devpost/` |
| Text: `hallway-briefs/DEVPOST.md` (on m/spike) + the section below | M + C | draft |

## Listings & Intelligence text for DEVPOST.md

Paste into "What it does" (after "Ask in plain words"):

- **Snap to list:** photos in, listing out. The Lister reads the photos, names visible wear ("light scuff on the top cover") and asks about anything it can't see instead of inventing accessories.
- **Prices you can check:** the Pricer computes every number in code (new-price anchor × category depreciation × condition, then urgency) and shows a fast-sale and a best-price option, plus rent per day and a deposit. The model only writes the one-line explanation from those numbers.
- **Buy, rent or borrow?** On matches, an advisor does the math: "Rent it: $40 for 1 day versus $300 to buy. Buying only pays off if you need it for 8 days or more."
- **Wanted board and demand scout:** requests nobody can fill yet are ranked by how many people asked. Owners see "1 person looked for a bike; you're renting yours at $10/day" and a count on their My Stuff tab.
- **Photo-checked returns:** the Inspector compares before and after photos, boxes new damage, and proposes a deduction. It only proposes: the amount is capped at the deposit and is zero when it's less than 60% sure.
- **Move-out mode:** one video of your room becomes a draft per item (duplicates and unsure frames dropped), priced for a fast sale and listed together with floors at 80%.
- **Owner calendar:** each item is a row and each rental a bar (Bryntum Scheduler), with earnings from settled deals.

Paste into "How we built it":

**Numbers in code, words from the model.** Every agent output (listing draft, parsed request, inspection) is validated against a zod schema; a bad answer is retried once, then replaced by a safe fallback (a draft that asks "Please describe the item", an inspection with no deduction). Matches are ranked by a documented score (price fit, availability, condition, owner reliability, needs met) with a plain-language reason for each. `MOCK_LLM=1` serves fixtures for every agent, so the whole app runs with no keys.

## Video shot list (Chandrani's segments)

1. Snap to list: photos → draft with known wear → missing-info question.
2. Price card: fast sale vs best price, rent and deposit → set floor ("Hallway never reveals this").
3. Leo asks "a projector tomorrow night under $35 with HDMI" → matches with reasons → advisor.
4. (Maithily) negotiation, PayPal authorization, handover.
5. Return: InspectionCard before/after, proposed deduction.
6. My Stuff: calendar with the rental, demand scout tip.

## Links (fill in)

- Repo:
- Hosted demo:
- Video:
