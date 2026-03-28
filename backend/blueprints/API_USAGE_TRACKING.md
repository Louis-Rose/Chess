# Gemini API Usage Tracking

## What we track

Every Gemini API call from the scoresheet/diagram features is logged to the `api_usage` table with:

| Field | Description |
|-------|-------------|
| `request_id` | Groups all model calls from one feature invocation (e.g. one scoresheet read = 3 model calls sharing one ID) |
| `feature` | `scoresheet`, `reread`, or `diagram` |
| `model_id` | Which Gemini model was called |
| `input_tokens` | Prompt tokens (text + image) |
| `output_tokens` | Generated response tokens |
| `thinking_tokens` | Internal reasoning tokens (billed at output rate) |
| `elapsed_seconds` | Wall-clock time |
| `error` | Error message if the call failed |

## Models used

Each scoresheet or diagram read fires **3 models in parallel**:

| Model | Input/1M | Output/1M | Free tier |
|-------|----------|-----------|-----------|
| `gemini-3-flash-preview` | $0.50 | $3.00 | Yes (rate-limited) |
| `gemini-3.1-pro-preview` | $2.00 | $12.00 | **No** |
| `gemini-3.1-flash-lite-preview` | $0.25 | $1.50 | Yes (rate-limited) |

A re-read uses a single user-selected model.

## Cost estimation accuracy

**The costs shown in the admin panel are the best estimates we can produce, but not exact charges.**

### Why we can't know the exact cost

The Gemini API does **not** include any billing indicator in its responses. There is no `is_free`, `billing_tier`, or `cost` field. Google confirmed there is no programmatic way to determine whether a specific API call was free or paid.

Free tier quotas are **rate-based** (requests per minute / per day), not volume-based. On a paid API key, calls that exceed the free quota are silently billed instead of being rejected with a 429. There is no way to know whether a given call fell within or outside the free quota.

### Our billing setup

We use a **paid Google Cloud API key** (Paid tier 1, project "Lumna"). All three models are billed — even those with a "free tier", because the free quotas are easily exceeded during development and testing.

### Actual billing breakdown (March 2026)

Scraped from [aistudio.google.com/spend](https://aistudio.google.com/spend) on 2026-03-28:

| Model | Actual cost | Notes |
|-------|-------------|-------|
| **Gemini 3 Flash** | **€2.25** | Biggest cost — scoresheet/diagram OCR + dev testing |
| Gemini 2.5 Pro | €0.63 | AI Studio interactive use |
| Gemini 3.1 Flash Lite | €0.39 | Scoresheet OCR — "free tier" was exceeded |
| Gemini 2.5 Flash | €0.18 | Video summaries / dev testing |
| Gemini 3.1 Pro | €0.00 | No data yet (may have 24h delay) |
| Gemini 2 Flash | €0.00 | Within free quota or no usage |
| Pre-Jan 15 (unfiltered) | ~€5.74 | Cannot be broken down by model |
| **Total** | **€9.19** | |

Key finding: **all three scoresheet models generate real charges**, including Flash and Flash-Lite which have nominal "free tiers". The free quota doesn't cover our usage volume.

### What the dashboard shows

The admin panel computes cost as:

```
cost = (input_tokens * input_rate + (output_tokens + thinking_tokens) * output_rate) / 1,000,000
```

This assumes every call is billed at the published rate. In practice, this is close to the actual cost since the free quotas are easily exceeded.

### Thinking tokens matter

Gemini models use internal "thinking" tokens for reasoning before producing output. These are:
- **Not visible** in the response text
- **Billed at the output token rate**
- Often **10-100x larger** than the actual output

For example, a simple "say ok" call produced 156 thinking tokens vs 1 output token. On scoresheet reads with images, thinking tokens can be thousands -- and at $3-12/M (output rate), they can dominate the cost.

## Pricing source

Prices from [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), last checked 2026-03-28. Preview model pricing may change when models become stable.

Pricing constants live in `backend/blueprints/admin.py` (`GEMINI_PRICING` dict).
