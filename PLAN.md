# shh-env Implementation Plan

## Overview

A CLI tool that loads secrets from the OS keychain and injects them as environment variables. Like `env-cmd` but uses secure keychain storage instead of `.env` files.

---

## CLI Design

### Default: Run with Secrets

```bash
shh-env [options] [--] <command> [args...]
```

| Option | Description |
|--------|-------------|
| `--service <name>` | Service namespace (layers on top of `_`) |
| `--env <name>` | Environment layer (e.g., dev, prod) — requires `--service` |

The `--` separator is standard POSIX convention, needed when the child command has flags.

### Loading Order

Each layer overrides the previous (like `.env` file layering):

```bash
# Bare minimum (only default)
shh-env node server.js
→ process.env → _

# With env but no service (env ignored)
shh-env --env dev node server.js
→ process.env → _

# With service
shh-env --service my-app node server.js
→ process.env → _ → my-app

# With service + env
shh-env --service my-app --env dev node server.js
→ process.env → _ → my-app → my-app::dev
```

**Note:** `_` (default) cannot have environments. `--env` only applies when `--service` is specified.

### Management Subcommands

```bash
shh-env set <KEY> [--service <name>] [--env <env>]
shh-env get <KEY> [--service <name>] [--env <env>]
shh-env delete <KEY> [--service <name>] [--env <env>]
shh-env list [--service <name>] [--env <env>]
```

- Without `--service`: operates on `_` (default)
- With `--service`: operates on that service
- With `--env`: operates on `<service>::<env>` (requires `--service`)

---

## List Command Output

gopass-style tree with box-drawing characters. Keys sorted alphabetically.

### `shh-env list` (all services/envs)

```
_
├── EDITOR
├── GITHUB_TOKEN
└── PATH_ADDITION

my-app
├── API_KEY
└── DATABASE_URL

my-app::dev
└── DEBUG
```

### `shh-env list --service my-app` (merged: _ + my-app)

Shows all layers. Overridden keys displayed with strikethrough.

```
_
├── EDITOR
├── GITHUB_TOKEN
└── P̶A̶T̶H̶_̶A̶D̶D̶I̶T̶I̶O̶N̶

my-app
├── API_KEY
├── DATABASE_URL
└── PATH_ADDITION
```

### `shh-env list --service my-app --env dev` (merged: _ + my-app + my-app::dev)

```
_
├── EDITOR
├── GITHUB_TOKEN
└── P̶A̶T̶H̶_̶A̶D̶D̶I̶T̶I̶O̶N̶

my-app
├── API_KEY
├── D̶A̶T̶A̶B̶A̶S̶E̶_̶U̶R̶L̶
└── PATH_ADDITION

my-app::dev
├── DATABASE_URL
└── DEBUG
```

Strikethrough ANSI code: `\x1b[9m` text `\x1b[0m`

---

## Keychain Storage

Uses `Bun.secrets` API:
- macOS: Keychain Services
- Windows: Credential Manager
- Linux: libsecret

### Naming Rules

| Field | Allowed | Disallowed | Reason |
|-------|---------|------------|--------|
| Service | `a-z`, `A-Z`, `0-9`, `-`, `_`, `.` | `:` | Conflicts with `::` separator |
| Env | `a-z`, `A-Z`, `0-9`, `-`, `_` | `:`, `.` | Conflicts with separator, keep simple |
| Key | `A-Z`, `0-9`, `_` | lowercase, special chars | Standard env var naming |

Regex patterns:
- Service: `/^[a-zA-Z0-9._-]+$/` (except `_` alone for default)
- Env: `/^[a-zA-Z0-9_-]+$/`
- Key: `/^[A-Z][A-Z0-9_]*$/`

### Storage Structure

**One keychain entry per secret.** Service name from CLI args directly.

```typescript
// Default (no --service)
await Bun.secrets.set({
  service: "_",
  name: "EDITOR",
  value: "vim"
})

// With --service my-app
await Bun.secrets.set({
  service: "my-app",
  name: "API_KEY",
  value: "secret123"
})

// With --service my-app --env dev
await Bun.secrets.set({
  service: "my-app::dev",
  name: "DATABASE_URL",
  value: "postgres://..."
})
```

