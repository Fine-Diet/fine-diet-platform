# Cursor Agent Operating Protocol — Fine Diet Platform

Read this file at the start of **every Cursor session** in this repository.

---

## 1. Bridge Architecture

The bridge is a **strict canonical protocol on top of the Second Brain MCP server**. There is one system of record, one endpoint, and one data model.

```
System of record:  Second Brain at https://mcp.rashadtyler.com/api/mcp
MCP server alias:  rashadtyler (registered in .cursor/mcp.json)

Primary transport: rashadtyler MCP session inside Cursor
Fallback transport: scripts/bridge-client.mjs (HTTP to same endpoint)
```

The distinction between primary and fallback is **transport only** — which mechanism Cursor uses to reach the server. The protocol, record types, field names, title prefixes, and lifecycle are identical across both transports. There is no secondary system.

> The Second Brain IS the bridge. Using the Second Brain tools loosely (searching tasks as packets, substituting record types) violates the protocol. Cursor must use each record type for exactly its designated role.

---

## 2. Canonical Record Schema

Every bridge record has a fixed type, tool, and required fields. Deviation from this schema is a protocol violation.

### 2a. Packet — `[BRIDGE-PACKET]`

Created by Marc. Cursor reads only.

| Field | Value |
|-------|-------|
| Record type | `source_document` |
| Write tool | `capture_source_document` |
| Title format | `[BRIDGE-PACKET] <descriptive title>` |
| `source_type` | `"system_generated"` |
| `raw_text` | JSON (see below) |

Required `raw_text` JSON structure:

```json
{
  "bridge_schema_version": "1.0",
  "issued_by": "marc",
  "issued_at": "<ISO timestamp>",
  "target_agent": "cursor",
  "target_repo": "fine-diet-platform",
  "scope": "<what to build — required>",
  "acceptance_criteria": ["<criterion>"],
  "constraints": ["<constraint>"]
}
```

### 2b. Acknowledgment — `[BRIDGE-ACK]`

Created by Cursor on packet receipt.

| Field | Value |
|-------|-------|
| Record type | `source_document` |
| Write tool | `capture_source_document` |
| Title format | `[BRIDGE-ACK] <packet_title>` |
| `source_type` | `"system_generated"` |
| `raw_text` | JSON (see below) |
| `metadata` | `{ bridge_action: "acknowledge", packet_id, agent }` |

Required `raw_text` JSON structure:

```json
{
  "bridge_schema_version": "1.0",
  "bridge_action": "acknowledge",
  "packet_id": "<source_document UUID>",
  "agent": "cursor",
  "repo": "fine-diet-platform",
  "acknowledged_at": "<ISO timestamp>"
}
```

### 2c. Status Marker — `[BRIDGE-STATUS]`

Created by Cursor at lifecycle transitions. Tasks are used exclusively for status signalling — never as packets or reports.

| Field | In Progress | Needs Review |
|-------|-------------|--------------|
| Record type | `task` | `task` |
| Write tool | `capture_task` | `capture_task` |
| Title format | `[BRIDGE-STATUS] IN_PROGRESS: <packet_title>` | `[BRIDGE-STATUS] NEEDS_REVIEW: <packet_title>` |
| `owner` | `"cursor"` | `"rashad"` |
| `priority` | `"high"` | `"high"` |
| `notes` | JSON (see below) | JSON (see below) |

Required `notes` JSON for `IN_PROGRESS`:

```json
{
  "packet_id": "<uuid>",
  "agent": "cursor",
  "repo": "fine-diet-platform",
  "branch": "<branch name>",
  "started_at": "<ISO timestamp>"
}
```

Required `notes` JSON for `NEEDS_REVIEW`:

```json
{
  "packet_id": "<uuid>",
  "execution_report_id": "<generated_document UUID>",
  "agent": "cursor",
  "repo": "fine-diet-platform",
  "branch": "<branch name>",
  "completed_at": "<ISO timestamp>"
}
```

### 2d. Execution Report — `[EXECUTION-REPORT]`

Created by Cursor on completion.

| Field | Value |
|-------|-------|
| Record type | `generated_document` |
| Write tool | `create_generated_document` |
| Title format | `[EXECUTION-REPORT] <packet_title>` |
| `doc_type` | `"handoff_doc"` |
| `abstract` | `"Cursor execution report for packet: <packet_id>"` |
| `content_md` | Markdown (required sections below) |

Required `content_md` sections:

```markdown
# Execution Report

**Packet ID:** <uuid>
**Packet Title:** <title>
**Agent:** Cursor (fine-diet-platform)
**Date:** <ISO timestamp>
**Branch:** <branch name>

## Summary
<1–3 sentence summary>

## Files Changed
- `path/to/file` — what changed

## What Was Done
<detailed description matching acceptance criteria>

## Validation
- [ ] `npm run build` — passed / not run (reason)
- [ ] `npm run lint` — passed / not run (reason)
- [ ] No existing functionality broken

## Blockers / Questions
<open items, or "None">

## Next Steps
<what Rashad or Marc should do next>
```

