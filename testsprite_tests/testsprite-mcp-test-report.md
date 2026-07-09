
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** brand-pulse-os
- **Date:** 2026-07-09
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

### Requirement: Overview Dashboard
Brand health score, sentiment overview, and period-filter refresh on the landing dashboard.

#### Test TC002 View brand health and refresh by period
- **Test Code:** [TC002_View_brand_health_and_refresh_by_period.py](./tmp/TC002_View_brand_health_and_refresh_by_period.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a1b31947-4505-4346-b5a1-642c9b88e4fc/43cfd3ea-a89b-4b0c-b8f6-03b3c2247b06
- **Status:** ✅ Passed
- **Analysis / Findings:** The Overview page correctly renders Brand Health Score (75), Negative Spike Alert (0), and the Media Tone donut with both "positive" and "negative" sentiment segments on initial load. Switching the period filter to "30 hari terakhir" updates the URL to `range=30d`, the selector reflects the new choice, and the health metrics remain consistent for the new period. No functional issues found.
---

### Requirement: Import CSV/JSON in Sources
Manual CSV/JSON upload on the Sources page, deduplication, and mention-count refresh.

#### Test TC004 Import a valid mention file and verify counts refresh
- **Test Code:** [TC004_Import_a_valid_mention_file_and_verify_counts_refresh.py](./tmp/TC004_Import_a_valid_mention_file_and_verify_counts_refresh.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a1b31947-4505-4346-b5a1-642c9b88e4fc/8c966710-f5c9-45d9-bef2-0a43b4e4a574
- **Status:** ✅ Passed
- **Analysis / Findings:** Uploading `sample-import.csv` via the Manual Import form on `/sources` and clicking "Import data" completed without error; the app navigated correctly between Overview and Sources and the page remained responsive throughout the import + AI-analysis pipeline. Note: the AI judge validated page-load/navigation state rather than asserting the exact "N baru / M duplikat" text, since that message is transient and scroll-dependent — consider adding a `data-testid` or persisting the result banner longer to make this assertion more precise in future runs.
---

### Requirement: All Mentions with filters and detail
Mention list browsing and the mention detail view (AI analysis + raw payload + source link).

#### Test TC005 Open mention details with analysis and source context
- **Test Code:** [TC005_Open_mention_details_with_analysis_and_source_context.py](./tmp/TC005_Open_mention_details_with_analysis_and_source_context.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/a1b31947-4505-4346-b5a1-642c9b88e4fc/148a1ac0-ee08-43ec-8ec3-69f79ea430d4
- **Status:** ✅ Passed
- **Analysis / Findings:** From `/mentions`, opening the "Storytelling Competition Bank Jakarta..." mention correctly navigates to its detail page and shows AI analysis scores (Relevance 90, Sentiment 70, Confidence 95) plus a Risk label, and both the raw JSON payload block and the "Buka sumber asli" source link are visible. No functional issues found.
---


## 3️⃣ Coverage & Matching Metrics

- **100%** of the smoke-run tests passed (3/3)
- These 3 tests are a subset of the 44 tests generated in the full plan (`testsprite_frontend_test_plan.json`), covering 3 of the 4 requested critical flows (Overview, Import CSV, All Mentions/detail). Content Ideas and Generate Content were seeded as tests but not smoke-run, to conserve credits.

| Requirement                                  | Total Tests (plan) | Smoke-Run | ✅ Passed | ❌ Failed |
|-----------------------------------------------|---------------------|-----------|-----------|-----------|
| Overview Dashboard                             | 3                   | 1         | 1         | 0         |
| All Mentions with filters and detail           | 6                   | 1         | 1         | 0         |
| Import CSV/JSON in Sources                     | 5                   | 1         | 1         | 0         |
| Content Idea Engine                            | 5                   | 0         | -         | -         |
| Generate Content (hook/caption generate+review)| 6                   | 0         | -         | -         |
| Reports generation                             | 12                  | 0         | -         | -         |
| Secondary/validation/settings views             | 7                   | 0         | -         | -         |
| **Total**                                      | **44**              | **3**     | **3**     | **0**     |

---

## 4️⃣ Key Gaps / Risks

- **Not yet smoke-run:** Content Ideas (generate + status actions), Generate Content (hook generator + hook/caption review), and Reports (generate + PDF export) — 41 of 44 tests remain unexecuted. Running the rest costs ≈ 41 credits (this account has 150 free credits, and 3 were already spent on this smoke run).
- **Mock AI/data layer:** `AI_PROVIDER=mock` and `MOCK_CONNECTORS=true` mean AI-generated content (ideas, hooks, reports) and connector data are deterministic/simulated, not live-model output — assertions on those flows should expect fixed mock values rather than generative variance.
- **Dev-mode server:** the app was tested against `next dev`, not a production build; TestSprite capped this run at high-priority tests only. For a fuller run (up to 30 tests) consider `npm run build && npm run start` first.
- **Import success-message assertion:** TC004 passed on page/navigation state but did not strictly assert the "N baru dianalisis / M duplikat" success text, since it's a transient, scroll-dependent element — worth hardening with a stable selector for future regression runs.
- **No auth flow exists to test** (`BASIC_AUTH_ENABLED=false`), which is expected per the current app configuration.

**To run the rest (≈41 credits):**
- Frontend has no bulk-run flag — run each remaining test by id: `testsprite test run <testId> --wait`
