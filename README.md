# Akro Daily Planner — simplified version

Static app, two views: weekly demand and a daily oven/inventory schedule. `dist/index.html` loads `simple-app.js` and `simple-model.js`. The previous model remains for calendar utilities and compatibility with earlier backups.

Run `npm test` for model checks. Preview with `sites-preview start /workspace/sites/akro-daily-planner`.

## Rules

- 20 panels/cart, whole-cart loading; defaults 2 new carts/day, 12/ISO week, 9 total oven cart positions, thickness limits 9 thin / 8 thick. Capacity limits are editable assumptions, not a physical packing proof.
- Cure defaults 3/5 full days. Unload and load at the same daily time. Monday loads exit Thursday/Saturday. Output is immediately available in the closing balance; this simple model counts cured panels including staging and does not delay release for a 40-sheet pallet.
- Form at the limit whenever oven space allows. Choose the thickness with less inventory coverage relative to the next 28 days of demand, counting stock, curing panels and overdue demand. If neither has demand, favor the shorter cure. This is a full-rate forecast under a stated mix rule, not a global optimization of all mixes.
- No supermarket target cutoff: production continues building inventory even when demand is zero. Assumes materials, staffing and carts are available within entered limits.
- Weekly demand spreads over seven days. During the November 5–14 shutdown, use pauses and demand waits. Reopening allows all available stock to serve waiting demand without a withdrawal rate cap. Stock cannot go negative; shortages are shown separately.
- Starting stock defaults to zero; opening oven loads can be entered. Before-start demand is excluded. Schedule defaults to eight weeks; all 19 demand weeks remain editable.
- Version 2 uses a separate browser-local key. Existing version 1 demand, capacity settings, starting stock, shutdowns and opening loads are imported once. Advanced overrides, count adjustments and target rules are not used in this simpler model. The old local backup remains intact.

## Validation

Tests cover source reconciliation, daily/weekly/oven limits, full 3/5 day cure intervals, material balances, shutdown usage and backlog, no-demand production and opening loads. Browser QA checks weekly inputs and schedule recalculation.

## Delivery outlook presentation

The dashboard keeps the version 2 storage key, input schema and production calculations unchanged. `dashboard.js` summarizes computed rows without changing them. Full weeks are green with no waiting demand at Sunday close, red if demand remains. Partial weeks with a pacing gap are amber. Daily open-day gaps are red; planned shutdown days are amber. Invalid opening oven occupancy is flagged red.

Two charts show cured inventory minus waiting demand with a shared scale, green above zero, red below zero and amber shutdown bands. Weekly drill-through, week filtering and an exceptions-only view affect display only. Daily pacing uses evenly spread demand; weekly status is the delivery checkpoint. Status and quantities are projections from entered assumptions.

## Cart calendar and whole-sheet planning

The Cart calendar tab displays Monday–Sunday month grids, with per-thickness cart counts forming/loading, completing cure and closing sheet stock. Date buttons open load records and expected cure-completion dates. Zero-load days show when the weekly forming limit or total oven capacity binds. Limits are preserved, including the existing 12-cart/week default; no automatic switch to 14 carts/week is made.

Weekly sheet demand now rounds up once for each product/week: `ceil(cases × sheets/case)` or `ceil(Total_AKRO override)`, with a small floating-point tolerance. Entered quantities and factors remain unchanged. Whole sheets are allocated across seven days using cumulative ceilings, conserving the rounded weekly total without rounding seven separate averages upward. Opening usable stock is the whole-sheet portion of the entered count.

Closing-stock charts show physical sheet counts, with points marking waiting demand. Daily tables and CSV exports contain closing counts and signed daily changes rather than cured/used columns. Weekly output columns and the oven-output KPI are removed; cart activities appear on the calendar. Internal receipts and withdrawals remain in the material balance. Existing browser data and backup schema remain version 2.

## Holiday closures

Settings includes named holiday ranges with inclusive start/end dates. Holidays block forming, oven loading/unloading and waterjet withdrawals. Cure clocks continue through holidays, but every newly planned load must finish its full cure on a non-holiday unloading day. A holiday never extends an acceptable cure. Demand continues to become due and waits for reopening. Waterjet-only shutdowns remain separate and permit forming, oven unloading and same-day replacement loading. Overlapping holiday/shutdown ranges are treated as one pause for withdrawals; zero-load holiday days do not consume the weekly forming allowance.

Holiday names and dates persist in browser saves and JSON backups. Older version-2 plans/backups without a holidays array remain supported. Calendar badges, day details, closing-stock rows, chart shading and CSV exports identify holiday closures. Thanksgiving November 25–27 is preloaded once as described below; operators can edit or add their plant calendar.

