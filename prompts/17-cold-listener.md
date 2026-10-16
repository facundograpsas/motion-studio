# Stage 1c — Cold listener (the comprehension check)
The story critic checks form; this checks whether it is understood. Checklists get optimized for: a script can pass
every story test and still not make sense to someone who doesn't know the business. Everyone who wrote or reviewed it
knows too much. This agent knows nothing.

Give a fresh agent ONLY the exact voice-over text (from audio/vo.json, with [silence] marks) — no files, no tools,
no brief, no facts, no description of the company. Then:

```
You know nothing about this company or its industry. Read this voice-over once, as if hearing it, then answer
plainly, as an ordinary listener (not a critic):
1. Retell the story in 3–4 sentences in your own words.
2. What is their problem, and how do they solve it? One sentence each.
3. Explain each case or example in your own words.            ← name the cases to probe
4. What does each number mean to you, and do you have anything to compare it with?
5. Which lines confused you or would you need to hear twice? Quote them and say what you thought they meant.
6. What two things would you remember tomorrow?
```
Compare the retelling with docs/brief.md ("what they must believe"): every belief must come back in the listener's
own words, and the two things remembered must be the claim and the key proof. A line the listener misreads or
quotes as confusing goes back to the scriptwriter — replace the idea, don't polish the words. The user only sees a
script that passed the story critic AND the cold listener.
