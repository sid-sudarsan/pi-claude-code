import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { closeClaudeProcesses } from "./claude-cli.ts";
import { registerClaudeCodeProvider, reportClaudeStatus } from "./provider.ts";

export default function claudeCodeExtension(pi: ExtensionAPI): void {
  registerClaudeCodeProvider(pi);

  pi.registerCommand("claude-code-status", {
    description: "Check the Claude Code executable and subscription login",
    handler: async (_args, ctx) => {
      const status = await reportClaudeStatus();
      ctx.ui.notify(status.detail, status.ready ? "info" : "error");
    },
  });

  // Upstream released retained Claude Code processes through pi-ai's
  // `registerSessionResourceCleanup`; OMP has no such export, so the same cleanup runs
  // from the session lifecycle event instead. Cached processes are also bounded by age
  // and count in claude-cli.ts, so a missed event leaks nothing beyond that bound.
  pi.on("session_shutdown", () => {
    void closeClaudeProcesses();
  });
}

export { streamClaudeCode } from "./stream.ts";
