import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const locator = await readFile(new URL('../src/more-locator.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const report = await readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const reporter = await readFile(new URL('../src/reporter.js', import.meta.url), 'utf8');
const debugContext = await readFile(new URL('../src/report-debug-context.js', import.meta.url), 'utf8');

// A. More locator invariants: explicit aria wins; shape fallback is scoped; links and
// search/tag routes are always rejected. These source-level assertions are deterministic
// without pretending that a mock DOM is installed truth.
assert.match(locator, /explicitAriaLabel\(el\)/, 'shared locator must prioritize explicit aria labels');
assert.match(locator, /isLinkCandidate\(el\)/, 'More candidates must reject link ancestors');
assert.match(locator, /routeType\(locationLike/, 'locator must classify routes');
assert.match(locator, /serp_type=tags/, 'serp_type=tags must be rejected');
assert.match(locator, /hasProfileScope\(el, root/, 'profile shape fallback must be scoped');
assert.match(locator, /hasPostScope\(el, root\)/, 'post shape fallback must be scoped');
assert.match(locator, /hasRowScope\(el, root\)/, 'row shape fallback must be scoped');
assert.match(worker, /MoreLocator\.find\(profileRoot, \{ mode: 'profile', trustedRoot: true \}\)/, 'block must use a caller-verified profile root with shared locator');
assert.match(worker, /Core\.findProfileRoot\?\.\(user\)/, 'block caller must resolve the target username profile root first');
assert.match(report, /Core\.findProfileRoot\?\.\(user\)/, 'report caller must resolve the target username profile root first');
assert.match(report, /MoreLocator\.findCandidates\(root, \{ mode \}\)/, 'report must use the same locator');
assert.doesNotMatch(core, /\.\.\.document\.querySelectorAll\([^\n]+\),\s*document\.body,/, 'profile root discovery must not trust document.body');
assert.match(core, /unknown_dialog_schema/, 'unknown dialog collection must fail closed with an aggregate reason');

// B. A missing menu is never rate-limited; only explicit platform restriction reaches
// the cooldown counter. This guards the beta46 regression where empty menus caused cooldown.
assert.match(worker, /\['menu_not_found', 'navigation_mismatch', 'private_manual_required'\]/, 'per-user recoverable outcomes must be separate');
assert.match(worker, /result === 'rate_limited'[\s\S]{0,700}consecutiveRateLimits\+\+/, 'only explicit rate_limited results increment the counter');
assert.match(worker, /result === 'cooldown'[\s\S]{0,520}triggerCooldown/, 'only explicit cooldown results can trigger cooldown');
assert.match(worker, /result === 'cooldown'[\s\S]{0,700}consecutiveRateLimits\+\+[\s\S]{0,700}consecutiveRateLimits >= 3/, 'three explicit restriction signals are required');
assert.match(worker, /return 'menu_not_found';/, 'untrusted More/menu must fail closed');
assert.match(worker, /return 'private_manual_required';/, 'private accounts must take manual/retry path');
assert.match(report, /'navigation_mismatch'/, 'report flow must classify navigation mismatch');

// C. Privacy-safe beta47 snapshot and message-only reporting.
assert.match(debugContext, /SCHEMA: 'threadsblocker\.debug_context_v2'/, 'failure snapshot schema must be versioned');
assert.match(core, /reportDebugContextV2: safeDebugContext/, 'debug_context_v2 must be available only in the opted-in diagnostics bundle');
assert.match(debugContext, /MAX_EVENTS: 25/, 'failure snapshot must be capped');
assert.match(debugContext, /TTL_MS: 48 \* 60 \* 60 \* 1000/, 'failure snapshot TTL must be 48 hours');
assert.match(core, /clearReportFailureSnapshots/, 'successful report must clear failure snapshots');
assert.doesNotMatch(worker, /clearReportFailureSnapshots/, 'unrelated block/unblock success must not clear report snapshots');
assert.match(core, /ReportDebugContext\.append/, 'core must use the closed snapshot validator');
assert.match(locator, /detectPrivateProfileState\(root\)/, 'private state must be detected from a positive profile scope');
assert.doesNotMatch(worker, /const pageTextForPrivacy = document\.body/, 'worker must not infer private state from unrelated body text');
assert.doesNotMatch(report, /const pageText = document\.body\?\.innerText[\s\S]{0,240}private/i, 'report flow must not infer private state from unrelated body text');
assert.match(report, /Worker\.noteReportRateLimit/, 'report-only restriction must use report reminder path');
assert.doesNotMatch(report, /triggerCooldown/, 'report-only restriction must not share block cooldown');
// ADR 0013：完整附件仍需逐次同意，但輕量層改為一律附帶，因此不再斷言
// 「沒同意就送空 metadata」。改為守住真正的邊界：完整附件受同意控制，
// 且 reporter 不得自己去蒐集環境資料（只能轉送 Core 交來的輕量層）。
assert.match(reporter, /const hasDiagnosticConsent = rawMetadata\.diagnosticConsent === true;/, 'full attachment must stay per-report opt-in');
assert.match(reporter, /: lightweightMetadata\n\s*\};/, 'reports without consent must still carry the lightweight layer');
assert.doesNotMatch(reporter, /Reporter\.collectClientEnv\(\)/, 'reporter must not harvest environment on its own');
assert.match(ui, /不勾也可以，只送你寫的問題描述/, 'modal must disclose message-only path');
assert.match(ui, /送出時會一併附上技術資訊/, 'modal must disclose the lightweight layer at collection time');
assert.doesNotMatch(ui, /未同意不會送出回報/, 'modal must not block message-only reporting');

console.log('beta47 safety regressions: PASS locator/scopes/routes, result split, snapshot TTL/cap/clear, message-only consent');