| Target | Keychain Service | Keychain Name | Value |
|--------|------------------|---------------|-------|
| default EDITOR | `_` | `EDITOR` | `vim` |
| default GITHUB_TOKEN | `_` | `GITHUB_TOKEN` | `ghp_xxx` |
| my-app API_KEY | `my-app` | `API_KEY` | `secret123` |
| my-app::dev DATABASE_URL | `my-app::dev` | `DATABASE_URL` | `postgres://...` |

### Operations

```typescript
// Build service name
const serviceName = env ? `${service}::${env}` : service  // e.g., "my-app::dev" or "my-app" or "_"

// SET
await Bun.secrets.set({ service: serviceName, name: key, value })

// GET
const value = await Bun.secrets.get({ service: serviceName, name: key })

// DELETE
await Bun.secrets.delete({ service: serviceName, name: key })

// LIST: use native enumeration (see below)
```

### Native Enumeration

Since `Bun.secrets` doesn't have a list API, use platform-specific commands:

**macOS:**
```bash
security dump-keychain | grep -A4 "class: \"genp\""
# Parse "svce" (service) and "acct" (account/name) attributes
# Filter by known service names or pattern
```

**Linux:**
```bash
secret-tool search --all xdg:schema com.oven-sh.bun.Secret
# Returns all Bun secrets, parse "service" and "account" attributes
```

**Windows:**
```powershell
cmdkey /list
# Lists all credentials, filter by target pattern (service/name)
```

Parse to extract services and keys. Services containing `::` have an env component.

---

## Process Spawning

Based on env-cmd pattern:

```typescript
const proc = Bun.spawn([command, ...args], {
  env: { ...process.env, ...mergedSecrets },
  stdio: ['inherit', 'inherit', 'inherit'],
})

// Signal forwarding
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => proc.kill(sig))
}

// Exit with child's code
process.exit(await proc.exited)
```

---

## Technical Stack

- **Runtime:** Bun + TypeScript
- **CLI:** citty (TypeScript-first, lightweight)
- **Build:** `bun build --compile` for standalone binary
- **Distribution:** npm with platform-specific packages (esbuild pattern)

---

## File Structure

```
shh-env/
├── src/
│   ├── index.ts           # CLI entry, argument parsing
│   ├── commands/
│   │   ├── run.ts         # Default command (spawn with env)
│   │   ├── set.ts
│   │   ├── get.ts
│   │   ├── delete.ts
│   │   └── list.ts
│   └── lib/
│       ├── secrets.ts     # Bun.secrets wrapper
│       ├── enumerate.ts   # Native keychain enumeration (platform-specific)
│       └── spawn.ts       # Process spawning + signals
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Order

### Phase 1: Core
- [ ] Project setup (bun init, tsconfig)
- [ ] Secrets storage (`lib/secrets.ts`) - one entry per secret
- [ ] Native enumeration (`lib/enumerate.ts`) - platform-specific list
- [ ] `set` command
- [ ] `get` command
- [ ] `list` command (with tree output + strikethrough)
- [ ] `delete` command

### Phase 2: Run
- [ ] Argument parsing (detect subcommand vs default run)
- [ ] Process spawning (`lib/spawn.ts`)
- [ ] Signal forwarding
- [ ] Default run command integration
- [ ] Layer merging (_ → service → env)

### Phase 3: Polish
- [ ] Error handling
- [ ] `--help` for all commands
- [ ] `--version`

### Phase 4: Distribution
- [ ] `bun build --compile` setup
- [ ] Platform-specific npm packages
- [ ] GitHub Actions for cross-compilation

---

## Verification

1. **Set secrets:** `shh-env set TEST_KEY` → verify in OS keychain
2. **List secrets:** `shh-env list` → shows TEST_KEY in tree format
3. **Run command:** `shh-env -- printenv TEST_KEY` → outputs value
4. **Env layering:** Set same key in base and env, verify strikethrough in list
5. **Service layering:** Verify _ + service merge
6. **Signal handling:** Ctrl+C during `shh-env -- sleep 100` → child terminates