---

## 3. Lifecycle Protocol

Follow these steps in order. Do not skip or reorder.

---

### Step 1 — Poll Inbox

**One query. One record type. Source documents only.**

```
search_source_documents({
  query: "[BRIDGE-PACKET]",
  source_type: "system_generated",
  limit: 10
})
```

Do not use `search_tasks`, `search_substrate`, or any other tool for this step. Tasks are status markers — they are never packets.

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs poll-inbox
```

---

### Step 2 — If No Packets Found

Stop and report:

```
No [BRIDGE-PACKET] source documents found in the Second Brain.
To begin a build, ask Marc to capture a source document titled
[BRIDGE-PACKET] <title> with source_type: system_generated
and the required JSON fields in raw_text.
```

Do not begin implementation work. You may answer questions and read files.

---

### Step 3 — Read the Packet

```
get_source_document({
  source_document_id: "<packet_id>",
  include_raw_text: true
})
```

Parse the `raw_text` JSON. Validate the packet contains all required fields: `scope`, `acceptance_criteria`, `target_agent: "cursor"`, `target_repo: "fine-diet-platform"`. If any required field is missing, report to Rashad and do not proceed.

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs get-packet <packet_id>
```

---

### Step 4 — Acknowledge

```
capture_source_document({
  title: "[BRIDGE-ACK] <packet_title>",
  source_type: "system_generated",
  raw_text: JSON.stringify({
    bridge_schema_version: "1.0",
    bridge_action: "acknowledge",
    packet_id: "<packet_id>",
    agent: "cursor",
    repo: "fine-diet-platform",
    acknowledged_at: "<ISO timestamp>"
  }),
  metadata: {
    bridge_action: "acknowledge",
    packet_id: "<packet_id>",
    agent: "cursor"
  }
})
```

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs acknowledge <packet_id> "<packet_title>"
```

---

### Step 5 — Transition to In Progress

Create a branch first, then capture the status task with the branch name in `notes`.

```
capture_task({
  title: "[BRIDGE-STATUS] IN_PROGRESS: <packet_title>",
  owner: "cursor",
  priority: "high",
  notes: JSON.stringify({
    packet_id: "<packet_id>",
    agent: "cursor",
    repo: "fine-diet-platform",
    branch: "<branch name>",
    started_at: "<ISO timestamp>"
  })
})
```

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs transition <packet_id> in_progress "<packet_title>" <branch>
```

---

### Step 6 — Implement the Work

