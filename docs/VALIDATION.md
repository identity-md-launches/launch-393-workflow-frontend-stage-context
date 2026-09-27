# Frontend validation — Trickle

Worker validation on 2026-09-27. **Implementation and validation complete for the authorized frontend scope; Git staging/commit blocked by read-only repository metadata.** This is evidence from the implementing worker, not independent certification. The source, lockfile, production export, ABIs, deployment inventory and documentation are delivered together. No contract source or root build configuration changed.

## Scope and assumptions

One English, light-theme page for the existing Sepolia deployment. It includes connect/disconnect, missing-wallet and wrong-network states, approve/stake, withdraw, claim, exit, donate and restream, plus public/account reads and transaction status. The approved workflow explicitly says **no in-page swap**; the page explains how TRKL is obtained externally. There are no swap quotes, router approvals or liquidity actions to configure or test.

The handoff's two implementation ABI exports were read from deployed source commit `eb6bd8205f166c826b4eff98e1e1287626f09687`. Both raw files are byte-identical to that revision and their canonical Keccak hashes match. The application checks those ABI hashes from its sole runtime `dist/imd-deployment.json`, verifies the RPC chain and contract code presence, and requires staking `token()` to match LaunchToken before enabling actions. Runtime configuration is supplied/attested data; code presence is not proof of full bytecode equivalence or contract safety.

The request also names root `DESIGN.md`, but its higher-priority write allowlist permits only `web/**`, `dist/**`, `docs/**` and explicitly `web/.gitignore`. The implemented design record is therefore `docs/DESIGN.md`; no out-of-scope root document was created. The only ignore file is `web/.gitignore`, 175 bytes, with an explicit 512-byte path budget.

## Commands and outcomes

