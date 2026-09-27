# Trickle frontend

One static page for the deployed Trickle / ETHStakingRewards Sepolia experiment. Stake TRKL and share donated test ETH. This is a Sepolia test toy, with no promised yield or return. There is no backend, indexer, price oracle, or in-page swap. TRKL comes from swapping Sepolia ETH in the external launch pool, as the approved workflow specifies.

## Install, build, preview

Use Node.js 22.12+ (worker: Node 24.21.0) and npm. From the repository root:

```sh
npm ci --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run verify --prefix web
npm run preview --prefix web
```

The build writes the complete production site to root `dist/`, then exports the ABIs and generates `dist/imd-deployment.json` from the final bytes. Serve **all** of `dist/` as static files. `base: './'` supports gateway subpaths and named entrypoints without rewrites. No external fonts or image servers are required. RPCs and the visitor's wallet are runtime connections, not a server-side component.

For local editing, run `npm run build --prefix web` once, then `npm run dev --prefix web`. The Vite development middleware serves the built deployment configuration and ABI files; React source uses Vite's normal hot reload. Rebuild when configuration or ABI inputs change. The publisher hosts the committed `dist/` without rebuilding.

## Deployment configuration

`web/deployment/deployment.json` and `web/deployment/network.json` preserve the supplied handoff. They are build inputs, never separate address maps imported by the app. `src/config.ts` loads **only the exported `imd-deployment.json`** for runtime network, chain, contract addresses, ABI paths and hashes. `walletAddChain` is an additional manifest field containing the supplied wallet parameters exactly; `network` is preserved unchanged. Public RPCs need no secrets. No WalletConnect project ID was supplied, so connection uses the injected Ethereum browser wallet (`window.ethereum`); mobile users can use that wallet's browser. Multi-wallet discovery and WalletConnect are not implemented.

The exporter obtains each ABI from `docs/abi/<Contract>.json`, verifies its exact bytes against `git show <deployed sourceCommit>:docs/abi/<Contract>.json`, then verifies Keccak-256 of recursively key-sorted compact JSON (array order preserved). Both canonical hashes match the handoff. Keep the pinned source commit in local Git history when rebuilding. The application fetches those same raw ABI arrays and verifies their canonical hashes again.

`npm run verify --prefix web` checks the complete final asset inventory, SHA-256 hashes, handoff fields, network and wallet parameters, and pinned ABI bindings without changing the export. The manifest excludes itself. Rebuild after any change to exported bytes. No private credentials are present. The supplied handoff is trusted input; the frontend does not independently verify a signed attestation or prove deployed bytecode equivalence from a creation-code hash.

## Contract behavior and transaction flow

- Reads before connection show public stream state. Connected reads add TRKL balance, allowance, stake, earned ETH and native balance. Data comes from contract views at one block, refreshes every 12 seconds and after receipts, and includes the observed block/time.
- `token()` determines the token used for reads and approvals and must match the attested LaunchToken. The RPC chain and nonempty code of every deployed contract are checked. Failed or stale reads, a missing wallet, and the wrong wallet network disable transactions.
- The countdown uses the latest observed block timestamp, not an extrapolated computer clock. `currentRate()` becomes zero at the stream end. The daily normalized indicator is `currentRate * 86400 * (1_000_000 * 10^decimals) / totalStaked`, computed with bigint. It is not APR or a promised payout. No stake shows an explanation rather than a fabricated rate.
- Approve replaces the staking allowance with the exact entered amount, then stake is a separate transaction. Approval is to the staking contract, not a swap router. Withdraw preserves earned ETH; claim preserves stake; exit withdraws all stake and claims atomically.
- A donation must be at least the contract's `MIN_REWARD()` and leave native currency for gas. During an active stream it goes to carry without changing rate or end. Otherwise it starts a seven-day stream together with carry. Donations cannot be reclaimed by donors.
- Restart from carry calls `restream()`. It is available after the stream ends, with positive total stake and carry at least `MIN_REWARD()`. No donor, owner or administrator is required.
- Every transaction rechecks current reads, account and network, then simulates before signing. A per-operation lock prevents duplicate submissions. Confirmation, rejection, simulation reverts, reverted receipts, replacements, and confirmation timeouts have visible status. A timed-out receipt keeps writes locked until the visitor checks confirmation. Account/network changes invalidate pending pre-sign work.
- Chain switching offers `wallet_addEthereumChain` after an unknown-chain / 4902 switch failure, using the supplied parameters, and then switches again. Public RPCs have ordered fallback, with the connected provider as a final fallback only on the correct chain.

## Validation

```sh
# Install a Playwright browser if one is not already available:
cd web
npx playwright install chromium
npm test
npm run check:rpc
```

Alternatively, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium executable. Browser binaries belong in an external cache, not Git. Tests start and close their own foreground HTTP server, serve `dist/` at `/preview/`, inject a mocked EIP-1193 wallet, and intercept all public RPC calls. They exercise controls against the production bundle without real funds or transaction broadcasts. `check:rpc` is read-only and records each configured public RPC's chain, code presence, and token binding.

Evidence: [`docs/VALIDATION.md`](../docs/VALIDATION.md), [`docs/DESIGN.md`](../docs/DESIGN.md), screenshots and machine-readable results in `docs/frontend/`. The design document lives under `docs/` because the task's explicit write allowlist excludes repository-root `DESIGN.md`.

No live wallet transaction, swap, publication, IPFS pin, or naming operation was performed. See validation for untested browser, wallet, and receipt edge cases. Worker checks are not independent network certification.

## Packaging

The only ignore-file change is the explicitly allowed `web/.gitignore` (175 bytes against a declared 512-byte path budget). Its patterns exclude dependency and cache directories at every nesting depth under `web/`. Dependencies use `web/package-lock.json`; no dependency archives, caches, registry mirror, node_modules, or submodules are submitted. Contract sources and root configuration are unchanged.
