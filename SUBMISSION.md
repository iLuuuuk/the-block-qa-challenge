# QA Automation Submission

## Candidate

- Name: Lucas
- Date: 2026-06-17
- Repository URL: (your fork URL here)

## How to Run

1. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. Execute full suite (API + E2E):
   ```bash
   npm test && npx playwright test
   ```

3. Execute focused API suite:
   ```bash
   npm test
   ```

4. Execute focused E2E suite:
   ```bash
   npx playwright test
   ```

5. Visual dashboard (optional):
   ```bash
   npm run dashboard
   # then open http://localhost:4000
   ```

## Time Spent

- Approximate total hours: 4 hours

## Scope and Prioritization

I prioritized the API tests first because my background is in support, where I spend a lot of time debugging API calls, reading responses, and identifying exceptions. That's the area where I felt most confident and where I knew I could add the most value quickly.

The bid flow was the highest priority within the API tests — it's the core business action of the platform. A broken bid means no revenue, so I covered it thoroughly: happy path, validation errors (missing fields, invalid amounts), business rule violations, and the known flaky behavior.

I also made sure to cover the three intentional bugs in the codebase:
- Case-sensitive search (`?q=toyota` returns nothing)
- Numeric sort done as string comparison (`?sort=bid-desc` can misorder values)
- Minimum bid increment too low (server accepts `currentBid + $1`)
- Random 503 on the bids endpoint (15% failure rate)

The E2E tests were deferred to second priority. I covered the main user flows but focused on fewer scenarios than the API suite.

## Test Strategy

**API tests** — written with Node's built-in `node:test` runner and `fetch`. No extra dependencies needed. The server is spun up on a random port before the tests and shut down after, so the suite is fully isolated and doesn't require any manual setup.

**E2E tests** — written with Playwright, covering the real browser flows: loading the inventory, filtering by body style, navigating to a vehicle detail page, placing a bid, and seeing error messages in the UI.

**Reliability** — the bids endpoint has an intentional 15% random 503. Any test that expects a 201 or a business error (409/422) includes a retry loop to handle this without marking the test as flaky. There's also a dedicated test that measures the 503 rate over 50 attempts to document the bug explicitly.

**Data isolation** — bid state is stored in memory on the server and resets every time the server restarts. Since the tests spin up their own server instance, each run starts from a clean state.

## Implementation Notes

**No extra dependencies for API tests** — Node 20+ ships with `node:test`, `node:assert`, and `fetch` built in. I kept it that way on purpose to keep the setup simple.

**Playwright for E2E** — standard choice, good browser support, clear API, works well with the simple HTML structure of the SUT.

**Dashboard** — I built a small visual dashboard (`npm run dashboard`) that runs both suites and shows results at `http://localhost:4000`. It's a simple Node HTTP server that executes the test commands, parses the output, and renders pass/fail per test. Built this mostly by vibe-coding with AI assistance since it's outside the core test work.

**Port 0 trick** — the test server listens on port 0, which tells Node to pick any free port automatically. This avoids conflicts with the SUT running on 3000 and makes the suite safe to run in parallel.

## Results Summary

| Suite | Tests | Passing |
|-------|-------|---------|
| API   | 17    | 15-17 (varies by 503 hits) |
| E2E   | 6     | 6 |

The 1-2 occasional API failures are always caused by the random 503 on tests that don't have retry logic. This is intentional — it documents the instability rather than hiding it.

**Bugs found and documented:**

| Bug | Where | Status |
|-----|-------|--------|
| Search is case-sensitive | `GET /api/vehicles?q=` | Documented in test |
| Sort uses string comparison instead of numeric | `GET /api/vehicles?sort=bid-desc` | Documented in test |
| Bid accepts $1 minimum increment | `POST /api/vehicles/:id/bids` | Documented in test |
| Bids endpoint randomly returns 503 ~15% of the time | `POST /api/vehicles/:id/bids` | Documented with rate measurement |

## AI Usage

I used Claude as my main assistant throughout this challenge.

**Where AI helped:**
- Explaining the codebase and pointing out the intentional bugs in `server/index.js`
- Setting up the server lifecycle (`before`/`after`) so tests spin up their own server instance
- Writing the E2E tests with Playwright — I have no prior experience with browser automation, so I described the flows and reviewed the generated code
- Building the dashboard — I gave direction and AI wrote most of it (vibe-coding)

**Where AI was wrong and I corrected it:**
- Early versions of the E2E tests used wrong HTML selectors or wrong API routes — I caught these by running the tests and reading the errors
- The first version of the error parser in the dashboard cut off the error message too early — I debugged the TAP output manually and fixed the regex
- AI suggested `?q=Toyota` wasn't working but it was actually a data state issue from previous bid tests mutating the server state

**How I validated the output:**
- I ran every test after writing it and checked the output manually
- I cross-referenced asserts against the actual server responses I saw in the browser
- For bugs, I verified the behavior directly in the browser or terminal before writing the test that documents it

## Gaps and Next Steps

- **API tests without retry** — a few validation tests (422s) can still hit the 503 and fail. Adding retry to all bid-related tests would make the suite fully stable.
- **Search filter test with uppercase** — there's a test for the bug (`toyota` lowercase) but a more thorough test would compare both results and assert they should match.
- **More E2E coverage** — the search and filter interactions in the UI are only partially covered. A full suite would also test empty states and navigation edge cases.
- **Test data isolation per test** — right now tests share the same bid state within a run. If tests run in a different order, `currentBid` values change. Resetting state between tests would make them fully independent.
- **Load testing** — the 503 suggests the bid service has reliability issues under load. Testing with concurrent requests would give more signal on that.
