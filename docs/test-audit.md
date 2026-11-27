# Test audit

Newest first.

## 2026-11-26: sweep after the transaction fix

Suite: 38 tests before, 48 after (`npm test`, real Payload 3.92 and in-memory MongoDB for four files, a made-up Payload for `test/transactions.test.ts`; made-up events and users, no site).

- **Promises.** From the README, `docs/decisions.md` and the changelog since the last entry (0.2.1 is the only release since):
  1. 0.2.1: a find that can run inside a request’s transaction passes `pagination: false`, so no count is sent beside it.
  2. Visitors and signed-in people read published events and dates only. Drafts are for those the write rule lets in, and only where it lets them.
  3. Write access fails closed: admin users only by default, and only `true` or a non-empty query counts.
  4. A query from the write rule scopes the endpoints (404 when an event is outside it).
  5. Copied fields always come from the event.
  6. Merge and split show a plan first, run in one transaction as the signed-in person, and refuse a protected date.
  7. Old addresses lead to the merged event and aren’t reused.
  8. A default timezone that the field can’t hold is refused at start-up, and `UTC` works with none set.
  9. Repeat rules, top-up, appearances and drop-off, geocoding, near-me, duplicates, calendar files, fixed choices, the GraphQL schema.
- **Covered.**
  - 1: `test/transactions.test.ts`: "asks once, without a count, when the address is current", "asks twice, both without a count, when the address is a merged-away one", "asks twice, both without a count, when nothing has the address", "still asks for one row only, as the request’s user", "findSimilar: the events list and the same-venue dates", "nearbyDates", "arrangeDates and mergeEvents: each event’s dates, when planning", "syncDates: the dates a rule made, read from a save hook’s request".
  - 2: `test/events.test.ts`: "shows visitors only published events and their dates, and refuses their writes", "shows a member only published events and their dates, and staff the drafts too", "reads as the request’s user in eventBySlug, nearbyDates and a date’s calendar file, so a visitor finds no draft". `test/access-default.test.ts`: "shows a member published events only, and an admin the drafts".
  - 3: `test/access-default.test.ts`: "refuses a member of a second auth collection: no create, edit or delete, and no endpoint", "answers someone not signed in with 401", "lets a user of the admin collection change events and use the endpoints". `test/access-scoped.test.ts`: "refuses every endpoint with 403, never a 500, and changes nothing", "refuses collection writes with 403 and shows no drafts, without a 500".
  - 4: `test/access-scoped.test.ts`: "lets a curator of site A arrange an event of site A, and not one of site B", "lets a curator merge site A events, and refuses any merge that touches site B, either way round", "lets a platform admin (true) work on any site, and refuses a member (false) with 403".
  - 5: `test/events.test.ts`: "always takes them from the event: a date can’t claim another site, on create, on an edit or by moving".
  - 6: `test/events.test.ts`: "plans first, then splits dates into new events, keeping each date’s id", "refuses a split that would move a protected date, or a date the rule would remake", "changes nothing when a merge fails partway: the whole transaction is undone".
  - 7: `test/events.test.ts`: "merges single events into one reusable event whose address the old ones lead to".
  - 8: `test/default-timezone.test.ts`, both tests.
  - 9: `test/rules.test.ts` and the rest of `test/events.test.ts`, as mapped in the 2026-11-09 entries below.
- **Gaps added.** 10 tests.
  - `test/transactions.test.ts` (8, new file). A made-up Payload records every `find`; each one that carries a `req` must pass `pagination: false`. Four tests drive `eventBySlug`, the only code 0.2.1 changed: a current address (one find), a merged-away address (two finds) and no match (two finds), plus one that the limit of 1 and the request’s user still go through. Four more guard the other finds that take a request and already passed it: `findSimilar`, `nearbyDates`, the dates lookup under `arrangeDates` and `mergeEvents`, and `syncDates`.
  - **Failed first.** With `src/tools.ts` put back to the commit before the fix (`git show 150f075^:src/tools.ts`), `npx vitest run test/transactions.test.ts` gave 3 failed, 5 passed: the three `eventBySlug` lookups, each "expected undefined to be false". With the fix restored, 8 passed.
  - `test/events.test.ts`: "reads as the request’s user in eventBySlug, nearbyDates and a date’s calendar file, so a visitor finds no draft". Until now `eventBySlug` and `nearbyDates` were only called with no request, where they read everything, and the date calendar file had no test of its own. A draft event and its date: a visitor’s request gets nothing from all three (404 for the file), and staff get them.
  - `test/events.test.ts`: "changes nothing when a merge fails partway: the whole transaction is undone". The removal of the old event is made to fail once, after the dates have moved. The merge rejects, and both events, their dates, the reusable mark and the old addresses are as they were.
  - **Mutation checks.** 4, each a Python string replace undone with `git checkout`, and each fails its new test: `eventBySlug` overriding access when it has a request, `nearbyDates` doing the same, the date calendar file overriding access, and merge running with no transaction.