Execute exactly what the packet specifies. See [Section 5 — Constraints](#5-constraints).

---

### Step 7 — Post Execution Report

```
create_generated_document({
  title: "[EXECUTION-REPORT] <packet_title>",
  doc_type: "handoff_doc",
  content_md: "<markdown with all required sections>",
  abstract: "Cursor execution report for packet: <packet_id>"
})
```

Save the returned `generated_document` UUID — you need it for Step 8.

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs create-report <packet_id> "<packet_title>" <branch>
```

---

### Step 8 — Transition to Needs Review

```
capture_task({
  title: "[BRIDGE-STATUS] NEEDS_REVIEW: <packet_title>",
  owner: "rashad",
  priority: "high",
  notes: JSON.stringify({
    packet_id: "<packet_id>",
    execution_report_id: "<generated_document_uuid>",
    agent: "cursor",
    repo: "fine-diet-platform",
    branch: "<branch name>",
    completed_at: "<ISO timestamp>"
  })
})
```

**Via transport fallback:**

```bash
node scripts/bridge-client.mjs transition <packet_id> needs_review "<packet_title>" <branch> <report_id>
```

---

## 4. Session Close Summary

Print at the end of every session where bridge work occurred. Print even for blocked sessions — use `(unknown)` for any unavailable ID.

```
╔══════════════════════════════════════════╗
║         Bridge Session Summary           ║
╠══════════════════════════════════════════╣
║  Packet ID:    <uuid>                    ║
║  Packet Title: <title>                   ║
║  Report ID:    <uuid>                    ║
║  Branch:       <branch>                  ║
║  Status:       needs_review              ║
╠══════════════════════════════════════════╣
║  Next: Rashad reviews report + PR        ║
╚══════════════════════════════════════════╝
```

---

## 5. Constraints

| Rule | Detail |
|------|--------|
| **One system of record** | All bridge operations target `mcp.rashadtyler.com` only. No parallel tracking in notes, files, or other tools. |
| **Strict record types** | Packets → source documents. Status → tasks. Reports → generated documents. Never substitute. |
| **Sole writer** | Cursor only commits to `fine-diet-platform`. Marc/OpenClaw never commits here. |
| **Packet-gated builds** | No feature branches, implementation commits, or deploys without a valid packet. |
| **No scope creep** | Implement exactly what `scope` and `acceptance_criteria` specify. Surface additions in the report. |
| **No security changes** | Do not modify auth, middleware, RLS, or Supabase config without an explicit packet. |
| **Transport consistency** | If MCP is available, use it for the full session. If CLI fallback is needed, use it for the full session. Do not mix within a session. |

---

## 6. MCP Tool Reference

All bridge operations use the `rashadtyler` MCP server.

| Operation | Tool | Required Arguments |
|-----------|------|--------------------|
| **Poll inbox** | `search_source_documents` | `query: "[BRIDGE-PACKET]"`, `source_type: "system_generated"` |
| **Read packet** | `get_source_document` | `source_document_id: <uuid>`, `include_raw_text: true` |
| **Acknowledge** | `capture_source_document` | `title: "[BRIDGE-ACK] ..."`, `source_type: "system_generated"`, `raw_text`: bridge JSON, `metadata`: bridge metadata |
| **Status → in_progress** | `capture_task` | `title: "[BRIDGE-STATUS] IN_PROGRESS: ..."`, `owner: "cursor"`, `notes`: bridge JSON with `packet_id` + `branch` |
| **Post report** | `create_generated_document` | `title: "[EXECUTION-REPORT] ..."`, `doc_type: "handoff_doc"`, `content_md`: full report, `abstract`: bridge reference |
| **Status → needs_review** | `capture_task` | `title: "[BRIDGE-STATUS] NEEDS_REVIEW: ..."`, `owner: "rashad"`, `notes`: bridge JSON with `packet_id` + `execution_report_id` |
| **Review queue** | `search_tasks` | `status: "needs_review"` — reads status tasks only, not packets |
| **Inspect reports** | `list_generated_documents` | filter `title.startsWith("[EXECUTION-REPORT]")` |
| **Server health** | `get_substrate_status` | `{}` |

---

## 7. Transport Fallback — CLI

Use `scripts/bridge-client.mjs` when the `rashadtyler` MCP server is unavailable in a Cursor session. The CLI reaches the same endpoint (`mcp.rashadtyler.com`) and writes the same records with the same schema. It is a transport fallback only — not a separate system, not a different protocol.

```bash
node scripts/bridge-client.mjs poll-inbox
node scripts/bridge-client.mjs get-packet <packet_id>
node scripts/bridge-client.mjs acknowledge <packet_id> "<packet_title>"
node scripts/bridge-client.mjs transition <packet_id> in_progress "<packet_title>" <branch>
node scripts/bridge-client.mjs transition <packet_id> needs_review "<packet_title>" <branch> <report_id>
node scripts/bridge-client.mjs create-report <packet_id> "<packet_title>" <branch>
node scripts/bridge-client.mjs review-queue
```

Optional `.env.local` overrides (both have working defaults):

```
SECOND_BRAIN_MCP_URL=https://mcp.rashadtyler.com/api/mcp
SECOND_BRAIN_API_KEY=<bearer token if required>
```

---

## 8. Full Build Loop

```
Marc captures:
  source_document  [BRIDGE-PACKET] <title>
  source_type:     system_generated
  raw_text:        { scope, acceptance_criteria, constraints, target_agent: "cursor" }
         │
         ▼
Cursor: search_source_documents({ query: "[BRIDGE-PACKET]" })
         │  finds packet
         ▼
Cursor: get_source_document (include_raw_text: true)
         │  validates schema
         ▼
Cursor: capture_source_document  →  [BRIDGE-ACK] <title>
         ▼
Cursor: capture_task             →  [BRIDGE-STATUS] IN_PROGRESS: <title>
         │                            owner: cursor, notes: { packet_id, branch }
         ▼
Cursor: implements work in fine-diet-platform
         ▼
Cursor: create_generated_document  →  [EXECUTION-REPORT] <title>
         │                              doc_type: handoff_doc
         ▼
Cursor: capture_task               →  [BRIDGE-STATUS] NEEDS_REVIEW: <title>
         │                              owner: rashad, notes: { packet_id, execution_report_id }
         ▼
Cursor: prints Bridge Session Summary
         │
         ▼
Rashad reads execution report + reviews PR
         │
         ▼
Merge  —or—  Marc captures follow-up [BRIDGE-PACKET]
```

---

## 9. Naming Convention Reference

| Prefix | Record Type | Written by | Purpose |
|--------|-------------|------------|---------|
| `[BRIDGE-PACKET]` | `source_document` | Marc | Incoming work specification |
| `[BRIDGE-ACK]` | `source_document` | Cursor | Receipt confirmation |
| `[BRIDGE-STATUS] IN_PROGRESS:` | `task` | Cursor | Signals active work |
| `[BRIDGE-STATUS] NEEDS_REVIEW:` | `task` | Cursor | Signals work complete |
| `[EXECUTION-REPORT]` | `generated_document` | Cursor | Completion report for Rashad |