## Pre-holiday cure preference

The November 3 update adds Thanksgiving November 25–27 once to saved plans and older backups, preserving other inputs and avoiding duplicate covering ranges. Settings includes an enabled-by-default `Favor longer-cure carts before holidays` toggle. Subsequent edits/removal of the preloaded range and disabling the toggle persist.

On pre-holiday workdays, needed longer-cure loads may be favored when their cure overlaps more of the closure. The rule checks demand through the first post-holiday long-cure receipts and yields if the other thickness needs stock before its first new post-holiday receipts can arrive. Existing pipeline counts toward coverage. Overlapping or adjacent holidays are merged for this decision. Capacity limits remain binding; neither forming nor waterjet runs on holidays. Oven clocks continue, and loads that would finish on holidays are excluded before any priority choice.

This is a dispatch preference rather than a global schedule optimizer. A pre-holiday load may still use a short cure when stock coverage or capacity requires it. Calendar and cart detail labels identify loads selected through the holiday cure rule.

### Order delivery commitments

The Order delivery tab treats each nonzero product/week as one group, preserving its existing cases and rounded Total_AKRO demand. It adds original due date (Sunday by default), optional customer-agreed later date and notes, Standard/Critical priority, and a nullable downstream calendar-day allowance (default plus per-group override). LPSUX groups for 2026-W50 and W51 are marked Critical once on migration, without replacing user quantities or subsequently resetting their choices. New groups remain Standard.

The model allocates actual whole-sheet withdrawals by group. Critical groups reserve on-hand sheets within 28 days of their Akro-needed deadline and receive forming priority ahead of ordinary balancing and holiday preferences; all forming, cure, holiday, shutdown and oven limits still apply. Reservations remain part of physical closing stock, so ordinary backlog can coexist with reserved inventory. Due dates and remaining lead time shift the group's seven-day Akro release window. Accepted extensions preserve original lateness rather than overwriting it.

Projected delivery is final Akro withdrawal plus the user-entered remaining lead-time allowance. Blank allowance never produces an on-time delivery claim; known Akro lateness is still flagged as a lower bound. Unfulfilled groups, partial horizons and out-of-range groups are explicit. These are planning forecasts, not actual shipment tracking or a downstream capacity simulation. Separate WOs for the same part/week remain aggregated. CSV and local JSON backup preserve the information; the app continues using the existing browser-local storage key.

### Physical oven occupancy and holiday unloading

The cart calendar displays closing oven occupancy as total/configured capacity plus each thickness. New planned carts unload exactly at cure completion. Conflicting opening carts remain visible in physical occupancy as exceptions, and their panels are excluded from usable inventory. Opening occupancy minus physical unloads plus new loads equals closing occupancy. The date modal records load date, cure-complete date and physical unload date separately, with a per-day occupancy balance. The daily CSV includes occupancy, overdue opening-cart counts, and panels excluded for cure conflicts.

The total oven limit has a hard ceiling of 10. A one-time migration replaces the legacy nine-cart default with 10 while retaining deliberately lower caps and all other inputs. A lower configured cap and thickness-specific limits still bind. Invalid opening occupancy is flagged and is never silently deleted or counted as available stock. Unloading happens before replacement loading on operating days. Holiday ranges are inclusive and overlapping/adjacent ranges combine for screening cure deadlines; waterjet-only shutdowns do not block oven activities. Deadline screening also considers holidays beyond the forecast horizon. Opening carts whose earliest possible removal is later than their cure deadline trigger a visible input conflict; their quantities and dates are preserved, and their panels never silently satisfy demand.

### Exact cure deadlines

Holiday cure screening is a hard eligibility rule for every thickness: load day + configured cure days must be a non-holiday unloading day. The rule runs before inventory balancing, critical-order dispatch and optional holiday preferences, and cannot be disabled by switching the preference off. A load that would finish on a holiday is skipped; early unloading and extended curing are not scheduled. The model recalculates inventory, occupancy and order delivery from the eligible loads. Calendar notes explain which thickness is blocked and the date modal gives the exact cure deadline.

Opening loads represent carts the user says are already in the oven, so the planner cannot rewrite their load dates. Any opening-cart deadline conflict is displayed across all tabs. Later physical removal is an exception only; those panels are excluded from usable stock and order allocation. Correct the entries before relying on the affected plan. This makes no claim that a delayed-cure batch is usable.

### Critical Builds progress view