- **Gaps skipped.**
  - The race itself. It needs a real replica set and luck (about 1 in 7 where it was found), and a test that fails now and then proves little. The tests check its cause.
  - Finds inside the collection hooks (`src/collections.ts`) and the endpoints’ own lookups (`src/index.ts`). 0.2.1 didn’t change them, they already pass `pagination: false`, and a made-up Payload can’t reach a hook. A rule over all source is the lint’s job.
  - `findByID` and `count`. Neither sends a second query beside itself.
  - How Payload applies an access answer, and how its Mongo adapter starts, commits and ends a transaction. Framework internals, used through the real thing in four of the five files.
  - A split failing partway. It goes through the same `withTransaction` as merge, which the new rollback test and its mutation check cover.
  - Organizer suggestions, drag and drop by mouse and a real screen reader, as in the 2026-11-09 entries.
- **For the lead.**
  - `findSimilar` reads with `overrideAccess: !opts.req?.user`, so a request with nobody signed in reads every event, drafts included. The `/similar` endpoint checks the write rule first, so it isn’t reachable there, but a site calling the exported function with a visitor’s request would get draft names back. `eventBySlug` and `nearbyDates` use `!opts.req`. Not changed or pinned by a test here, since it may be meant.
  - The README’s status line still says 36 tests, and its Access section still calls the 2026-11-11 change unreleased. It shipped in 0.2.0.

## 2026-11-11: the default timezone is always valid

- **The change.** `src/fields.ts`: the timezone list starts with `UTC`, which `Intl.supportedValuesOf('timeZone')` leaves out. `src/index.ts`: a `defaultTimezone` outside the list is refused at start-up.
- **Tests.** `test/default-timezone.test.ts`: with no `defaultTimezone`, a one-time event, its date, and a repeating event with its made dates all save in `UTC`; `Mars/Olympus_Mons` is refused at start-up with the message, `Europe/London` isn't. `test/access-default.test.ts` no longer needs its timezone workaround comment.
- **Mutation checks.** 4, each a Python string replace restored byte for byte (SHA-256 checked); all 4 fail the new tests: `UTC` left out of the list (start-up refusal), the start-up check removed, both together (the save fails validation), and the default changed to `Etc/UTC`.
- **Closes** the note for the lead in the entry below.

## 2026-11-11: write access fails closed, and a query scopes the endpoints

Suite: 27 tests before, 36 after (`npx vitest run`, real Payload 3.92, in-memory MongoDB, made-up events and users; no site).

