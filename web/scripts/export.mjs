import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, stringToHex } from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const handoff = await read(resolve(root, "web/deployment/deployment.json"));
const net = await read(resolve(root, "web/deployment/network.json"));
const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
function assert(ok, why) {
  if (!ok) throw Error(why);
}
assert(handoff.chainId === net.network.chainId, "Network chain mismatch");
assert(
  BigInt(net.walletAddChain.chainId) === BigInt(handoff.chainId),
  "Wallet chain mismatch",
);
assert(/^[a-f0-9]{40}$/.test(handoff.sourceCommit), "Invalid source commit");
const check = process.argv.includes("--check");
const contracts = [];
for (const contract of handoff.contracts) {
  assert(/^[A-Za-z0-9_]+$/.test(contract.name), "Unsafe ABI name");
  const abiPath = `abi/${contract.name}.json`;
  const sourcePath = `docs/${abiPath}`;
  const bytes = await readFile(resolve(root, sourcePath));
  // Bind the implementation export to its deployed revision, not the frontend revision.
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${sourcePath}`],
    { cwd: root },
  );
  assert(
    bytes.equals(pinned),
    `${contract.name}: ABI differs from pinned source`,
  );
  const abi = JSON.parse(bytes);
  assert(Array.isArray(abi), "ABI must be a raw JSON array");
  assert(
    keccak256(stringToHex(canonical(abi))).slice(2) === contract.abiHash,
    `${contract.name}: canonical ABI hash mismatch`,
  );
  if (!check) {
    await mkdir(resolve(dist, "abi"), { recursive: true });
    await writeFile(resolve(dist, abiPath), bytes);
  } else
    assert(
      (await readFile(resolve(dist, abiPath))).equals(bytes),
      "Exported ABI changed",
    );
  contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
async function files(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    assert(!item.isSymbolicLink(), "No symlinks in export");
    const path = resolve(dir, item.name);
    if (item.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}
const assets = [];
let total = 0;
for (const file of (await files(dist)).sort()) {
  const path = relative(dist, file).replaceAll("\\", "/");
  if (path === "imd-deployment.json") continue;
  const bytes = await readFile(file);
  total += bytes.length;
  assert((await stat(file)).size <= 8388608, `Oversized asset ${path}`);
  assets.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
assert(
  assets.length <= 128 && assets.some((a) => a.path === "index.html"),
  "Invalid asset inventory",
);
assert(total < 8 * 1024 * 1024, "Export exceeds conservative bundle budget");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  network: net.network,
  walletAddChain: net.walletAddChain,
};
if (check)
  assert(
    canonical(await read(resolve(dist, "imd-deployment.json"))) ===
      canonical(manifest),
    "Manifest does not match final assets / handoff",
  );
else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${check ? "Verified" : "Exported"} ${assets.length} assets, ${total} bytes; both pinned canonical Keccak ABI hashes match.`,
);
