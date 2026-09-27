import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
const m = JSON.parse(
  await readFile(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const output = { date: new Date().toISOString(), checks: [] };
for (const url of m.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 10000, retryCount: 0 }),
  });
  try {
    const chainId = await client.getChainId();
    const contracts = await Promise.all(
      m.contracts.map(async (c) => {
        const code = await client.getCode({ address: c.address });
        return {
          name: c.name,
          address: c.address,
          codeBytes: code ? (code.length - 2) / 2 : 0,
        };
      }),
    );
    const c = m.contracts.find((c) => c.name === "ETHStakingRewards");
    const abi = JSON.parse(
      await readFile(
        new URL("../../dist/" + c.abiPath, import.meta.url),
        "utf8",
      ),
    );
    const token = await client.readContract({
      address: c.address,
      abi,
      functionName: "token",
    });
    if (
      chainId !== m.chainId ||
      contracts.some((c) => !c.codeBytes) ||
      token.toLowerCase() !==
        m.contracts.find((c) => c.name === "LaunchToken").address.toLowerCase()
    )
      throw Error("Deployment read checks failed");
    output.checks.push({ url, chainId, contracts, token });
  } catch (e) {
    output.checks.push({ url, error: e.shortMessage || e.message });
  }
}
await writeFile(
  new URL("../../docs/frontend/live-rpc.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output, null, 2));
if (output.checks.some((c) => c.error)) process.exitCode = 1;
