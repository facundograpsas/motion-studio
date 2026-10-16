# Progress

One line per stage. Only the user moves a document from DRAFT to APPROVED. A new session (or agent) starts by
reading this file, then the newest APPROVED document, never the chat.

| # | stage | document | status | notes |
|---|---|---|---|---|
| 0 | brief + facts | docs/brief.md, docs/facts.md | DRAFT | |
| 1 | script | docs/script.md | — | |
| 2 | direction | docs/style_guide.md | — | |
| 3 | voice | audio/vo.json → audio/vo/, timeline.json | — | |
| 4 | storyboard | out/boards/ (one still per beat, from scene code) | — | |
| 5 | build | index.html (test scene first, then the rest) | — | |
| 6 | QA + critics | out/qa/, docs/review_log.md | — | |
| 7 | sound + master | out/<format>/final.mp4 | — | |
| 8 | learn | rules added to CLAUDE.md / the skill | — | |
