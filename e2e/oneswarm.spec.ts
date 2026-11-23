import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = "http://localhost:4100";
let bridge: ChildProcess | null = null;

test.afterAll(() => {
  bridge?.kill();
});

function startBridge(code: string) {
  bridge = spawn(
    process.execPath,
    [
      join(ROOT, "packages/bridge/dist/cli.js"),
      "connect",
      code,
      "--server",
      SERVER,
      "--name",
      "e2e-laptop",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ONESWARM_HOME: mkdtempSync(join(tmpdir(), "oneswarm-e2e-")),
        ONESWARM_AGENTS: "mock",
        ONESWARM_MOCK_AGENT_CMD: `${process.execPath} ${join(ROOT, "packages/mock-agent/dist/index.js")}`,
        MOCK_AGENT_DELAY_MS: "10",
      },
      stdio: "pipe",
    },
  );
  bridge.stdout?.on("data", (d: Buffer) => process.stdout.write(`[bridge] ${d}`));
  bridge.stderr?.on("data", (d: Buffer) => process.stdout.write(`[bridge] ${d}`));
}

const mock = (page: Page) => page.locator('[data-testid="message"][data-author="Mock"]');

async function send(page: Page, text: string) {
  const box = page.getByTestId("composer");
  await box.fill(text);
  await box.press("Enter");
}

