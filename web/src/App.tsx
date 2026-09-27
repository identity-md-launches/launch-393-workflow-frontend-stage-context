import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { formatUnits, type Address, type Hash } from "viem";
import { loadDeployment, reader, type Config, type Provider } from "./config";
import {
  amount,
  countdown,
  dailyRate,
  errorMessage,
  number,
  readSnapshot,
  sendAction,
  switchNetwork,
  type Action,
  type Snapshot,
} from "./chain";
const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
function AmountField({
  id,
  label,
  value,
  setValue,
  unit,
  error,
  max,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (v: string) => void;
  unit: string;
  error?: string;
  max?: () => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{unit}</span>
        {max && (
          <button className="max" type="button" onClick={max}>
            Max
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function App() {
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState("");
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState("");
  const [walletError, setWalletError] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [mode, setMode] = useState<"stake" | "withdraw">("stake");
  const [input, setInput] = useState("");
  const [donation, setDonation] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [donationError, setDonationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [txError, setTxError] = useState("");
  const [txHash, setTxHash] = useState<Hash>();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const identity = useRef(0);
  const lock = useRef(false);
  const loadGeneration = useRef(0);
  const localDisconnect = useRef(false);
  const provider = useRef<Provider | undefined>(window.ethereum);
  const correctChain = !!config && walletChain === config.chain.id;
  const accountData =
    snapshot && snapshot.account?.toLowerCase() === account?.toLowerCase()
      ? snapshot
      : undefined;
  const stale = !!snapshot && clock - snapshot.fetchedAt > 60000;
  const ready = !!(
    config &&
    account &&
    correctChain &&
    accountData &&
    !readError &&
    !stale &&
    !busy &&
    !walletBusy
  );
  useEffect(() => {
    loadDeployment()
      .then(setConfig)
      .catch((e) => setFatal(errorMessage(e)));
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const p = provider.current;
    if (!p) return;
    const accounts = (...args: unknown[]) => {
      identity.current++;
      setAccount((args[0] as Address[])?.[0]);
      setSnapshot(undefined);
      setInput("");
      setWalletError("");
    };
    const chain = (...args: unknown[]) => {
      identity.current++;
      setWalletChain(Number(BigInt(args[0] as string)));
      setSnapshot(undefined);
    };
    const disconnect = () => {
      identity.current++;
      setAccount(undefined);
      setWalletChain(undefined);
      setSnapshot(undefined);
    };
    p.on?.("accountsChanged", accounts);
    p.on?.("chainChanged", chain);
    p.on?.("disconnect", disconnect);
    const epoch = identity.current;
    Promise.all([
      p.request({ method: "eth_accounts" }),
      p.request({ method: "eth_chainId" }),
    ])
      .then(([a, id]) => {
        if (identity.current === epoch && !localDisconnect.current) {
          setAccount(a[0]);
          setWalletChain(Number(BigInt(id)));
        }
      })
      .catch(() => {});
    return () => {
      p.removeListener?.("accountsChanged", accounts);
      p.removeListener?.("chainChanged", chain);
      p.removeListener?.("disconnect", disconnect);
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!config) return;
    const generation = ++loadGeneration.current;
    const epoch = identity.current;
    setLoading(true);
    try {
      const s = await readSnapshot(
        config,
        reader(config, correctChain ? provider.current : undefined),
        account,
      );
      if (generation === loadGeneration.current && epoch === identity.current) {
        setSnapshot(s);
        setReadError("");
      }
    } catch (e) {
      if (generation === loadGeneration.current && epoch === identity.current)
        setReadError(errorMessage(e));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [config, account, correctChain]);
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 12000);
    return () => {
      clearInterval(t);
      loadGeneration.current++;
    };
  }, [refresh]);
  async function connect() {
    setWalletError("");
    const p = provider.current ?? window.ethereum;
    if (!p) {
      setWalletError(
        "No browser wallet found. Open this page in an Ethereum wallet’s browser, or install a browser wallet, then reload.",
      );
      return;
    }
    provider.current = p;
    setWalletBusy(true);
    try {
      const addresses = await p.request({ method: "eth_requestAccounts" });
      const chain = await p.request({ method: "eth_chainId" });
      identity.current++;
      localDisconnect.current = false;
      setAccount(addresses[0]);
      setWalletChain(Number(BigInt(chain)));
      setSnapshot(undefined);
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setWalletBusy(false);
    }
  }
  async function switchChain() {
    if (!config || !provider.current) return;
    setWalletBusy(true);
    setWalletError("");
    try {
      await switchNetwork(config, provider.current);
      identity.current++;
      setWalletChain(
        Number(
          BigInt(await provider.current.request({ method: "eth_chainId" })),
        ),
      );
      setSnapshot(undefined);
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setWalletBusy(false);
    }
  }
  async function confirm(hash: Hash) {
    if (!config) return;
    try {
      let replacementReason = "";
      const receipt = await reader(
        config,
        correctChain ? provider.current : undefined,
      ).waitForTransactionReceipt({
        hash,
        timeout: 120000,
        confirmations: 1,
        onReplaced: ({ transaction, reason }) => {
          replacementReason = reason;
          setTxHash(transaction.hash);
          setStatus("Transaction replaced. Waiting for confirmation…");
        },
      });
      setUnconfirmed(false);
      lock.current = false;
      setBusy(false);
      if (
        replacementReason === "cancelled" ||
        replacementReason === "replaced"
      ) {
        setStatus(
          "A different replacement transaction was confirmed. Review it in the explorer; your original action may not have completed.",
        );
        await refresh();
      } else if (receipt.status === "reverted") {
        setStatus("");
        setTxError(
          "Transaction reverted on chain. Check the explorer for details, refresh, and try again.",
        );
      } else {
        setStatus("Transaction confirmed.");
        await refresh();
      }
    } catch {
      setStatus(
        "Confirmation is taking longer than expected. Check the transaction in the explorer or check confirmation again.",
      );
      setUnconfirmed(true);
    }
  }
  async function transact(action: Action, value = "") {
    if (!ready || !config || !account || !provider.current || lock.current)
      return;
    lock.current = true;
    setBusy(true);
    setTxError("");
    setTxHash(undefined);
    setUnconfirmed(false);
    setStatus("Checking the latest state and simulating your transaction…");
    const epoch = identity.current;
    try {
      const hash = await sendAction(
        config,
        reader(config, provider.current),
        provider.current,
        account,
        action,
        value,
        () => identity.current === epoch,
        () => setStatus("Review this transaction in your wallet."),
      );
      setTxHash(hash);
      setStatus("Transaction submitted. Waiting for confirmation…");
      await confirm(hash);
    } catch (e) {
      setStatus("");
      setTxError(errorMessage(e));
      lock.current = false;
      setBusy(false);
    }
  }
  let parsed = 0n;
  try {
    parsed = amount(input, snapshot?.decimals ?? 18);
  } catch {
    /* Invalid amounts are explained on submit. */
  }
  const needsApproval =
    mode === "stake" && (!parsed || (accountData?.allowance ?? 0n) < parsed);
  function submitPosition(e: FormEvent) {
    e.preventDefault();
    setFieldError("");
    try {
      const value = amount(input, snapshot?.decimals ?? 18);
      if (
        value >
        (mode === "stake"
          ? (accountData?.balance ?? 0n)
          : (accountData?.staked ?? 0n))
      )
        throw Error(
          mode === "stake"
            ? "Amount exceeds your available TRKL balance."
            : "Amount exceeds your staked TRKL.",
        );
      void transact(
        mode === "withdraw" ? "withdraw" : needsApproval ? "approve" : "stake",
        input,
      );
    } catch (e) {
      setFieldError(errorMessage(e));
      document.getElementById("position-amount")?.focus();
    }
  }
  function submitDonation(e: FormEvent) {
    e.preventDefault();
    setDonationError("");
    try {
      const value = amount(donation, 18);
      if (snapshot && value < snapshot.minimum)
        throw Error(`Add at least ${formatUnits(snapshot.minimum, 18)} ETH.`);
      if (snapshot && value >= snapshot.eth)
        throw Error("Leave some ETH in your wallet for network gas.");
      void transact("notifyRewardAmount", donation);
    } catch (e) {
      setDonationError(errorMessage(e));
      document.getElementById("donation")?.focus();
    }
  }
  const active = !!snapshot && snapshot.finish > snapshot.timestamp;
  const remaining = snapshot ? snapshot.finish - snapshot.timestamp : 0n;
  const restartable =
    !!snapshot &&
    !active &&
    snapshot.total > 0n &&
    snapshot.carry >= snapshot.minimum;
  const value = (n?: bigint, decimals = 18, precision = 6) =>
    n === undefined ? "—" : number(n, decimals, precision);
  const personal = account ? accountData : undefined;
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header shell">
        <a href="./" className="brand" aria-label="Trickle home">
          <svg viewBox="0 0 32 40" aria-hidden="true">
            <path
              d="M16 2C13 10 3 19 3 26a13 13 0 0 0 26 0C29 19 19 10 16 2Z"
              fill="currentColor"
            />
            <path
              d="M9 25a7 7 0 0 0 7 8"
              fill="none"
              stroke="var(--surface)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          trickle<span className="wordmark-dot">.</span>
        </a>
        <div className="wallet-bar">
          <span className="network-tag">
            <span className="dot" />
            {config?.manifest.network.name ?? "Test network"}
          </span>
          {account ? (
            <>
              <a
                className="wallet-address"
                href={`${config?.manifest.network.explorer}/address/${account}`}
                title={account}
              >
                {short(account)} ↗
              </a>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => {
                  identity.current++;
                  localDisconnect.current = true;
                  setAccount(undefined);
                  setSnapshot(undefined);
                  setWalletError("");
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="connect"
              onClick={() => void connect()}
              disabled={walletBusy || !!fatal}
            >
              {walletBusy ? "Connecting…" : "Connect wallet"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </header>
      <main id="main" className="shell">
        <section className="intro">
          <div>
            <p className="eyebrow">A small on-chain experiment</p>
            <h1>
              A little stake.
              <br />
              <em>A steady trickle.</em>
            </h1>
            <p className="intro-copy">
              Stake TRKL. Share donated test ETH as it streams to stakers over
              seven days.
            </p>
          </div>
          <div className="intro-note">
            <span className="note-mark" aria-hidden="true">
              ↘
            </span>
            <p>
              Sepolia test toy.
              <br />
              No yield or return is promised.
              <br />
              <span>Just test tokens, flowing on chain.</span>
            </p>
          </div>
        </section>
        {fatal && (
          <div role="alert" className="notice error">
            <strong>Deployment unavailable</strong>
            <p>{fatal}</p>
            <button onClick={() => location.reload()}>
              Reload configuration
            </button>
          </div>
        )}
        {walletError && (
          <div role="alert" className="notice error">
            {walletError}
          </div>
        )}
        {account && !correctChain && config && (
          <div className="notice warning">
            <div>
              <strong>Switch your wallet to {config.chain.name}</strong>
              <p>
                Your wallet is on chain {walletChain ?? "unknown"}. Transactions
                are unavailable until it matches.
              </p>
            </div>
            <button
              onClick={() => void switchChain()}
              disabled={walletBusy || busy}
            >
              {walletBusy ? "Switching…" : `Switch to ${config.chain.name}`}
            </button>
          </div>
        )}
        {(readError || stale) && (
          <div className="notice error" role="alert">
            <div>
              <strong>Live reads are unavailable. Actions are paused.</strong>
              <p>{readError || "The last update is over a minute old."}</p>
            </div>
            <button disabled={loading} onClick={() => void refresh()}>
              Retry reads
            </button>
          </div>
        )}
        <section className="stream panel" aria-labelledby="stream-title">
          <div className="section-heading">
            <h2 id="stream-title">The reward stream</h2>
            <span className="status-pill">
              <span className={`dot ${active ? "" : "inactive"}`} />
              {!snapshot
                ? "Reading chain…"
                : stale || readError
                  ? "Last known state"
                  : active
                    ? "Streaming"
                    : "Between streams"}
            </span>
          </div>
          <div className="stream-grid">
            <div className="stream-main">
              <p className="label">ETH per day / 1,000,000 TRKL staked</p>
              <p
                className="hero-value"
                title={
                  snapshot ? formatUnits(dailyRate(snapshot), 18) : undefined
                }
              >
                {snapshot?.total === 0n
                  ? "—"
                  : value(snapshot ? dailyRate(snapshot) : undefined)}
                <span>ETH</span>
              </p>
              <p className="caption">
                {snapshot?.total === 0n
                  ? "No active stake. Scheduled ETH goes to carry."
                  : "At the current rate and total stake. Your share changes as people stake or withdraw."}
              </p>
              <div className="stream-track" aria-hidden="true">
                <span
                  style={{
                    width:
                      snapshot && active
                        ? `${Math.max(1, Math.min(100, Number((remaining * 100n) / snapshot.duration)))}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="stream-foot">
                A rate indicator, never a forecast or % APR.
              </p>
            </div>
            <dl className="stream-stats">
              <div>
                <dt>Time remaining</dt>
                <dd>
                  {snapshot
                    ? snapshot.finish === 0n
                      ? "Not started"
                      : countdown(remaining)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Total staked</dt>
                <dd>
                  {value(snapshot?.total, snapshot?.decimals, 2)}{" "}
                  <span>TRKL</span>
                </dd>
              </div>
              <div>
                <dt>Current stream rate</dt>
                <dd>
                  {value(snapshot?.rate, 18, 12)} <span>ETH / sec</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <div className="workspace">
          <section className="position panel" aria-labelledby="position-title">
            <div className="section-heading">
              <h2 id="position-title">Your position</h2>
              <span className="section-number">01</span>
            </div>
            <div className="personal-stats">
              <div>
                <p className="label">Staked TRKL</p>
                <p
                  className="position-value"
                  title={
                    personal
                      ? formatUnits(personal.staked, personal.decimals)
                      : undefined
                  }
                >
                  {value(personal?.staked, snapshot?.decimals, 4)}{" "}
                  <span>TRKL</span>
                </p>
              </div>
              <div>
                <p className="label">Earned ETH</p>
                <p
                  className="position-value"
                  title={
                    personal ? formatUnits(personal.earned, 18) : undefined
                  }
                >
                  {value(personal?.earned)} <span>ETH</span>
                </p>
              </div>
            </div>
            <div className="claim-row">
              <button
                disabled={!ready || !personal?.earned}
                onClick={() => void transact("getReward")}
              >
                Claim ETH <span aria-hidden="true">↗</span>
              </button>
              <button
                disabled={!ready || (!personal?.staked && !personal?.earned)}
                onClick={() => void transact("exit")}
              >
                Withdraw all & claim
              </button>
            </div>
            <p className="caption">
              Claim keeps your stake in place. Withdraw all & claim returns all
              your TRKL and earned ETH to your wallet.
            </p>
            <div className="form-divider" />
            <div
              className="mode-switch"
              role="group"
              aria-label="Position action"
            >
              <button
                aria-pressed={mode === "stake"}
                onClick={() => {
                  setMode("stake");
                  setFieldError("");
                  setInput("");
                }}
              >
                Stake
              </button>
              <button
                aria-pressed={mode === "withdraw"}
                onClick={() => {
                  setMode("withdraw");
                  setFieldError("");
                  setInput("");
                }}
              >
                Withdraw
              </button>
            </div>
            <form onSubmit={submitPosition} noValidate>
              <AmountField
                id="position-amount"
                label={
                  mode === "stake" ? "Amount to stake" : "Amount to withdraw"
                }
                value={input}
                setValue={(v) => {
                  setInput(v);
                  setFieldError("");
                }}
                unit="TRKL"
                error={fieldError}
                max={
                  personal
                    ? () => {
                        setInput(
                          formatUnits(
                            mode === "stake"
                              ? personal.balance
                              : personal.staked,
                            personal.decimals,
                          ),
                        );
                        setFieldError("");
                      }
                    : undefined
                }
              />
              <div className="balance-row">
                <span>Wallet balance</span>
                <span
                  title={
                    personal
                      ? formatUnits(personal.balance, personal.decimals)
                      : undefined
                  }
                >
                  {value(personal?.balance, snapshot?.decimals, 4)} TRKL
                </span>
              </div>
              <div className="balance-row">
                <span>Staking allowance</span>
                <span
                  title={
                    personal
                      ? formatUnits(personal.allowance, personal.decimals)
                      : undefined
                  }
                >
                  {value(personal?.allowance, snapshot?.decimals, 4)} TRKL
                </span>
              </div>
              {mode === "stake" && (
                <ol className="steps">
                  <li className={needsApproval ? "selected" : ""}>
                    <span>1</span> Approve TRKL
                  </li>
                  <li className={!needsApproval ? "selected" : ""}>
                    <span>2</span> Stake TRKL
                  </li>
                </ol>
              )}
              <button className="primary wide" disabled={!ready} type="submit">
                {busy
                  ? "Transaction in progress…"
                  : mode === "withdraw"
                    ? "Withdraw TRKL"
                    : needsApproval
                      ? "Approve TRKL"
                      : "Stake TRKL"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
              <p className="caption action-help">
                {!account
                  ? "Connect your wallet to manage your stake."
                  : mode === "withdraw"
                    ? "Returns this amount of TRKL. Earned ETH remains available to claim."
                    : needsApproval
                      ? "Approve only the entered amount for the staking contract. Then stake in a separate transaction."
                      : "Moves the entered TRKL into the staking contract. You can withdraw at any time."}
              </p>
            </form>
          </section>
          <aside className="right-column">
            <section className="rewards panel" aria-labelledby="rewards-title">
              <div className="section-heading">
                <h2 id="rewards-title">Keep it flowing</h2>
                <span className="section-number">02</span>
              </div>
              <p className="section-description">
                Anyone can add test ETH to the reward stream. Every contribution
                is shared by stakers.
              </p>
              <div className="carry-row">
                <span>Queued for the next stream</span>
                <strong>
                  {value(snapshot?.carry)} <small>ETH</small>
                </strong>
              </div>
              <form onSubmit={submitDonation} noValidate>
                <AmountField
                  id="donation"
                  label="ETH to add"
                  unit="ETH"
                  value={donation}
                  setValue={(v) => {
                    setDonation(v);
                    setDonationError("");
                  }}
                  error={donationError}
                />
                <p className="caption">
                  Minimum {value(snapshot?.minimum)} ETH · Wallet{" "}
                  {value(personal?.eth)} ETH
                </p>
                <button className="wide" disabled={!ready} type="submit">
                  Add rewards <span aria-hidden="true">+</span>
                </button>
              </form>
              <p className="caption">
                {active
                  ? "This contribution joins carry for the next stream. The current rate and end time stay the same."
                  : "This contribution and carry start a new seven-day stream. With no stake, scheduled ETH returns to carry."}{" "}
                Contributions cannot be withdrawn by the donor.
              </p>
              <div className="restart">
                <button
                  className="text-button"
                  disabled={!ready || !restartable}
                  onClick={() => void transact("restream")}
                >
                  Restart from carry <span aria-hidden="true">↻</span>
                </button>
                <p className="caption">
                  Available after the stream ends, with active stake and at
                  least {value(snapshot?.minimum)} ETH in carry. Starts seven
                  days without a new donation.
                </p>
              </div>
            </section>
            <section className="getting-started">
              <span className="small-drop" aria-hidden="true">
                ↓
              </span>
              <div>
                <h2>New to TRKL?</h2>
                <p>
                  TRKL comes from swapping Sepolia ETH in the launch pool. Swap
                  outside this page, then return to stake.
                </p>
                {config && (
                  <a
                    href={`${config.manifest.network.explorer}/token/${config.token.address}`}
                  >
                    View TRKL on the explorer ↗
                  </a>
                )}
              </div>
            </section>
          </aside>
        </div>
        <section
          className={`transaction-status ${status || txError ? "has-status" : ""}`}
          aria-label="Transaction status"
        >
          <p role="status">{status}</p>
          <p role="alert" className="field-error">
            {txError}
          </p>
          {txHash && config && (
            <a href={`${config.manifest.network.explorer}/tx/${txHash}`}>
              View transaction {short(txHash)} ↗
            </a>
          )}
          {unconfirmed && txHash && (
            <button
              onClick={() => {
                setUnconfirmed(false);
                void confirm(txHash);
              }}
            >
              Check confirmation
            </button>
          )}
        </section>
        <footer>
          <div className="footer-top">
            <span className="footer-label">Direct from the chain</span>
            <button
              className="text-button"
              onClick={() => void refresh()}
              disabled={loading || !config}
            >
              {loading ? "Refreshing…" : "Refresh state"} ↻
            </button>
          </div>
          <p className="caption">
            {snapshot
              ? `Block ${snapshot.block.toLocaleString()} · ${new Date(Number(snapshot.timestamp) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC · Updates every 12 seconds.`
              : "Waiting for verified contract reads."}{" "}
            Countdown uses the latest read block time.
          </p>
          {config && (
            <details>
              <summary>Deployment & contract addresses</summary>
              <p className="caption">
                ABI hashes checked against the supplied deployment
                configuration; chain, code presence and token binding checked
                through public RPCs.
              </p>
              {config.manifest.contracts.map((c) => (
                <div className="contract" key={c.name}>
                  <span>{c.name}</span>
                  <a
                    href={`${config.manifest.network.explorer}/address/${c.address}`}
                  >
                    {c.address} ↗
                  </a>
                </div>
              ))}
              <div className="contract">
                <span>Deployed source</span>
                <code>{config.manifest.sourceCommit}</code>
              </div>
              <a href="./imd-deployment.json">
                View deployment configuration ↗
              </a>
            </details>
          )}
          <div className="footer-bottom">
            <span>Trickle · A Sepolia experiment</span>
            <span>Test ETH only. No promised return.</span>
          </div>
        </footer>
      </main>
    </>
  );
}
export default App;
