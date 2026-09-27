import {
  createWalletClient,
  custom,
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { reader, type Config, type Provider } from "./config";
export type Client = ReturnType<typeof reader>;
export interface Snapshot {
  block: bigint;
  timestamp: bigint;
  fetchedAt: number;
  account?: Address;
  decimals: number;
  tokenAddress: Address;
  total: bigint;
  rate: bigint;
  finish: bigint;
  carry: bigint;
  minimum: bigint;
  duration: bigint;
  balance: bigint;
  allowance: bigint;
  staked: bigint;
  earned: bigint;
  eth: bigint;
}
export async function verifyDeployment(config: Config, client: Client) {
  if ((await client.getChainId()) !== config.manifest.chainId)
    throw Error("RPC returned the wrong chain. Transactions are disabled.");
  const code = await Promise.all(
    config.manifest.contracts.map((c) =>
      client.getCode({ address: c.address }),
    ),
  );
  if (code.some((c) => !c || c === "0x"))
    throw Error(
      "Deployed contract code is missing. Transactions are disabled.",
    );
  const tokenAddress = (await client.readContract({
    ...config.staking,
    functionName: "token",
  })) as Address;
  if (tokenAddress.toLowerCase() !== config.token.address.toLowerCase())
    throw Error(
      "Staking token differs from the deployment. Transactions are disabled.",
    );
  return tokenAddress;
}
export async function readSnapshot(
  config: Config,
  client: Client,
  account?: Address,
): Promise<Snapshot> {
  const tokenAddress = await verifyDeployment(config, client);
  const block = await client.getBlock();
  const stakeRead = (functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      ...config.staking,
      functionName,
      args,
      blockNumber: block.number,
    });
  const tokenRead = (functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: tokenAddress,
      abi: config.token.abi,
      functionName,
      args,
      blockNumber: block.number,
    });
  const [
    total,
    rate,
    finish,
    carry,
    minimum,
    duration,
    decimals,
    balance,
    allowance,
    staked,
    earned,
    eth,
  ] = (await Promise.all([
    stakeRead("totalStaked"),
    stakeRead("currentRate"),
    stakeRead("periodFinish"),
    stakeRead("carry"),
    stakeRead("MIN_REWARD"),
    stakeRead("DURATION"),
    tokenRead("decimals"),
    account ? tokenRead("balanceOf", [account]) : 0n,
    account ? tokenRead("allowance", [account, config.staking.address]) : 0n,
    account ? stakeRead("stakedOf", [account]) : 0n,
    account ? stakeRead("earned", [account]) : 0n,
    account
      ? client.getBalance({ address: account, blockNumber: block.number })
      : 0n,
  ])) as [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw Error("Invalid token decimals.");
  return {
    block: block.number,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
    account,
    tokenAddress,
    total,
    rate: block.timestamp >= finish ? 0n : rate,
    finish,
    carry,
    minimum,
    duration,
    decimals,
    balance,
    allowance,
    staked,
    earned,
    eth,
  };
}
export function amount(text: string, decimals: number) {
  if (!/^\d+(\.\d*)?$/.test(text.trim()))
    throw Error("Enter a positive amount using digits and a decimal point.");
  if ((text.split(".")[1]?.length ?? 0) > decimals)
    throw Error(`Use no more than ${decimals} decimal places.`);
  const value = parseUnits(text.trim(), decimals);
  if (value <= 0n) throw Error("Enter an amount greater than zero.");
  if (value >= 2n ** 256n) throw Error("This amount is too large.");
  return value;
}
export function number(value: bigint, decimals = 18, precision = 6) {
  const raw = formatUnits(value, decimals);
  const [whole, fraction = ""] = raw.split(".");
  if (
    value > 0n &&
    whole === "0" &&
    fraction.slice(0, precision).replaceAll("0", "") === ""
  )
    return `<0.${"0".repeat(precision - 1)}1`;
  const tail = fraction.slice(0, precision).replace(/0+$/, "");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (tail ? "." + tail : "");
}
export const dailyRate = (s: Snapshot) =>
  s.total
    ? (s.rate * 86400n * (1_000_000n * 10n ** BigInt(s.decimals))) / s.total
    : 0n;
