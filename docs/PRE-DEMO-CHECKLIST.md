# Pre-demo checklist

Live demo: **https://saidso.thankfulcliff-b0e83158.centralindia.azurecontainerapps.io**

## 1. Automated (2 minutes, ~$0.02)

```bash
npm run smoke
```

Every page, every read API, seven Hey Saidso questions with the behaviour each must show, and
one dictation. All green means the reviewer-facing paths work. Run it again after any
redeploy. It counts against the per-visitor limit (60 questions per 10 minutes).

## 2. By hand (10 minutes)

| # | Do this | You should see |
| - | --- | --- |
| 1 | Open the link in an **incognito** window | The intro opens with no sign-in; the replay on the right types a dictation, files it as kept, replaced or refused, then answers a question (one loop is ~25s) |
| 2 | Open the link **on your phone** | Single-column layout, nothing cut off or scrolling sideways |
| 3 | Click a card under **Try it** | Hey Saidso opens and answers that question by itself |
| 4 | In **Chrome or Edge**, on `/ask`, tap the mic, allow the microphone, say “when does V2 launch”, tap the bars | Your words appear as you speak; it sends when you stop; the answer says December 5th with source chips |
| 5 | Click a **source chip** under an answer | The exact sentence and, for a dictation, “What you actually said” — the raw recogniser text |
| 6 | Click **how did Saidso get here?** | Each lookup, a candidate table with score, vector and BM25 columns, tokens and cost |
| 7 | Ask “Find the Slack update I dictated around 5pm yesterday and polish it into a standup update.” | A three-bullet draft, the preference that shaped it, a Slack chip dated yesterday ~5:48 PM UTC |
| 8 | **Knowledge graph**: drag a node, then click **Rahul Iyer** | The graph moves and settles; the panel lists his relations; clicking one shows the quote it came from |
| 9 | **What Saidso knows** → tick “Show changed & removed”, search “launch” | The November 14 date shown as superseded beside the December 5 one |
| 10 | **Dictation**: click the first example under the box, then send | Formatted text that still says “Davika”; “see the instructions used” shows no memory reached the prompt |
| 11 | **Evaluation** | Failures listed first, the graph ablation table, “ask this again, live” on each case |

## 3. Before a call

- **Times are UTC everywhere**, as Hey Saidso reads them: “5pm yesterday” means 17:00 UTC
  (10:30 PM IST).
- The demo **resets itself every day at 05:30 IST** (midnight UTC). Anything a visitor taught
  it or made it forget is undone then.
- If someone has broken it (forgotten the launch date, say) and you cannot wait, restart it.
  A restart restores the seeded database in about 30 seconds:

  ```bash
  az containerapp revision restart -n saidso -g kivi-demo-rg --revision $(az containerapp revision list -n saidso -g kivi-demo-rg --query "[?properties.active].name | [0]" -o tsv)
  ```

- Voice needs **Chrome or Edge**. Safari and Firefox show a “type instead” hint; everything
  else works the same.
- Limits a reviewer could meet: 60 questions per 10 minutes per network, 1,500 per day in
  total. Both answer with a plain message, never an error page.
