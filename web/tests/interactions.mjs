import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { parseEther } from "viem";
import { createMock, installMock, walletAddress } from "./mock.mjs";
import { preview } from "./preview.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = resolve(root, "docs/frontend");
await mkdir(evidence, { recursive: true });
const { server, url } = await preview(root);
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  headless: true,
});
const results = [];
const errors = [];
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS " + name);
}
let page, mock;
async function setup(options = {}) {
  if (page) await page.context().close();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  mock = await createMock(root);
  page.on("pageerror", (error) => errors.push(error.message));
  await installMock(page, mock, options);
  await page.goto(url);
  await page.getByText(/^Block [\d,]+/).waitFor();
}
const enabled = async (name, yes = true) => {
  await page.waitForFunction(
    ({ name, yes }) =>
      [...document.querySelectorAll("button")].some(
        (b) =>
          b.textContent
            .trim()
            .replace(/\s*[↗+↻]$/, "")
            .trim() === name && b.disabled !== yes,
      ),
    { name, yes },
  );
};
async function refresh() {
  await page.getByRole("button", { name: "Refresh state" }).click();
  await page.getByRole("button", { name: "Refresh state" }).waitFor();
}
async function action(name) {
  await page
    .getByRole("button", {
      name: name.replace(/\s*[↗+↻]$/, "").trim(),
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Transaction confirmed" })
    .waitFor();
  await page.getByRole("button", { name: "Refresh state" }).waitFor();
}
try {
  await check(
    "Subpath assets, disconnected controls, public stream reads",
    async () => {
      await setup();
      await enabled("Approve TRKL", false);
      assert.equal(await page.locator(".hero-value").innerText(), "0.00432ETH");
      await page.screenshot({
        path: resolve(evidence, "desktop-disconnected.png"),
        fullPage: true,
      });
    },
  );
  await check("Missing wallet has a recoverable explanation", async () => {
    await setup({ noWallet: true });
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await page
      .getByText("No browser wallet found.", { exact: false })
      .waitFor();
  });
  await check("Wallet connection rejection and retry", async () => {
    await setup();
    await page.evaluate(() => (window.__wallet.reject = true));
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await page
      .getByText("Request declined in your wallet.", { exact: false })
      .waitFor();
    await page.evaluate(() => (window.__wallet.reject = false));
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await enabled("Approve TRKL");
  });
  await check(
    "Wrong chain, unknown-chain add, switch retry, exact handoff parameters",
    async () => {
      await setup({ wrongChain: true, unknown: true });
      await page.getByRole("button", { name: "Connect wallet" }).click();
      await page.getByRole("button", { name: "Switch to Sepolia" }).waitFor();
      await enabled("Approve TRKL", false);
      await page.getByRole("button", { name: "Switch to Sepolia" }).click();
      await enabled("Approve TRKL");
      const requests = await page.evaluate(() =>
        window.__wallet.requests.filter((r) => r.method.startsWith("wallet_")),
      );
      assert.deepEqual(
        requests.map((r) => r.method),
        [
          "wallet_switchEthereumChain",
          "wallet_addEthereumChain",
          "wallet_switchEthereumChain",
        ],
      );
      assert.deepEqual(requests[1].params[0], mock.config.walletAddChain);
    },
  );
  await check(
    "Zero, excess balance and overprecision inputs never reach signing",
    async () => {
      for (const v of ["0", "999999999", "1.0000000000000000001"]) {
        await page.getByLabel("Amount to stake").fill(v);
        await page
          .getByRole("button", { name: "Approve TRKL", exact: true })
          .click();
        await page.locator("#position-amount-error").waitFor();
        assert.equal(
          await page.locator("#position-amount").getAttribute("aria-invalid"),
          "true",
        );
      }
      assert.equal(mock.state.transactions.length, 0);
    },
  );
  await check(
    "Exact approval then stake, simulation, receipt and read refresh",
    async () => {
      await page.getByLabel("Amount to stake").fill("100");
      await action("Approve TRKL ↗");
      assert.equal(mock.state.transactions[0].functionName, "approve");
      assert.deepEqual(
        mock.state.transactions[0].args.map((x) => x.toLowerCase()),
        [mock.staking.address, parseEther("100").toString()],
      );
      await enabled("Stake TRKL");
      await action("Stake TRKL ↗");
      assert.equal(mock.state.transactions[1].functionName, "stake");
      assert.equal(mock.state.staked, parseEther("1000100"));
      assert(
        mock.state.calls.some(
          (c) => c.method === "eth_call" && c.params[0].from === walletAddress,
        ),
      );
    },
  );
  await check("Withdraw amount and max control", async () => {
    await page.getByRole("button", { name: "Withdraw", exact: true }).click();
    await page.getByRole("button", { name: "Max", exact: true }).click();
    assert.equal(
      await page.getByLabel("Amount to withdraw").inputValue(),
      "1000100",
    );
    await page.getByLabel("Amount to withdraw").fill("20");
    await action("Withdraw TRKL ↗");
    assert.equal(mock.state.transactions.at(-1).functionName, "withdraw");
  });
  await check(
    "Claim ETH keeps stake, exit returns all and claims",
    async () => {
      const before = mock.state.staked;
      await action("Claim ETH ↗");
      assert.equal(mock.state.staked, before);
      assert.equal(mock.state.earned, 0n);
      await action("Withdraw all & claim");
      assert.equal(mock.state.staked, 0n);
      await enabled("Claim ETH", false);
    },
  );
  await check(
    "Donation minimum, irreversible copy, active top-up is queued",
    async () => {
      await page.getByLabel("ETH to add").fill("0.0001");
      await page
        .getByRole("button", { name: "Add rewards", exact: false })
        .click();
      await page
        .getByText("Add at least 0.001 ETH.", { exact: true })
        .waitFor();
      const finish = mock.state.finish,
        rate = mock.state.rate,
        carry = mock.state.carry;
      await page.getByLabel("ETH to add").fill("0.01");
      await action("Add rewards +");
      assert.equal(
        mock.state.transactions.at(-1).functionName,
        "notifyRewardAmount",
      );
      assert.equal(mock.state.transactions.at(-1).tx.value, "0x2386f26fc10000");
      assert.equal(mock.state.finish, finish);
      assert.equal(mock.state.rate, rate);
      assert.equal(mock.state.carry, carry + parseEther("0.01"));
    },
  );
  await check(
    "Ended stream reports zero; restart eligibility and restream",
    async () => {
      mock.state.now = mock.state.finish + 1n;
      await refresh();
      await page.getByText("Stream ended", { exact: true }).waitFor();
      assert.equal(await page.locator(".hero-value").innerText(), "0ETH");
      await enabled("Restart from carry");
      await action("Restart from carry ↻");
      assert.equal(mock.state.transactions.at(-1).functionName, "restream");
      await enabled("Restart from carry", false);
    },
  );
  await check(
    "Zero stake carries emissions and prevents restream",
    async () => {
      mock.state.total = 0n;
      mock.state.now = mock.state.finish + 1n;
      await refresh();
      await page
        .getByText("No active stake. Scheduled ETH goes to carry.", {
          exact: true,
        })
        .waitFor();
      await enabled("Restart from carry", false);
    },
  );
  await check(
    "Simulation revert blocks wallet signature and displays reason",
    async () => {
      mock.state.simulationError = true;
      const n = mock.state.transactions.length;
      await page.getByLabel("ETH to add").fill("0.01");
      await page
        .getByRole("button", { name: "Add rewards", exact: false })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "test simulation failure" })
        .waitFor();
      assert.equal(mock.state.transactions.length, n);
      mock.state.simulationError = false;
    },
  );
  await check("Wallet rejection recovers with no transaction", async () => {
    await page.evaluate(() => (window.__wallet.reject = true));
    const n = mock.state.transactions.length;
    await page
      .getByRole("button", { name: "Add rewards", exact: false })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Request declined" })
      .waitFor();
    assert.equal(mock.state.transactions.length, n);
    await page.evaluate(() => (window.__wallet.reject = false));
  });
  await check("Reverted receipt is not shown as success", async () => {
    mock.state.revertReceipt = true;
    await page
      .getByRole("button", { name: "Add rewards", exact: false })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Transaction reverted on chain" })
      .waitFor();
    mock.state.revertReceipt = false;
  });
  await check(
    "Wallet account and chain events clear state and gate writes",
    async () => {
      await page.evaluate(() => window.__wallet.emit("chainChanged", "0x1"));
      await page.getByRole("button", { name: "Switch to Sepolia" }).waitFor();
      await enabled("Add rewards", false);
      await page.evaluate(() => window.__wallet.emit("accountsChanged", []));
      await page.getByRole("button", { name: "Connect wallet" }).waitFor();
      await enabled("Add rewards", false);
    },
  );
  await check("Live-read failure gates writes; retry recovers", async () => {
    await setup({ connected: true });
    await enabled("Approve TRKL");
    mock.state.failReads = true;
    await refresh();
    await page
      .getByText("Live reads are unavailable. Actions are paused.", {
        exact: true,
      })
      .waitFor();
    await enabled("Approve TRKL", false);
    mock.state.failReads = false;
    await page.getByRole("button", { name: "Retry reads" }).click();
    await enabled("Approve TRKL");
  });
  await check(
    "Missing contract code and token-binding mismatch block actions",
    async () => {
      mock.state.missingCode = true;
      await refresh();
      await page
        .getByText("Deployed contract code is missing.", { exact: false })
        .waitFor();
      await enabled("Approve TRKL", false);
      mock.state.missingCode = false;
      mock.state.mismatchToken = true;
      await page.getByRole("button", { name: "Retry reads" }).click();
      await page
        .getByText("Staking token differs from the deployment.", {
          exact: false,
        })
        .waitFor();
      mock.state.mismatchToken = false;
      await page.getByRole("button", { name: "Retry reads" }).click();
      await enabled("Approve TRKL");
    },
  );
  await check("RPC chain mismatch gates writes", async () => {
    mock.state.rpcChain = 1;
    await refresh();
    await page
      .getByText("RPC returned the wrong chain.", { exact: false })
      .waitFor();
    await enabled("Approve TRKL", false);
    mock.state.rpcChain = mock.config.chainId;
    await page.getByRole("button", { name: "Retry reads" }).click();
    await enabled("Approve TRKL");
  });
  await check("Tampered ABI blocks runtime configuration", async () => {
    await page.route("**/abi/LaunchToken.json", (r) => r.fulfill({ json: [] }));
    await page.reload();
    await page
      .getByText("ABI verification failed for LaunchToken.", { exact: false })
      .waitFor();
    await enabled("Approve TRKL", false);
    await page.unroute("**/abi/LaunchToken.json");
  });
  await setup({ connected: true });
  await enabled("Approve TRKL");
  await check(
    "Keyboard focus, labels, validation and primary action via keyboard",
    async () => {
      await page.getByLabel("Amount to stake").focus();
      await page.keyboard.type("0");
      await page.keyboard.press("Enter");
      await page.locator("#position-amount-error").waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "position-amount",
      );
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("100");
      await page.keyboard.press("Enter");
      await page
        .getByRole("status")
        .filter({ hasText: "Transaction confirmed" })
        .waitFor();
    },
  );
  await check("Axe accessibility scan at desktop and 320px", async () => {
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const scan = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(
        scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
        [],
      );
    }
  });
  const layout = [];
  await check(
    "320, 390, 704, 880 and 1280px reflow with screenshots",
    async () => {
      for (const width of [320, 390, 704, 880, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        layout.push(metrics);
        assert(metrics.scroll <= metrics.width, JSON.stringify(metrics));
        if ([320, 390, 1280].includes(width))
          await page.screenshot({
            path: resolve(evidence, `connected-${width}.png`),
            fullPage: true,
          });
      }
    },
  );
  await check("200% text enlargement and reduced-motion reflow", async () => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  });
  await check("No uncaught browser JavaScript errors", async () =>
    assert.deepEqual(errors, []),
  );
  await page.getByLabel("Amount to stake").fill("0");
  await page.getByLabel("Amount to stake").press("Enter");
  await page.locator("#position-amount-error").waitFor();
  const contrast = await page.evaluate(() => {
    const rgb = (c) =>
      c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const lum = (c) =>
      rgb(c)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ".intro-copy",
      ".stream .caption",
      "h2",
      ".primary",
      ".label",
      ".field-error",
    ].flatMap((sel) => {
      const el = document.querySelector(sel);
      if (!el) return [];
      let bg = getComputedStyle(el).backgroundColor,
        parent = el;
      while (bg === "rgba(0, 0, 0, 0)" && parent.parentElement) {
        parent = parent.parentElement;
        bg = getComputedStyle(parent).backgroundColor;
      }
      const fg = getComputedStyle(el).color;
      return [
        {
          selector: sel,
          fg,
          bg,
          ratio:
            (Math.max(lum(fg), lum(bg)) + 0.05) /
            (Math.min(lum(fg), lum(bg)) + 0.05),
        },
      ];
    });
  });
  await writeFile(
    resolve(evidence, "interaction-results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        productionSubpath: "/preview/",
        sourceCommit: mock.config.sourceCommit,
        assets: mock.config.assets,
        checks: results.length,
        passed: results,
        viewports: layout,
        consoleErrors: errors,
        contrast,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Completed ${results.length} checks.`);
} catch (error) {
  await mkdir(resolve(root, "test/scratch"), { recursive: true });
  await page.screenshot({
    path: resolve(root, "test/scratch/failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(root, "test/scratch/failure.txt"),
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