| Check | Outcome |
| --- | --- |
| `npm install --prefix web --cache /tmp/trickle-npm-cache --no-audit --no-fund` (plus recorded dev dependency additions) | Installed successfully; lockfile under `web/`. Cache outside submission. |
| `npm run typecheck --prefix web` | Exit 0, final source; strict TypeScript. |
| `npm run build --prefix web` | Exit 0, final source; Vite relative base, root `dist/`. No final chunk-size warning after splitting React/chain bundles. |
| `npm run verify --prefix web` | Exit 0; 7 enumerated assets, 561,027 bytes excluding manifest, exact handoff and network bindings, both canonical ABI hashes. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/imd2/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm test --prefix web` | Exit 0; 24 production-browser interaction checks. Final export hashes are recorded in `frontend/interaction-results.json`. |
| `npm run check:rpc --prefix web` | Exit 0; all three configured public RPCs returned chain 11155111, token bytecode 1,723 bytes, staking bytecode 3,595 bytes, and the expected `token()`. |
| Foreground Vite `createServer` + Chromium smoke check | Development page loaded live chain state, deployment config and ABI files without page errors. Preview/browser closed afterward. |
| Browser tool against final export at `/preview/` | Desktop/mobile rendered review, live RPC state, console/resource inspection, and visible focus review. |

The test runner owns a foreground static HTTP server and closes it and Chromium. The browser-tool preview was also a bounded foreground server, with a session-specific port; that URL is not a published site.

The final static export is about 0.54 MiB, with 7 declared assets plus the manifest, far below 128 files, 8 MiB per file and the publication response-body budget. Final submission-size and path inspection is recorded separately in `frontend/package-report.json`.

## Interaction evidence

`web/tests/interactions.mjs` drives real Chromium against the built JavaScript. The mock fixture intercepts public RPC URLs and injects EIP-1193; it has no private key and sends no network transaction. The tests cover:

- Gateway-subpath loading, disconnected controls, no wallet, rejected connection and recovery.
- Wrong chain; 4902 failure, exact supplied `wallet_addEthereumChain` parameters, subsequent switch, and state recovery.
- Zero, excessive balance and overprecision inputs; field errors and focus; Max and token decimal formatting.
- Exact-amount token approval followed by separate stake; simulation, wallet request, successful receipt and refreshed balances/allowance.
- Withdraw, claim while preserving stake, atomic exit, minimum donation, queued active-stream top-up, ended-rate zero, restream eligibility, and zero-total-stake messaging.
- Simulation revert preventing signing, user rejection without a transaction, reverted receipt, account/chain events, RPC failure and retry, missing code, incorrect `token()`, wrong RPC chain and a tampered ABI.
- Keyboard form activation, accessibility scans at desktop/320px, reduced-motion emulation, 200% text enlargement, and no uncaught JavaScript errors.

These mocks test frontend dispatch, gating, presentation and ABI encoding against known responses. Their arithmetic is test scaffolding, not independent validation of Solidity reward conservation. No Foundry tests or Solidity modifications were part of this frontend stage.

## Better Interface: all six domains

Applied the pinned guide while building, then reviewed final source and rendered output. Attribution and implemented design tokens are in `DESIGN.md`.

| Domain | Coverage and evidence |
| --- | --- |
| Accessibility — Checked | Native buttons/links/forms/details, bound labels, `aria-pressed`, field error association/focus, persistent status and alert regions, disabled prerequisite states, skip link, visible focus and reduced-motion guard. Axe: zero violations at 1280 and 320px. Keyboard amount validation/approval exercised. Screen-reader and every-control manual keyboard sessions were not performed. |
| Layout — Checked | Actual screenshots and document-width measurements at 320, 390, 704, 880, 1280px; no horizontal overflow. Panels stack, long numbers wrap, controls stay inset. 200% root text enlargement passed. Native browser 200% zoom, RTL and translations were not tested (English LTR only). |
| Writing — Checked | Labels map to contract actions; approve/stake steps are distinct; claim/exit consequences and irreversible donations are explained. Stream/carry/minimum/restream restrictions, test-only network, no promised return, and no APR/forecast are stated. Recoverable wallet/read/signing errors name next steps. |
| Typography — Checked | Descending heading roles, 1.5 body and 1.6 caption line heights, 24px amount inputs, tabular numbers, identifier wrapping and no external font dependency. 320px and desktop screenshots reviewed. Exact platform font fallback varies; no claim of identical typography on other operating systems. |
| Colors — Checked | Semantic tokens, text alongside status colors, computed foreground/background contrast from actual visible page states. Ratios: muted/page 4.93, muted/stream 4.55, heading/stream 11.77, primary text/fill 8.32, visible error/panel 7.84. Full numeric evidence in JSON. Only the implemented light theme was reviewed. |
| UI — Checked | Loading, empty, disabled, approved, pending, error and confirmed states; grouped input units/Max, structural borders and consistent panels. Focus shown on mobile connection and amount input. No animation except guarded 120ms button transitions. Slow-motion animation-panel playback and native touch behavior were not tested. |

Not applicable: modals/focus traps, drag-and-drop, autoplay, dark theme, localization and routed pages. These were not added simply to satisfy a checklist.

## Findings, corrections and rechecks

| Severity | Source | Evidence / correction | Recheck |
| --- | --- | --- | --- |
| Low — UI/resources | `web/index.html:11` | Browser requested absent `/favicon.ico` (404). Added a local data-URL SVG favicon matching the mark. | Final navigation: zero console errors/warnings; exported HTML/assets/ABIs/config and RPC requests succeeded. |
| Medium — writing/transaction state | `web/src/App.tsx:238` | Source review found a replacement/cancellation receipt could be worded as confirmation of the requested action. Track viem replacement reason and explicitly describe confirmation of a different transaction. Removed indefinitely “being refreshed” success wording. | Final typecheck/build and existing receipt checks pass. The timed replacement branch itself remains source-reviewed, not end-to-end emulated. |
| Low — tooling | `web/vite.config.ts:10` | Development mode originally had no runtime manifest route. Added dev-only middleware for the same built manifest and referenced ABIs; no parallel runtime configuration. | Vite + Chromium loaded live contract views, manifest and ABIs successfully. |

Early test harness failures came from waiting for the wrong footer text, including decorative hidden arrows in accessible button names, and comparing checksummed addresses case-sensitively. Corrected the harness to match semantic names, actual read completion and address identity; final 24 checks pass. A preliminary dev smoke probe closed Vite before dependency scanning completed; the subsequent browser-based smoke check waited for chain data and closed cleanly.

## Rendered evidence and limits

- `frontend/desktop-disconnected.png`: mocked active public stream, disconnected wallet.
- `frontend/connected-1280.png`, `connected-390.png`, `connected-320.png`: final production export with mocked connected account and completed approval; the 320px view shows the focused amount field.
- `frontend/live-desktop.png`, `live-mobile.png`: actual public-chain disconnected views, observed empty total stake / no started reward stream at review time.
- `frontend/browser-console.txt`, `browser-network.txt`: final browser-tool resource/console capture.
- `frontend/live-rpc.json`: read-only observations across the three supplied RPCs.
- `frontend/interaction-results.json`: complete check list, final asset hashes, viewport metrics and contrast measurements.

No live wallet transaction, real swap, funds transfer, publication, fixed-CID HTTP check or named-entrypoint check was performed. The publisher/control plane runs publication checks later. Wallet fallback transport failure, long confirmation timeout/retry, replaced/cancelled transactions, chain/account changes precisely during a signature dialog, other wallet brands, Safari/Firefox, real screen readers, physical mobile devices, native zoom and forced-colors rendering are not end-to-end verified. Wallet safety checks and those receipt states are implemented but should not be inferred as tested from successful mocked flows.

## Git delivery limitation

`git add -- web dist docs/DESIGN.md docs/VALIDATION.md docs/frontend` was attempted. Git reported `Unable to create .git/index.lock: Read-only file system`. The workspace policy provides read-only `.git`; escalation is unavailable. No commit was created or claimed. All complete source/export/evidence files remain in the allowed workspace paths for collection by the publisher. No alternate repository or duplicate bundle was added to the submission.