async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test("people and the mock agent work together end to end", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const stamp = Date.now();

  await test.step("sign up and name the workspace", async () => {
    await a.goto("/signup");
    await a.getByLabel("Name").fill("Ada Owner");
    await a.getByLabel("Email").fill(`ada-${stamp}@example.test`);
    await a.getByLabel("Password").fill("correct-horse-battery");
    await a.getByRole("button", { name: "Create account" }).click();
    await expect(a).toHaveURL(/\/onboarding$/);
    await a.getByLabel("Workspace name").fill("Acme Studio");
    await a.getByRole("button", { name: "Continue" }).click();
    await expect(a).toHaveURL(/\/onboarding\/connect$/);
  });

  await test.step("connect the bridge and see the agent appear live", async () => {
    const command = await a.getByTestId("connect-command").textContent();
    const code = /connect ([A-Z0-9-]+)/.exec(command ?? "")?.[1];
    expect(code).toBeTruthy();
    startBridge(code!);
    await expect(a.getByTestId("connect-agent-mock")).toContainText("ready");
    await a.getByTestId("continue-connect").click();
    await expect(a).toHaveURL(/\/c\/general$/);
    await expect(a.getByTestId("composer")).toHaveValue(
      /@Mock summarise what this workspace is for and create 3 starter tasks\./,
    );
    await expect(a.getByTestId("agent-mock")).toHaveAttribute("data-status", "online");
  });

  await test.step("send a message", async () => {
    await send(a, "hello team");
    await expect(
      a.locator('[data-testid="message"]').filter({ hasText: "hello team" }),
    ).toHaveAttribute("data-status", "complete");
  });

  await test.step("invite a teammate who sees messages in real time", async () => {
    await a.goto("/settings/members");
    await a.getByTestId("invite-button").click();
    await a.getByLabel("Email").fill(`bo-${stamp}@example.test`);
    await a.getByRole("button", { name: "Create invite link" }).click();
    const link = (await a.getByTestId("invite-link").textContent())!.trim();
    await a.keyboard.press("Escape");
    await a.goto("/c/general");

    await b.goto(link);
    await b.getByLabel("Name").fill("Bo Teammate");
    await b.getByLabel("Password").fill("correct-horse-battery");
    await b.getByRole("button", { name: "Create account" }).click();
    await expect(b).toHaveURL(/\/c\/general$/);
    await expect(b.getByText("hello team")).toBeVisible();

    await send(b, "hi from Bo");
    await expect(a.getByText("hi from Bo")).toBeVisible();
    await send(a, "ping from Ada");
    await expect(b.getByText("ping from Ada")).toBeVisible();
  });

  await test.step("unread indicator for another channel", async () => {
    await b.goto("/tasks");
    await expect(b.getByTestId("task-list")).toBeVisible();
    await expect(b.getByText("Reconnecting…")).toHaveCount(0);
    await send(a, "anyone around?");
    await expect(b.getByTestId("unread-general")).toHaveText("1");
    await b.goto("/c/general");
    await expect(b.getByTestId("unread-general")).toHaveCount(0);
  });

  await test.step("the model chip lists the agent's 3 models and switches", async () => {
    await expect(a.getByTestId("model-chip")).toContainText("Mock · Sage");
    await a.getByTestId("composer").click();
    await a.keyboard.press("ControlOrMeta+/");
    await expect(a.getByTestId("model-option")).toHaveCount(3);
    await expect(a.getByTestId("model-settings")).toContainText("Context size");
    await a.getByTestId("model-option").filter({ hasText: "Mock Titan" }).click();
    // The chip reflects the agent's config_option_update.
    await expect(a.getByTestId("model-chip")).toContainText("Mock · Titan");
    await expect(a.getByTestId("effort-chip")).toBeVisible();
    await expect(a.getByTestId("mode-chip")).toContainText("Ask");
  });

  await test.step("@Mock hello streams a reply from the switched model", async () => {
    await send(a, "@Mock hello");
    const reply = mock(a).filter({ hasText: "Hello!" }).last();
    await expect(reply).toContainText("Mock Titan");
    await expect(reply).toHaveAttribute("data-status", "complete");
    await expect(
      b
        .locator('[data-testid="message"][data-author="Mock"]')
        .filter({ hasText: "Mock Titan" })
        .last(),
    ).toBeVisible();
  });

  await test.step("approve the agent's permission request", async () => {
    await send(a, "@Mock please edit the notes");
    const card = a.locator('[data-testid="message"] [data-testid="approval-card"]').last();
    await expect(card).toHaveAttribute("data-status", "pending");
    await expect(a.getByTestId("right-panel")).toBeVisible();
    await expect(a.getByTestId("approval-queue")).toBeVisible();
    await blur(a);
    await a.keyboard.press("e");
    await expect(card).toHaveAttribute("data-status", "approved");
    const reply = mock(a).filter({ hasText: "I updated notes.md" });
    await expect(reply).toHaveAttribute("data-status", "complete");
    await expect(reply.getByTestId("tool-summary")).toHaveText(
      "Edited 1 file · read 1 file · ran 1 command",
    );
  });

  await test.step("assign a task to the agent, then approve it to Done", async () => {
    await a.goto("/tasks?filter=all");
    await a.getByTestId("new-task").click();
    await a.getByLabel("Title").fill("Write release notes");
    await a.getByTestId("new-task-assignee").selectOption({ label: "Mock" });
    await a.getByTestId("create-task").click();
    const detail = a.getByTestId("task-detail");
    await expect(detail).toHaveAttribute("data-status", "review");
    await expect(a.getByTestId("task-group-review")).toContainText("Write release notes");
    await detail.getByTestId("approve").click();
    await expect(detail).toHaveAttribute("data-status", "done");
    await expect(a.getByTestId("task-group-done")).toContainText("Write release notes");
    await expect(a.getByTestId("task-activity")).toContainText("moved it to Done");
  });

  await test.step("keyboard: palette, panels and shortcuts", async () => {
    await blur(a);
    await a.keyboard.press("ControlOrMeta+k");
    await a.getByPlaceholder(/Search or type/).fill("#general");
    await a.keyboard.press("Enter");
    await expect(a).toHaveURL(/\/c\/general$/);
    await blur(a);
    await a.keyboard.press("ControlOrMeta+b");
    await expect(a.getByTestId("left-panel")).toHaveAttribute("aria-hidden", "true");
    await a.keyboard.press("ControlOrMeta+b");
    await expect(a.getByTestId("left-panel")).toHaveAttribute("aria-hidden", "false");
    await blur(a);
    await a.keyboard.press("?");
    await expect(a.getByRole("dialog")).toContainText("Keyboard shortcuts");
    await a.keyboard.press("Escape");
    await expect(a.getByRole("dialog")).toHaveCount(0);
  });
});
