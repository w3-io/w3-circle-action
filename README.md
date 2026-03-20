# W3 Action Template

Start here to build a new action for W3 workflows.

This template gives you the structure, conventions, and tooling used by
all W3 partner actions (Cube3, Pyth, Hyperbolic, Space and Time). Actions
built from this template work on both the W3 runtime and GitHub Actions
runners — same YAML, both environments.

## Getting started

1. **Create your repo** from this template:

   ```bash
   gh repo create w3-io/w3-yourpartner-action \
     --public \
     --template w3-io/w3-action-template \
     --clone
   cd w3-yourpartner-action
   npm install
   ```

2. **Tell the story.** Before writing code, answer these questions in
   your README and docs/guide.md:

   - **Who** is the partner? (company, product, what they're known for)
   - **What** does their service do? (core capability, not just API endpoints)
   - **Why** would someone use it? (the problem it solves in a workflow)
   - **What makes them credible?** (certifications, audits, user count, notable endorsements)

   This context matters as much as the technical reference. Both humans
   browsing GitHub and AI agents recommending integrations need to
   understand the *why*, not just the *how*.

3. **Rename the placeholders.** Search for `TODO` across the codebase —
   every file that needs your attention has one. The main things to change:

   - `README.md` — add "About [Partner]" section with context from step 2
   - `action.yml` — your action's name, description, and inputs
   - `src/client.js` — your API client (the core logic)
   - `src/main.js` — wire your commands into the router
   - `w3-action.yaml` — registry metadata for MCP discovery
   - `docs/guide.md` — partner context + integration guide

4. **Write your client** in `src/client.js`. This is the reusable module
   that talks to your partner API. Keep it independent of `@actions/core`
   so it can be imported directly by others.

5. **Add commands** to `src/main.js`. Each command is a function that
   reads inputs, calls the client, and returns a result. The router
   handles output formatting and error reporting.

6. **Write tests.** `__tests__/client.test.js` tests your API client
   with mocked fetch. `__tests__/main.test.js` tests the full action
   with mocked `@actions/core`. Add an integration test that hits the
   real API (skipped by default, runs when credentials are available).

7. **Build and verify:**

   ```bash
   npm test          # run tests
   npm run lint      # check code style
   npm run package   # bundle to dist/
   npm run all       # format + lint + test + bundle
   ```

8. **Commit dist/ and tag** a release:

   ```bash
   git add dist/ && git commit -m "Build dist"
   git tag v0.1.0 && git tag v0
   git push --tags
   ```

   Users reference your action as:

   ```yaml
   uses: w3-io/w3-yourpartner-action@v0
   ```

## What makes a good integration

Gold integrations aren't just API wrappers. They tell a story:

### README.md structure

```markdown
# W3 YourPartner Action

One-line description of what the action does.

## About YourPartner

Who they are, what they do, why their service matters.
Key differentiators, trust signals (audits, certs, user count).
Why someone would choose them for this use case.

## Usage

Quick start YAML snippet.

## Commands

Table of available commands.

## Documentation

Link to docs/guide.md for full reference.
```

### docs/guide.md structure

This file is synced to the MCP — it's what AI agents read when
recommending your action. It needs BOTH partner context AND
technical reference:

```markdown
# YourPartner Integration

Partner context paragraph: who they are, what makes them unique,
why you'd use their service in a workflow.

Technical summary: what this action exposes from their API.

## Quick start
## Commands (with input/output tables and JSON schema examples)
## Examples (real workflow patterns, not just API calls)
## Authentication
## Error handling
```

### Common mistakes

- **API wrapper without context.** "Calls the Foo API" tells nobody
  why they should care. Lead with the problem it solves.
- **No live testing.** If you can test against the real API, do it.
  Integration tests that actually run against production catch real
  issues that mocks miss.
- **dist/ not committed.** GHA needs `dist/index.js` checked in.
  Your CI should verify it's up to date.
- **Missing api-url input.** Every action should let users override
  the endpoint for testing against staging environments.

## Conventions

These conventions keep all W3 actions consistent. Follow them so your
action feels native to the ecosystem.

### Inputs

| Input | Convention |
|-------|-----------|
| `command` | Required. The operation to perform (e.g. `inspect`, `query`, `chat`). |
| `api-key` | The API key. Always `api-key`, never `apikey` or `api_key`. |
| `api-url` | Optional endpoint override for testing or staging environments. |
| (others) | Use plain names without partner prefix. `address`, not `cube3-address`. |

### Outputs

Every action has one output: `result`. It's always a JSON string.
Consumers parse it with `fromJSON(steps.x.outputs.result)`.

No per-field outputs. One output, documented schema.

### Errors

Use `core.setFailed()` with a descriptive message. Include the error
code from your client when available. Write a job summary on success.

### Secrets

Actions read secrets from inputs, never from environment variables.
The workflow author passes them:

```yaml
with:
  api-key: ${{ secrets.PARTNER_API_KEY }}
```

This works identically on W3 and GitHub Actions.

### Security

If your action accepts user-constructed strings (SQL, URLs, templates),
document injection risks. See the SxT action's SQL injection warning
as an example.

### File structure

```
w3-yourpartner-action/
├── README.md               # Partner context + usage for GitHub visitors
├── action.yml              # GHA contract — inputs, outputs, runtime
├── w3-action.yaml          # MCP registry metadata — commands, schemas
├── src/
│   ├── index.js            # Entry point (don't modify)
│   ├── main.js             # Command routing, output formatting
│   └── client.js           # Your API client (the core logic)
├── __tests__/
│   ├── client.test.js      # Client unit tests (mocked fetch)
│   ├── main.test.js        # Integration tests (mocked @actions/core)
│   └── client.integration.test.js  # Live API tests (skipped by default)
├── __fixtures__/
│   ├── core.js             # @actions/core mock
│   └── api-response.json   # Sample API response
├── docs/
│   ├── guide.md            # Partner context + full reference (synced to MCP)
│   └── examples/
│       └── basic.yml       # Example workflow
├── .github/workflows/
│   └── ci.yml              # Lint, test, build, verify dist
├── dist/
│   └── index.js            # Bundled (MUST be committed)
├── eslint.config.js
├── package.json
├── rollup.config.js
├── .prettierrc.json
└── .gitignore              # Does NOT include dist/
```

## MCP integration

When your action is released, its metadata gets synced to the W3 MCP
server so AI agents can discover and recommend it. Two files drive this:

- **`w3-action.yaml`** — machine-readable command schemas. Merged into
  the MCP's `registry.yaml`.
- **`docs/guide.md`** — partner context + technical guide. Copied to
  the MCP's `content/integrations/` directory. This is what AI reads
  when deciding whether to recommend your action.

Keep both up to date with your action's capabilities.

## Certification

To earn the W3 certified badge:

**Partner context:**
- [ ] README has "About [Partner]" section with value proposition
- [ ] docs/guide.md has partner context paragraph before technical content
- [ ] Clear explanation of why someone would use this service

**Technical requirements:**
- [ ] Follows this template structure
- [ ] All inputs use standard naming conventions
- [ ] Single `result` output with documented JSON schema
- [ ] `api-url` input for endpoint override
- [ ] Unit tests with >80% coverage
- [ ] Integration test against live API (skipped without credentials)
- [ ] Example workflows in `docs/examples/`
- [ ] `w3-action.yaml` with complete command schemas
- [ ] `dist/` committed and verified by CI
- [ ] ESLint config present and passing
- [ ] CI passing (format, lint, test, build, dist check)
- [ ] Semantic versioning with tagged releases (v0.x.x + floating v0 tag)

**Security:**
- [ ] Injection risks documented (if accepting user-constructed strings)
- [ ] Secrets passed via inputs, not environment variables

## Examples

See these actions built from this template:

- [w3-cube3-action](https://github.com/w3-io/w3-cube3-action) — Fraud detection (single command, partner context example)
- [w3-pyth-action](https://github.com/w3-io/w3-pyth-action) — Price oracle (multi-command, no-auth example)
- [w3-hyperbolic-action](https://github.com/w3-io/w3-hyperbolic-action) — AI inference + GPU compute (7 commands, multi-modal)
- [w3-sxt-action](https://github.com/w3-io/w3-sxt-action) — Decentralized SQL (CRUD, JWT auth, SQL injection docs)