export function countdown(seconds: bigint) {
  if (seconds <= 0n) return "Stream ended";
  const n = Number(seconds);
  return `${Math.floor(n / 86400)}d ${String(Math.floor((n % 86400) / 3600)).padStart(2, "0")}h ${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}m`;
}
export function errorMessage(error: unknown): string {
  const e = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
  };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? ""))
    return "Request declined in your wallet. Nothing else was submitted; you can try again.";
  const text =
    e?.shortMessage ||
    e?.message ||
    "The request failed. Check your wallet and try again.";
  return text.length > 450 ? text.slice(0, 450) + "…" : text;
}
export async function switchNetwork(config: Config, provider: Provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: config.manifest.walletAddChain.chainId }],
    });
  } catch (error) {
    const serialized = JSON.stringify(
      error,
      Object.getOwnPropertyNames(error ?? {}),
    );
    if (
      !/4902|unknown chain|unrecognized chain|chain.*not.*added/i.test(
        serialized,
      )
    )
      throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [config.manifest.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: config.manifest.walletAddChain.chainId }],
    });
  }
}
export type Action =
  | "approve"
  | "stake"
  | "withdraw"
  | "getReward"
  | "exit"
  | "notifyRewardAmount"
  | "restream";
export async function sendAction(
  config: Config,
  client: Client,
  provider: Provider,
  account: Address,
  action: Action,
  input: string,
  stillCurrent: () => boolean,
  beforeSign: () => void,
): Promise<Hash> {
  const assertWallet = async () => {
    const [id, accounts] = await Promise.all([
      provider.request({ method: "eth_chainId" }),
      provider.request({ method: "eth_accounts" }),
    ]);
    if (
      Number(BigInt(id)) !== config.chain.id ||
      accounts[0]?.toLowerCase() !== account.toLowerCase() ||
      !stillCurrent()
    )
      throw Error(
        "Wallet or network changed. Review the current account and try again.",
      );
  };
  await assertWallet();
  const s = await readSnapshot(config, client, account);
  const value = ["approve", "stake", "withdraw", "notifyRewardAmount"].includes(
    action,
  )
    ? amount(input, action === "notifyRewardAmount" ? 18 : s.decimals)
    : 0n;
  if ((action === "approve" || action === "stake") && value > s.balance)
    throw Error("Amount exceeds your available TRKL balance.");
  if (action === "stake" && value > s.allowance)
    throw Error("Approve this TRKL amount before staking.");
  if (action === "withdraw" && value > s.staked)
    throw Error("Amount exceeds your staked TRKL.");
  if (action === "getReward" && !s.earned)
    throw Error("There is no ETH to claim yet.");
  if (action === "exit" && !s.staked && !s.earned)
    throw Error("There is no stake or reward to exit.");
  if (action === "notifyRewardAmount" && value < s.minimum)
    throw Error(`Add at least ${formatUnits(s.minimum, 18)} ETH.`);
  if (action === "notifyRewardAmount" && value >= s.eth)
    throw Error("Leave some ETH in your wallet for network gas.");
  if (
    action === "restream" &&
    (s.finish > s.timestamp || !s.total || s.carry < s.minimum)
  )
    throw Error(
      "Restart needs an ended stream, active stake and sufficient carry.",
    );
  const request = {
    address: action === "approve" ? s.tokenAddress : config.staking.address,
    abi: action === "approve" ? config.token.abi : config.staking.abi,
    functionName: action,
    account,
    args:
      action === "approve"
        ? [config.staking.address, value]
        : ["stake", "withdraw"].includes(action)
          ? [value]
          : [],
    ...(action === "notifyRewardAmount" ? { value } : {}),
  };
  const simulation = await client.simulateContract(request);
  await assertWallet();
  beforeSign();
  return createWalletClient({
    chain: config.chain,
    transport: custom(provider),
  }).writeContract(simulation.request);
}
