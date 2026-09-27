import { readFile } from "node:fs/promises";
import {
  decodeFunctionData,
  encodeFunctionResult,
  toHex,
  parseEther,
} from "viem";
export const walletAddress = "0x1111111111111111111111111111111111111111";
export async function createMock(root) {
  const config = JSON.parse(
    await readFile(`${root}/dist/imd-deployment.json`, "utf8"),
  );
  const token = config.contracts.find((c) => c.name === "LaunchToken");
  const staking = config.contracts.find((c) => c.name === "ETHStakingRewards");
  const tokenAbi = JSON.parse(
    await readFile(`${root}/dist/${token.abiPath}`, "utf8"),
  );
  const stakingAbi = JSON.parse(
    await readFile(`${root}/dist/${staking.abiPath}`, "utf8"),
  );
  const state = {
    now: 1801020000n,
    finish: 1801020000n + 350000n,
    total: parseEther("2000000"),
    rate: 100000000000n,
    carry: parseEther("0.025"),
    balance: parseEther("2500000"),
    staked: parseEther("1000000"),
    earned: parseEther("0.0124"),
    allowance: 0n,
    eth: parseEther("2"),
    failReads: false,
    missingCode: false,
    mismatchToken: false,
    simulationError: false,
    revertReceipt: false,
    rpcChain: config.chainId,
    calls: [],
    transactions: [],
  };
  const hash = "0x" + "a".repeat(64);
  const block = {
    number: "0xb40000",
    hash: "0x" + "b".repeat(64),
    parentHash: "0x" + "c".repeat(64),
    nonce: "0x0000000000000000",
    sha3Uncles: hash,
    logsBloom: "0x" + "0".repeat(512),
    transactionsRoot: hash,
    stateRoot: hash,
    receiptsRoot: hash,
    miner: walletAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x100",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: toHex(state.now),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: hash,
  };
  function rpc(method, params = []) {
    state.calls.push({ method, params });
    if (state.failReads && !method.startsWith("wallet_"))
      throw { code: -32000, message: "Mock RPC temporarily unavailable" };
    if (method === "eth_chainId") return toHex(state.rpcChain);
    if (method === "eth_getCode")
      return state.missingCode ? "0x" : "0x60016000";
    if (method === "eth_blockNumber") return block.number;
    if (method === "eth_getBlockByNumber")
      return { ...block, timestamp: toHex(state.now) };
    if (method === "eth_getBalance") return toHex(state.eth);
    if (method === "eth_getTransactionCount") return "0x1";
    if (method === "eth_estimateGas") return "0x30000";
    if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
      return "0x3b9aca00";
    if (method === "eth_getTransactionReceipt")
      return {
        transactionHash: params[0],
        transactionIndex: "0x0",
        blockHash: block.hash,
        blockNumber: block.number,
        from: walletAddress,
        to: staking.address,
        cumulativeGasUsed: "0x10000",
        gasUsed: "0x10000",
        contractAddress: null,
        logs: [],
        logsBloom: block.logsBloom,
        status: state.revertReceipt ? "0x0" : "0x1",
        effectiveGasPrice: "0x3b9aca00",
        type: "0x2",
      };
    if (method === "eth_call" || method === "eth_sendTransaction") {
      const tx = params[0];
      const abi =
        tx.to.toLowerCase() === token.address.toLowerCase()
          ? tokenAbi
          : stakingAbi;
      const { functionName: f, args = [] } = decodeFunctionData({
        abi,
        data: tx.data,
      });
      const values = {
        token: state.mismatchToken ? walletAddress : token.address,
        totalStaked: state.total,
        currentRate: state.now >= state.finish ? 0n : state.rate,
        periodFinish: state.finish,
        carry: state.carry,
        MIN_REWARD: parseEther("0.001"),
        DURATION: 604800n,
        decimals: 18,
        balanceOf: state.balance,
        allowance: state.allowance,
        stakedOf: state.staked,
        earned: state.earned,
      };
      if (Object.hasOwn(values, f))
        return encodeFunctionResult({
          abi,
          functionName: f,
          result: values[f],
        });
      if (state.simulationError && method === "eth_call")
        throw {
          code: 3,
          message: "execution reverted: test simulation failure",
        };
      if (method === "eth_call")
        return f === "approve"
          ? encodeFunctionResult({ abi, functionName: f, result: true })
          : "0x";
      state.transactions.push({
        functionName: f,
        args: args.map((x) => (typeof x === "bigint" ? x.toString() : x)),
        tx,
      });
      if (!state.revertReceipt) {
        if (f === "approve") state.allowance = args[1];
        if (f === "stake") {
          state.staked += args[0];
          state.total += args[0];
          state.balance -= args[0];
          state.allowance -= args[0];
        }
        if (f === "withdraw") {
          state.staked -= args[0];
          state.total -= args[0];
          state.balance += args[0];
        }
        if (f === "getReward" || f === "exit") {
          state.eth += state.earned;
          state.earned = 0n;
        }
        if (f === "exit") {
          state.balance += state.staked;
          state.total -= state.staked;
          state.staked = 0n;
        }
        if (f === "notifyRewardAmount") {
          const v = BigInt(tx.value);
          state.eth -= v;
          if (state.now < state.finish) state.carry += v;
          else {
            state.rate = (state.carry + v) / 604800n;
            state.carry = (state.carry + v) % 604800n;
            state.finish = state.now + 604800n;
          }
        }
        if (f === "restream") {
          state.rate = state.carry / 604800n;
          state.carry %= 604800n;
          state.finish = state.now + 604800n;
        }
      }
      return "0x" + state.transactions.length.toString(16).padStart(64, "0");
    }
    throw Error(`Unhandled RPC method: ${method}`);
  }
  return { config, token, staking, state, rpc };
}
export async function installMock(page, mock, options = {}) {
  await page.route(/^https:\/\//, async (route) => {
    const data = route.request().postDataJSON();
    const answer = (q) => {
      try {
        return {
          jsonrpc: "2.0",
          id: q.id,
          result: mock.rpc(q.method, q.params),
        };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id: q.id,
          error: { code: e.code ?? -32000, message: e.message },
        };
      }
    };
    await route.fulfill({
      json: Array.isArray(data) ? data.map(answer) : answer(data),
    });
  });
  if (options.noWallet) return;
  await page.exposeFunction("__mockRpc", (method, params) =>
    mock.rpc(method, params),
  );
  await page.addInitScript(
    ({ walletAddress, chainId, options }) => {
      const listeners = {};
      window.__wallet = {
        account: options.connected ? walletAddress : undefined,
        chain: options.wrongChain ? "0x1" : chainId,
        unknown: !!options.unknown,
        reject: false,
        requests: [],
        emit(event, value) {
          if (event === "accountsChanged") this.account = value[0];
          if (event === "chainChanged") this.chain = value;
          for (const fn of listeners[event] ?? []) fn(value);
        },
      };
      window.ethereum = {
        on(event, callback) {
          (listeners[event] ??= []).push(callback);
        },
        removeListener(event, callback) {
          listeners[event] = (listeners[event] ?? []).filter(
            (fn) => fn !== callback,
          );
        },
        async request({ method, params }) {
          const w = window.__wallet;
          w.requests.push({ method, params });
          if (method === "eth_accounts") return w.account ? [w.account] : [];
          if (method === "eth_chainId") return w.chain;
          if (method === "eth_requestAccounts") {
            if (w.reject) throw { code: 4001, message: "User rejected" };
            w.account = walletAddress;
            return [walletAddress];
          }
          if (method === "wallet_switchEthereumChain") {
            if (w.unknown) throw { code: 4902, message: "Unknown chain" };
            w.chain = params[0].chainId;
            w.emit("chainChanged", w.chain);
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            w.unknown = false;
            return null;
          }
          if (method === "eth_sendTransaction" && w.reject)
            throw { code: 4001, message: "User rejected transaction" };
          return window.__mockRpc(method, params);
        },
      };
    },
    { walletAddress, chainId: mock.config.walletAddChain.chainId, options },
  );
}
