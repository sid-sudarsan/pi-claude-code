import { normalizeContext, type Context, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverClaudeModels, getClaudeStatus } from "./claude-cli.ts";
import { API_ID, CLAUDE_CODE_MODELS, modelFromDiscovery, PROVIDER_ID, type ClaudeCodeModel } from "./model-catalog.ts";
import { streamClaudeCode } from "./stream.ts";

/**
 * OMP port of the upstream pi provider factory.
 *
 * Upstream registered a `createProvider({ auth, models, fetchModels, filterModels, api })`
 * object through pi's single-argument `pi.registerProvider(provider)`. OMP has no
 * `createProvider` export and only accepts `pi.registerProvider(name, config)`, where the
 * transport is an extension-owned `api` id served by `streamSimple`. The Claude Code
 * side is unchanged: requests still run through `claude -p` and never through an HTTP
 * client owned by the host.
 *
 * Consequences of the shape difference, all intentional:
 * - Authentication is not consulted per request. Claude Code owns its credentials and the
 *   stream path rejects conflicting auth/backend env overrides itself, so the provider is
 *   registered with a placeholder `apiKey` that is never sent anywhere.
 * - `auth.apiKey.check` used to hide models when Claude Code is missing or logged out.
 *   OMP has no equivalent hook, so the models stay listed and `/claude-code-status`
 *   reports the real state.
 * - `filterModels` (which narrowed the catalog to models the account reports) has no OMP
 *   counterpart; discovered models are merged alongside the static fallback rows.
 */

/** Model rows accepted by OMP's `registerProvider`; extra pi model metadata is not sent. */
interface ProviderModelRow {
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

/** Claude Code owns CLI discovery; bound it below OMP's 15s runtime discovery cap. */
const DISCOVERY_TIMEOUT_MS = 12_000;

/** The environment used to locate and configure Claude Code. */
export function claudeCodeEnv(): Record<string, string | undefined> {
  return process.env;
}

function toProviderModel(model: ClaudeCodeModel): ProviderModelRow {
  return {
    id: model.id,
    name: model.name,
    api: API_ID,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function staticModels(): ProviderModelRow[] {
  return CLAUDE_CODE_MODELS.map(toProviderModel);
}

/**
 * OMP hands providers a `Context` (system prompt and tools beside the messages), while
 * the Claude Code relay works on a transcript with both folded into a leading system
 * message.
 */
function toTranscript(context: Context) {
  const systemPrompt = Array.isArray(context.systemPrompt) ? context.systemPrompt.join("\n\n") : context.systemPrompt;
  return normalizeContext({
    systemPrompt,
    tools: context.tools as never,
    messages: context.messages as never,
  });
}

export function registerClaudeCodeProvider(pi: ExtensionAPI): void {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "process://claude-code",
    api: API_ID,
    // Placeholder credential: it only marks the provider as configured. Requests are
    // served by `streamSimple`, which spawns Claude Code with its own login.
    apiKey: "external-process",
    models: staticModels(),
    streamSimple: (model: Model<never>, context: Context, options?: SimpleStreamOptions) =>
      streamClaudeCode(model as never, toTranscript(context) as never, options),
    async fetchDynamicModels() {
      try {
        const discovered = await discoverClaudeModels(claudeCodeEnv(), undefined, DISCOVERY_TIMEOUT_MS);
        return discovered.map((info) => toProviderModel(modelFromDiscovery(info)));
      } catch {
        // Claude Code missing, logged out, or too slow: keep the static rows.
        return staticModels();
      }
    },
  });
}

/** Report whether Claude Code is installed and logged in, for the status command. */
export async function reportClaudeStatus(): Promise<{ ready: boolean; detail: string }> {
  const status = await getClaudeStatus(claudeCodeEnv(), undefined);
  if (!status.available || !status.loggedIn) {
    return { ready: false, detail: status.detail ?? "Claude Code is not ready" };
  }
  return { ready: true, detail: status.plan ? `Claude Code is installed and logged in (${status.plan})` : "Claude Code is installed and logged in" };
}

export { API_ID, PROVIDER_ID };
