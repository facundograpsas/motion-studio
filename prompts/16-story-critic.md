# Stage 1b — Story critic (fresh agent, script only)
Runs on every script draft before the user sees it. It reads docs/script.md and docs/facts.md only — never the
brief's intentions, never the chat. It doesn't rewrite; it returns PASS/FAIL per test with the row that fails.

```
Apply each test to the script table (id, voice, picture, read). One FAIL sends the script back.
 1 Words: 140–180 for ~90 s (scale linearly for other lengths). Silence is the luxury: the best films speak
   60–110 words a minute and let the picture carry the rest.
 2 Redundancy: no row's voice names what its picture already shows.
 3 Turn: a "but" (or an equivalent turn) within the first 5 rows.
 4 Causality: ≥ 3 so / because / therefore across the script; no "and then".
 5 Protagonist: one concrete entity (an order, a customer, a seller) in ≥ 3 rows, including one of the last 3.
 6 No slogan stacking: never more than 2 verbless fragments in a row; short lines only as the hit after a long one.
 7 Rhythm: ≥ 2 sentences of 12+ words and ≥ 3 of ≤ 4 words.
 8 Subject: "we / us / our" in < 30 % of rows — the subject is the order, the customer, the market.
 9 No value adjectives: seamless, powerful, innovative, cutting-edge, world-class, robust, leading, best-in-class.
10 Key number: a context row before it, a translation after it (a comparison or a picture a child gets), its own read.
11 Proof: every superiority claim has a number, a named case or an evidence picture within one row.
12 One read per row.
13 Hook: rows 1–2 raise a tension or a question; no company name.
14 Silence: ≥ 2 [beat]s, before the key number and before the close.
15 Callback: the last row picks up a word or entity from rows 1–5.
Also check every number against docs/facts.md (value and kind: a "stated" figure is said as stated, an
"illustrative" one is never presented as measured).
```
Sources of these tests: Randy Olson (ABT), Kenn Adams (story spine), Andy Raskin (strategic narrative), Nancy Duarte
(Resonate), documentary VO practice ("don't narrate the picture"), and transcripts of Apple "Intention" /
"Think Different", Shopify "Built different", Stripe Sessions, Dollar Shave Club, Flexport.
