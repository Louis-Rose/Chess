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

### Free tier behavior

Google's free tier gives generous rate limits (RPM/RPD) per model. Calls within these limits cost $0. Once exceeded:
- Free-tier calls return 429 errors (rate limited)
- Paid-tier calls are billed per token

Since `gemini-3-flash-preview` and `gemini-3.1-flash-lite-preview` are available on the free tier, their calls may cost nothing. `gemini-3.1-pro-preview` is **not available on the free tier** -- if your API key is on the free plan, Pro calls will fail.

### What the dashboard shows

The admin panel computes cost as:

```
cost = (input_tokens * input_rate + (output_tokens + thinking_tokens) * output_rate) / 1,000,000
```

This is the **maximum possible cost** assuming every call is billed. If you're within free-tier quotas, actual cost is $0 for Flash and Flash-Lite models.

### Thinking tokens matter

Gemini models use internal "thinking" tokens for reasoning before producing output. These are:
- **Not visible** in the response text
- **Billed at the output token rate**
- Often **10-100x larger** than the actual output

For example, a simple "say ok" call produced 156 thinking tokens vs 1 output token. On scoresheet reads with images, thinking tokens can be thousands -- and at $3-12/M (output rate), they can dominate the cost.

### How to check your actual billing

1. Go to [Google AI Studio](https://aistudio.google.com) > Settings > Billing
2. Check your project's billing tier (Free Tier vs Tier 1/Pay-as-you-go)
3. If on free tier: your actual cost is $0 (until you hit rate limits)

## Pricing source

Prices from [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), last checked 2026-03-28. Preview model pricing may change when models become stable.

Pricing constants live in `backend/blueprints/admin.py` (`GEMINI_PRICING` dict).