The Critical builds tab follows every group currently marked Critical, with a Chicago-local today default clamped to the entered plan horizon. Operators can select any plan date, step a day forward/backward, jump to today or plan end, and view each build's Akro-readiness bar, whole-sheet stage breakdown, readiness trend, required dates and projected delivery. Existing commitment editing is available directly from each card. A selectable daily detail table and a full daily critical-progress CSV are included. Standard-only plans show an actionable empty state.

Each day records a derived snapshot after actual simulated unloading, withdrawals and new loads. Critical groups consume a shared stock and pipeline pool once, in the same priority order used by the order engine. The categories are cumulative sheets released downstream, currently reserved supermarket stock, assigned in-oven sheets and uncovered sheets; they sum to that group's requirement. Readiness is released plus reserved cured sheets, excluding curing sheets. Reservations use the existing 28-day window. In-oven supply arriving after the Akro-needed date is flagged, and conflicted opening carts are excluded from usable pipeline. Sheet allocations can share physical carts and never change the physical inventory balance.

The view is a planning forecast rather than recorded case-production or shipment actuals. Delivery status still requires the existing remaining-lead-time allowance. Partial/out-of-range groups remain explicit. No duplicate demand entries, manual progress inputs, new persistence schema, or changes to user quantities are introduced; snapshots recompute from the existing browser-local plan and remain separate from saved inputs.

### Critical build start dates and step milestones

Critical cards now trace the actual forecast supply lots used by each order, including opening cured stock, opening oven carts, and general production. Forming dates refer to new production within the horizon; the table separately identifies opening supply. Quantity allocation is unchanged. The oldest stock remains reserved for critical groups so source forming/cure dates agree with sustained inventory coverage. These are forecast dates, not recorded work completions.

The start-by estimate jointly schedules whole critical-supply carts backwards from their first required downstream release (no later than their Akro deadline). Other production stays fixed, including carts shared with standard orders. All daily, ISO-week, total-oven and thickness limits and exact holiday-safe cure deadlines apply. The alternate reserve sequence is not applied to the inventory/calendar forecast and is not claimed to be globally optimal. Invalid or incomplete horizons do not receive a confirmed start-by estimate.

Optional downstream step hours are total whole-order lead allowances for lamination, waterjet, cut-parts staging, OXB assembly, QC and shipping. Defaults apply to Critical groups only; per-order overrides can be entered in the existing delivery editor. Null means unknown/inherit; zero explicitly bypasses a step. Until all six times exist, the original total calendar-day allowance remains in use and individual step dates are unconfirmed. Complete routes replace that total allowance: 10-hour shifts, seven operating days/week, holidays closed for every stage and waterjet shutdowns closed for the waterjet stage. Downstream stages run sequentially after final Akro release and can share a shift. Backward deadlines use the same calendar, with Akro released by the preceding open shift end. A complete route also drives the projected delivery date/status. Shared downstream capacity and batch overlap are not modeled.

Existing browser storage key/schema, quantities, priority edits, total lead allowances and backups remain compatible. No downstream times are prefilled. Critical milestone CSV export includes forming, cure, release and downstream dates in ISO format.

### Product-specific batch times

The Product lead times tab uses working hours per batch. Lamination is per 20 whole sheets; all other steps are per 20 cases. Lamination is prefilled at 2 hours and is applied when Save product lead times is selected. Blank lamination saves that default; an explicit zero bypasses it. Other blanks retain earlier whole-order allowances if available.

Saved batch rates live in `part.stepRates`. Order time is rate multiplied by the order's applicable quantity divided by 20. Partial batches scale proportionally. Lamination uses the rounded whole-sheet order total, including a direct Total_AKRO override; other steps use the entered case quantity. An order with sheet demand but no known case quantity keeps positive case-rate steps unconfirmed instead of assuming zero cases. Explicit zero rates can still bypass those steps.

For example, 78 cases requiring 312 sheets need 31.2 lamination hours at 2 hours per 20 sheets. Every other batch time is multiplied by 3.9. Milestone tables display both calculated total hours and their batch/quantity basis.

Effective precedence is a whole-order order override, a quantity-scaled product batch rate, a legacy whole-order product allowance, then an existing shared critical-build allowance (Critical groups only). The earlier version-13 operating-day entries remain stored in `part.stepHours` as whole-order hours and are never silently reinterpreted as batch rates. Old backups keep their prior behavior until new batch rates are saved. Complete effective routes drive Akro deadlines and milestone dates; incomplete routes retain the aggregate calendar-day allowance. Existing cure, holiday, stock and capacity rules are unchanged.
