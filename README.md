# pi-claude-code

This Pi extension lets you use your Claude Pro or Max subscription in Pi by
routing all Claude model requests through the official Claude Code CLI.

Pi still handles conversation history, approvals, compaction, and tool
execution. Claude Code only talks to the model. It never runs tools itself.

## OMP port

This is a fork of `earendil-works/pi-claude-code` that runs on
[OMP](https://github.com/can1357/oh-my-pi) instead of Pi. OMP loads legacy Pi
extensions through a compatibility layer, but upstream's provider factory needs
Pi-only APIs, so the host-facing glue is ported:

| Upstream (Pi) | This fork (OMP) |
| --- | --- |
| `pi.registerProvider(createProvider({ auth, models, fetchModels, filterModels, api }))` (`@earendil-works/pi-ai.createProvider`) | `pi.registerProvider("claude-code", { api, streamSimple, models, fetchDynamicModels })` with an extension-owned api id |
| `getBuiltinModels("anthropic")` from the `@earendil-works/pi-ai/providers/all` subpath | `getBundledModels("anthropic")` from the package root |
| `registerSessionResourceCleanup(...)` from `@earendil-works/pi-ai` | `pi.on("session_shutdown", ...)` |
| `renderSystemMessageUpdate` re-exported by pi-ai | local copy of the pi-ai 1.5.0 implementation in `src/transcript.ts` |

Behavior differences that follow from the host API, not from a choice here:

- Models are always listed. Upstream hid them until Claude Code was installed
  and logged in (its `auth.apiKey.check` hook); OMP has no per-provider auth
  check, so an unauthenticated setup fails at request time instead. Use
  `/claude-code-status` to check.
- Discovered models are merged with the static fallback catalog. Upstream
  narrowed the list to what the account reports (`filterModels`); OMP has no
  equivalent hook.
- `PI_CLAUDE_CODE_COMMAND` and `PI_CLAUDE_CODE_CONFIG_DIR` come from the process
  environment only. Upstream read them through a per-provider env hook.

`tests/` and `tsc --noEmit` still target the upstream Pi packages and are not
runnable against OMP's host shim; the port is verified through OMP itself
(model listing, discovery, text and tool-call turns).

> [!WARNING]
> **The future of this extension is uncertain.** Right now it works by running
> Pi's requests through the official Claude Code CLI in non-interactive mode
> (`claude -p`), and that usage counts against your normal Claude subscription
> limits. In May 2026 Anthropic
> [announced](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
> that `claude -p`, Agent SDK, and third-party usage would move to a separate,
> smaller "Agent SDK credit" billed at API rates. Anthropic has since put that
> change on hold and says it will give advance notice before any future change.
>
> Until then the extension keeps working as described here, but that could
> change at any time. If Anthropic changes how `claude -p` usage is billed, this
> extension may cost more, stop drawing from your subscription, or stop working
> altogether. See Zed's
> [write-up](https://zed.dev/blog/anthropic-subscription-changes) for more
> background.

## Requirements

- OMP (`omp`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code), installed and
  on your `PATH`:

  ```sh
  npm install -g @anthropic-ai/claude-code
  ```

- A Claude subscription that you are logged into with Claude Code

## Installation

```sh
omp plugin link /path/to/this/fork
```

Then pick a model from the **claude-code** provider (`claude-code/<model>`).

`omp plugin install <git-url>` works too, as long as the plugin is not installed
with a copy of the real Pi packages beside it: this fork resolves
`@earendil-works/pi-ai` through OMP's compatibility layer, not through
`node_modules`.

## Login and logout

Claude Code handles authentication. Log in and out with the Claude Code CLI:

```sh
claude auth login
claude auth logout
```

The extension uses whatever login Claude Code currently has. You don't need
Pi's `/login` or `/logout` for this provider. The extension doesn't read, copy,
or store your Claude Code credentials.

Run `/claude-code-status` in Pi to check that Claude Code is installed and
logged in.

## Configuration

These environment variables are optional:

- `PI_CLAUDE_CODE_COMMAND`: path or name of the Claude Code executable
  (default: `claude`).
- `PI_CLAUDE_CODE_CONFIG_DIR`: Claude Code config directory to use. The
  extension passes it to Claude Code as `CLAUDE_CONFIG_DIR`.

## Usage and billing

Requests made through this extension count against your Claude subscription's
usage quota and rate limits, the same as any other Claude Code usage. The
extension does not give you separate or unlimited usage.

The extension ignores `ANTHROPIC_API_KEY` in Claude Code child processes without
changing your environment. To avoid silently changing how you're authenticated
or billed, it still rejects auth-token, proxy, Bedrock, Vertex, or Foundry
overrides for Claude Code.

## Limitations

- The extension is experimental.
- Branching, editing earlier messages, or changing settings mid-conversation
  starts a fresh Claude Code process that replays the conversation. The first
  response after that can be slower and may use more quota.
- Complex tool schemas (nullable types, `oneOf`, `allOf`, `anyOf`) may be
  simplified before Claude sees them.
- Adding or removing tools in the middle of a conversation keeps the prompt
  cache only on supported models. On other models it may use more quota.

For details on how the extension works internally, see
[ARCHITECTURE.md](ARCHITECTURE.md).