- **The change.** `src/access.ts`: `adminUsersOnly` (the default write rule: the user's collection equals `admin.user`), `asWhere` (a plain object with at least one key), `writeScope` (exactly `true`, a real query, or nothing; a throw is nothing) and `strictWrite` (what Payload gets as create, update and delete access). Draft reads use `writeScope` too. The endpoints' `mayWrite` takes the event ids a request names; with a query, it loads them through it (`{ and: [{ id: { in } }, query] }`) and answers 404 unless every one is inside.
- **Tests.** `test/access-default.test.ts` (no `access` option, `users` plus a second auth collection `members`): a member can't create, edit or delete, or use merge, arrange, not-duplicate, similar or the rule preview (403, nothing changed); a member sees no drafts and an admin does; signed out is 401; an admin user writes and merges. `test/access-scoped.test.ts` (a rule answering `true` for a platform admin, `{ site: { in } }` for a curator, `false` for a member): a curator arranges and merges site A's events; arranging site B's, and every merge that touches site B (into, from, both, or mixed), is 404 with nothing changed; not-duplicate across sites is 404; a platform admin merges site B; a member is 403. Six non-answers (`1`, `'yes'`, `{}`, an array, a throw, a rejection): every endpoint is 403 and collection create, update and delete are 403 (never a 500), no drafts shown; a real query still scopes draft reads.
- **Mutation checks.** 15, each a Python string replace restored byte for byte (SHA-256 checked); all 15 fail the suite: the old default in the collections and in the endpoints; `adminUsersOnly` without the collection check; truthy answers passing; errors rethrown; an empty `{}` or an array taken as a query; the raw answer handed to collection access; draft reads taking any truthy answer; the endpoint skipping the event check under a query, checking only the first event, or leaving the query out of the lookup; merge not checking `from`; arrange not checking its event; not-duplicate not checking the other event.
- **Skipped.** The exported `arrangeDates` and `mergeEvents` functions don't gate themselves: they run as the request's user through Payload's access, and a site calling them directly decides who may. The `/:id/ics` endpoints read through Payload's read access and are unchanged.
- **For the lead.** The plugin's own default `defaultTimezone`, `UTC`, isn't in the timezone field's list (`Intl.supportedValuesOf('timeZone')` here has no `UTC`), so with no `defaultTimezone` creating any event fails validation. The new default-access test sets a timezone to get past it; not fixed here.

## 2026-11-09: fixed choices (field audit)

`test/events.test.ts` gains 1 (24 in all).

| Promise | Test |
| --- | --- |
| Start times only in 15-minute steps; venue countries only as known codes; the organizer stays free text | events: "takes start times only in 15-minute steps…" |

Not covered by a test: the organizer suggestions, which are a browser list fed from the signed-in person's own events. Checked in a browser on a local copy of a site instead: two earlier organizers offered, new text accepted, axe 0 on the field.

## 2026-11-09: core built

`test/rules.test.ts` (7) and `test/events.test.ts` (14), on Payload 3.92 with in-memory MongoDB and made-up events on two made-up sites.

| Promise | Test |
| --- | --- |
| The owner's every-other-month 3rd Thursday; plain-English summary; RFC text with DTSTART on the first real date | rules: "does the owner's example" |
| 7 pm stays 7 pm across daylight saving; spring-forward gap; fall-back repeat | rules: "keeps a 7 pm meeting…", "moves a time skipped…" |
| Last weekday of a month; months without the 31st; ends by date or count | rules |
| A year of dates in the event's timezone, with the site and appearance carried; top-up makes nothing twice | events: "makes a year of dates…" |
| A rule change redoes only untouched future dates; edited, protected, hand-made and past dates stay; turning recurring off | events: "redoes untouched future dates…" |
| Half-built rules can't be published | events: "refuses to publish…" |
| One-time events have one date; `appearsByDefault` | events: "lets a one-time event…" |
| Drop-off needs an appearance; appearances off per site | events: "needs an appearance…" |
| Geocoding on venue change only; a typed point kept; the usual venue copied | events: "looks up the venue's point…" |
| Slugs unique per site; deleting an event deletes its dates unless one is protected | events: "gives each event a slug…" |
| Visitors see only published events and their dates, can't write, and can't use the tools | events: "access" |
| Duplicates by name, organizer, website, venue; the right question; "not a duplicate" remembered | events: "duplicates" |
| Split plans first, keeps date ids, all-individual; refuses protected and rule-made dates | events: "merge and split" |
| Merge moves dates, removes the old events, old addresses redirect and aren't reused; refuses across sites | events: "merges single events…" |
| Near-me nearest first; drop-off only inside the window, with an appearance and drop-off, and not canceled | events: "near me and drop-off" |
| Calendar files: rule plus changed dates, escaping, folding at 75 octets | events: "calendar files" |

- Gaps skipped: the `preview-rule`, `similar` and `not-duplicate` endpoints are thin wrappers over tested functions. They'll be covered with the admin screens that call them.
- Browser pass, 2026-11-09, on a local copy of a real site with made-up events (Playwright + axe, WCAG 2.2 AA):
  - The live preview follows a weekday change before saving. The dates list shows the made dates.
  - A split plan is refused for a rule-made date. Merge moves the dates, removes the old event and keeps its address.
  - The duplicate warning appears while typing a name, and "It's a different event" clears it.
  - The calendar file's DTSTART is the first real 3rd Thursday.
  - axe: 0 on all three panels.
  - Fixed on the way: rrule loading under a bundler (Node and Next resolve it differently), and singular wording in the merge summary.
- Not tested: drag and drop by mouse (the "Move to" list was used), a real screen reader.
