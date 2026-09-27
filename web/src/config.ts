import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type Provider = EIP1193Provider & {
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    callback: (...args: unknown[]) => void,
  ) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<string, Address>;
  };
  walletAddChain: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return JSON.stringify(sort(value));
}
export async function loadDeployment() {
  const get = async (path: string) => {
    if (
      !/^[\w./-]+$/.test(path) ||
      path.startsWith("/") ||
      path.split("/").includes("..")
    )
      throw Error("Unsafe deployment asset path.");
    const response = await fetch(
      new URL(path, new URL("./", window.location.href)),
      { cache: "no-cache" },
    );
    if (!response.ok) throw Error(`Cannot load ${path}. Reload to retry.`);
    return response.json();
  };
  const manifest = (await get("imd-deployment.json")) as Deployment;
  if (
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.chainId) ||
    manifest.chainId !== manifest.network?.chainId ||
    Number(BigInt(manifest.walletAddChain?.chainId)) !== manifest.chainId
  )
    throw Error("Deployment network configuration is inconsistent.");
  if (
    !manifest.network.rpcUrls.length ||
    manifest.network.rpcUrls.some((url) => !url.startsWith("https://"))
  )
    throw Error("Public RPC configuration is missing or invalid.");
  if (
    manifest.contracts.length !== 2 ||
    new Set(manifest.contracts.map((c) => c.name)).size !== 2
  )
    throw Error("Unexpected deployment contract set.");
  const contracts = await Promise.all(
    manifest.contracts.map(async (c) => {
      if (!isAddress(c.address) || !/^[a-f0-9]{64}$/.test(c.abiHash))
        throw Error("Invalid contract configuration.");
      const abi = (await get(c.abiPath)) as Abi;
      if (
        !Array.isArray(abi) ||
        keccak256(stringToHex(canonical(abi))).slice(2) !== c.abiHash
      )
        throw Error(
          `ABI verification failed for ${c.name}. Transactions are unavailable.`,
        );
      return { ...c, abi };
    }),
  );
  const token = contracts.find((c) => c.name === "LaunchToken");
  const staking = contracts.find((c) => c.name === "ETHStakingRewards");
  if (!token || !staking) throw Error("Required contracts are missing.");
  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.network.name,
    nativeCurrency: manifest.network.nativeCurrency,
    rpcUrls: { default: { http: manifest.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: manifest.network.explorer },
    },
    testnet: manifest.network.testnet,
  });
  return { manifest, chain, token, staking };
}
export type Config = Awaited<ReturnType<typeof loadDeployment>>;
export function reader(config: Config, provider?: Provider) {
  const transports = config.manifest.network.rpcUrls.map((url) =>
    http(url, { timeout: 7000, retryCount: 0, batch: true }),
  );
  return createPublicClient({
    chain: config.chain,
    transport: fallback(
      [
        ...transports,
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 12000,
  });
}
