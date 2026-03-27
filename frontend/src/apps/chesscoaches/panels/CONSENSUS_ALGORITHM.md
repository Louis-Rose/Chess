# Scoresheet Consensus Algorithm

## Problem

Multiple AI models (Gemini 3 Flash, 3.1 Pro, 3.1 Flash-Lite) independently read a handwritten chess scoresheet. Each may produce different readings for the same move — especially for ambiguous handwriting. We need to combine their outputs into a single best-guess move list.

## Why Not Simple Majority Vote?

Majority vote picks the most popular reading per move, independently. But chess moves are sequential — a wrong choice at move 7 can make the entire rest of the game illegal. Simple majority ignores this cascading effect.

## Two-Pass Greedy Algorithm

The algorithm runs two passes. Each pass walks left-to-right through every half-move (white, then black, for each move number) and makes a greedy choice.

### Pass 1: Bootstrap with Majority Votes

- **Downstream reference**: simple majority-vote sequence (most popular reading per half-move)
- For each half-move:
  - If all models agree → use that move
  - If models disagree → try each candidate:
    1. Fork the board at the current position
    2. Play the candidate move
    3. Play the remaining moves from the **majority-vote** sequence
    4. Count how many downstream moves are illegal
  - Pick the candidate with the fewest downstream illegals
  - Tiebreaker: higher vote count wins
  - If all candidates are themselves illegal (penalty = 100): mark as unresolved, ask user to fix manually

**Result**: a good initial consensus, but the "illegals after" counts are approximate because the downstream reference (majority votes) may itself contain poor choices.

### Pass 2: Refine with Pass 1 Results

- **Downstream reference**: Pass 1's consensus sequence
- Same algorithm, but now each candidate is evaluated against the already-optimized sequence from Pass 1
- This produces:
  - **Better choices**: a candidate that looked worse against majority votes may look better against the optimized sequence
  - **Accurate counts**: the "illegals after" numbers in the vote info modal now reflect reality

## Post-Processing

After the two-pass consensus:

1. **Ambiguity auto-resolution**: if a consensus move is ambiguous (e.g., `Rc1` when both `Rac1` and `Rfc1` are legal), the algorithm tries each disambiguation, simulates downstream, and picks the one with fewer illegals.

2. **Single-candidate auto-fix**: if only one piece can reach the target square, auto-corrects (e.g., `Rc1` → `Rac1` when only one rook can go to c1).

3. **Legality validation**: marks each move as legal (checkmark) or illegal (cross) using chess.js.

## Normalization

Before comparing moves across models:
- `+` and `#` (check/checkmate annotations) are stripped — `Qb3+` and `Qb3` count as the same move
- `x` (capture notation) differences are tolerated during move pushing
- Uppercase pawn moves are lowercased (`C3` → `c3`)

## Vote Info Modal

For each half-move in the consensus table, users can view:
- Each candidate move considered
- Number of model votes for it
- Number of downstream illegal moves if that candidate is chosen (computed against the Pass 2 reference)
- Which candidate was chosen (or none, if all are illegal)

## Complexity

- **Time**: O(M × D × N) per pass, where M = number of disagreement points, D = number of candidates per disagreement (~2-3), N = number of remaining moves to simulate
- **Two passes**: 2× the above — still fast since it's all in-memory chess.js simulation
- **No API calls**: entirely client-side
