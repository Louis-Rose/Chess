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
| `gemini-3-flash-preview` | $0.50 | $3.00 | Yes |
| `gemini-3.1-pro-preview` | $2.00 | $12.00 | **No** |
| `gemini-3.1-flash-lite-preview` | $0.25 | $1.50 | Yes |

A re-read uses a single user-selected model.

## Cost estimation accuracy

**The costs shown in the admin panel are upper-bound estimates, not actual charges.**

### Why we can't know the exact cost

The Gemini API does **not** include any billing indicator in its responses. There is no `is_free`, `billing_tier`, or `cost` field. Google confirmed there is no programmatic way to determine whether a specific API call was free or paid.

### Our billing setup

We use a **paid Google Cloud API key** (billed monthly). However, even on a paid plan, Google still provides free-tier quotas per model. Calls within those quotas cost $0; only calls exceeding the limits are billed per token.

In practice, for our 3-model scoresheet read:

| Model | Free quota | Actually billed? |
|-------|-----------|-----------------|
| `gemini-3-flash-preview` | Yes (generous RPM/RPD) | Rarely -- most calls fall within free quota |
| `gemini-3.1-pro-preview` | **No free tier** | **Always billed** |
| `gemini-3.1-flash-lite-preview` | Yes (generous RPM/RPD) | Rarely -- most calls fall within free quota |

This means the **real cost per scoresheet read is dominated by the 3.1 Pro call** ($2/M input, $12/M output+thinking). The Flash and Flash-Lite calls are likely free unless we hit high volume.

### What the dashboard shows

The admin panel computes cost as:

```
cost = (input_tokens * input_rate + (output_tokens + thinking_tokens) * output_rate) / 1,000,000
```

This is the **maximum possible cost** assuming every call is billed. The actual charge is likely lower because Flash and Flash-Lite calls within free quotas cost $0. The Pro cost is always accurate.

### Thinking tokens matter

Gemini models use internal "thinking" tokens for reasoning before producing output. These are:
- **Not visible** in the response text
- **Billed at the output token rate**
- Often **10-100x larger** than the actual output

For example, a simple "say ok" call produced 156 thinking tokens vs 1 output token. On scoresheet reads with images, thinking tokens can be thousands -- and at $3-12/M (output rate), they can dominate the cost.

### Actual billing

As of March 2026, the Google Cloud invoice shows ~9.19 EUR/month. This covers all Gemini API usage across the app (scoresheet, diagram, chess insight, broker imports).

## Pricing source

Prices from [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), last checked 2026-03-28. Preview model pricing may change when models become stable.

Pricing constants live in `backend/blueprints/admin.py` (`GEMINI_PRICING` dict).
