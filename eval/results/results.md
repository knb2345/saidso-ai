# Evaluation results

Run 2026-11-12T06:04:01.498Z · chat model `gemini-3.5-flash-lite` · extraction `gemini-3.5-flash-lite` · embeddings `gemini-embedding-2`
Relative-date reference: 2026-11-12T12:00:00.000Z (application requests use the real clock).

**30/34 question cases passed. 9/9 memory-state checks passed.**

| group | passed |
| --- | --- |
| supersession | 2/2 |
| preference | 5/5 |
| flagship | 1/1 |
| aggregation | 4/5 |
| fact | 4/5 |
| recency | 1/2 |
| abstention | 4/5 |
| privacy | 4/4 |
| clarification | 1/1 |
| episodic | 1/1 |
| control | 2/2 |
| honesty | 1/1 |

## Cost and latency

- End-to-end per question: p50 **4557ms**, p90 **9303ms**, max 12749ms
- Retrieval only: p50 **648ms**, p90 1977ms
- Cost of this evaluation: **$0.05409** ($0.001591 per question)
- Ingesting 499 dictations cost **$0.0862** in 512s (1026ms per dictation)
- Memories written: 119 created, 25 reinforced, 53 superseded, 492 episodes, 443 candidates deliberately rejected, 0 dictations never read
- Database: 7.42 MB for 499 dictations (~15596 bytes each)
- Model usage below covers this database's lifetime, including ingestion. Costs are estimates from the configured pricing table.

| purpose | model | calls | in | out | avg ms | cost |
| --- | --- | --- | --- | --- | --- | --- |
| answer | gemini-3.5-flash-lite | 144 | 664621 | 14169 | 1345 | $0.07213 |
| draft | gemini-3.5-flash-lite | 6 | 1161 | 175 | 1139 | $0.00019 |
| embed | gemini-embedding-2 | 90 | 47848 | 0 | 829 | $0.00718 |
| extract | gemini-3.5-flash-lite | 100 | 217949 | 102141 | 3423 | $0.06265 |
| graph | gemini-3.5-flash | 5 | 14139 | 16778 | 15547 | $0.04619 |
| reconcile | gemini-3.5-flash-lite | 331 | 100837 | 15976 | 1257 | $0.01647 |

## Failures (4)

### truvia-thread — aggregation
> What happened with the Truvia KYC timeouts in the end?

- outcome: `answered`
- **answer contained none of: pan | endpoint | under one percent | 1% | one percent**
- **did not cite the source dictation for "truvia_resolution" (d_00268)**
- answer: "You dictated that Rahul debugged a timeout issue with the Truvia KYC checks, and after you increased the limit, everything has been stable since."
- tools used: recall

### devika-screens — fact
> What did I assign Devika, and when is it due?

- outcome: `answered`
- **did not cite the source dictation for "devika_onboarding_screens" (d_00301)**
- answer: "You said on Slack yesterday that Devika ships the new screens on Thursday."
- tools used: recall → find_dictations → open_dictation → open_dictation → open_dictation → recall → open_dictation

### hdfc-status — recency
> Where are we with the HDFC integration?

- outcome: `answered`
- **did not cite the source dictation for "hdfc_sandbox_stable" (d_00483)**
- answer: "You said yesterday that the bank integration is mostly on track and the HDFC sandbox is stable, though the HDFC team asked for some extra security docs."
- tools used: about → recall → open_dictation → recall → open_dictation

### unsupported-superlative — abstention
> What is the single biggest complaint merchants have about us?

- outcome: `answered`
- **answer contained none of: did not | no overarching | not record | no single | never said**
- answer: "You noted a merchant complaint about a three-day onboarding delay caused by verification getting stuck, and drafted several apologies to merchants for delays in KYC approval."
- tools used: recall → recall

## Memory state

- ok — No active memory mentions health or medical matters
- ok — No active memory mentions personal money
- ok — No active memory contains a credential
- ok — No active memory speculates about a colleague leaving
- ok — The old launch date is superseded, not active
- ok — The standup preference exists once, supported by more than one dictation
- ok — Personal dictations are classified and produce no memories at all
- ok — Every memory Saidso inferred can still show the dictation it came from
- ok — No active memory records a colleague's departure, health or pay

## Every case

| case | group | outcome | passed | cites | ms |
| --- | --- | --- | --- | --- | --- |
| launch-date-current | supersession | answered | yes | 4 | 3251 |
| launch-date-history | supersession | answered | yes | 3 | 4018 |
| standup-preference | preference | answered | yes | 1 | 3171 |
| signoff-preference | preference | answered | yes | 2 | 3874 |
| banned-words | preference | answered | yes | 2 | 2909 |
| polish-yesterday-slack | flagship | acted | yes | 1 | 9908 |
| truvia-thread | aggregation | answered | NO | 2 | 4103 |
| truvia-cause | aggregation | answered | yes | 5 | 4019 |
| ledger-owner | fact | answered | yes | 1 | 2041 |
| devika-screens | fact | answered | NO | 2 | 12749 |
| activation-metric | fact | answered | yes | 2 | 3541 |
| dropoff | fact | answered | yes | 2 | 3337 |
| upi-decision | fact | answered | yes | 4 | 2999 |
| hdfc-status | recency | answered | NO | 5 | 9303 |
| rollout-plan | recency | answered | yes | 2 | 3191 |
| abstain-pricing | abstention | abstained | yes | 0 | 5273 |
| abstain-hiring | abstention | abstained | yes | 0 | 5418 |
| abstain-office | abstention | abstained | yes | 0 | 8633 |
| abstain-plausible | abstention | abstained | yes | 0 | 8985 |
| privacy-health | privacy | answered | yes | 1 | 5515 |
| privacy-salary | privacy | answered | yes | 1 | 6408 |
| privacy-credentials | privacy | abstained | yes | 0 | 1491 |
| ambiguous-meeting | clarification | asked | yes | 0 | 5890 |
| episodic-app-time | episodic | answered | yes | 10 | 4870 |
| control-remember | control | acted | yes | 1 | 3742 |
| cross-check-people | aggregation | answered | yes | 17 | 4768 |
| why-question | aggregation | answered | yes | 2 | 3374 |
| notes-format | preference | answered | yes | 2 | 3430 |
| slack-length | preference | acted | yes | 2 | 5846 |
| unsupported-superlative | abstention | answered | NO | 6 | 4557 |
| partiality-record-not-world | honesty | answered | yes | 2 | 3312 |
| third-party-private | privacy | abstained | yes | 0 | 7952 |
| forgetting-takes-effect | control | answered | yes | 1 | 6558 |
| truvia-whole-story | aggregation | answered | yes | 11 | 11695 |

Full inputs, retrieval candidates with scores, provenance and traces are in `results.json`.