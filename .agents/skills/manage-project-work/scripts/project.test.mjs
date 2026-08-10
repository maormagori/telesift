import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findIssueByOperationId,
  normalizePriority,
  normalizeStatus,
  operationMarker,
  requiredProjectUpdates,
  selectNext,
  withPullLock,
} from "./project.mjs";

function item(overrides = {}) {
  return {
    number: 1,
    title: "Ticket",
    state: "OPEN",
    status: "Ready",
    priority: "P2 Normal",
    assignees: [],
    blockedBy: 0,
    ...overrides,
  };
}

test("selects highest priority ready ticket", () => {
  assert.equal(selectNext([item({ number: 1 }), item({ number: 2, priority: "P0 Urgent" })]).number, 2);
});

test("uses oldest issue number to break priority ties", () => {
  assert.equal(selectNext([item({ number: 9 }), item({ number: 3 })]).number, 3);
});

test("excludes non-ready, closed, assigned, and blocked work", () => {
  const selected = selectNext([
    item({ number: 1, status: "Discovery" }),
    item({ number: 2, state: "CLOSED" }),
    item({ number: 3, assignees: ["maormagori"] }),
    item({ number: 4, blockedBy: 1 }),
    item({ number: 5 }),
  ]);
  assert.equal(selected.number, 5);
});

test("returns null when the ready frontier is empty", () => {
  assert.equal(selectNext([item({ status: "Backlog" })]), null);
});

test("normalizes only declared workflow values", () => {
  assert.equal(normalizeStatus("in progress"), "In progress");
  assert.equal(normalizePriority("P1"), "P1 High");
  assert.throws(() => normalizeStatus("Doing"), /Invalid status/);
  assert.throws(() => normalizePriority("Critical"), /Invalid priority/);
});

test("finds an existing issue by stable operation marker", () => {
  const issues = [
    { number: 4, body: `Body\n\n${operationMarker("capture-123")}` },
    { number: 5, body: "Different body" },
  ];
  assert.equal(findIssueByOperationId(issues, "capture-123").number, 4);
  assert.equal(findIssueByOperationId(issues, "missing"), null);
});

test("reconciliation retries only missing project field writes", () => {
  assert.deepEqual(
    requiredProjectUpdates(
      { status: "Discovery", priority: "P3 Low" },
      { status: "Discovery", priority: "P2 Normal" },
    ),
    { status: null, priority: "P2 Normal" },
  );
  assert.deepEqual(
    requiredProjectUpdates(
      { status: "Discovery", priority: "P2 Normal" },
      { status: "Discovery", priority: "P2 Normal" },
    ),
    { status: null, priority: null },
  );
});

test("serializes pull attempts", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "telesift-pull-"));
  const lockPath = path.join(directory, "pull.lock");
  try {
    withPullLock(() => {
      assert.throws(() => withPullLock(() => {}, lockPath), /Another agent is pulling/);
    }, lockPath);
    assert.equal(withPullLock(() => "released", lockPath), "released");
  } finally {
    rmSync(directory, { recursive: true });
  }
});
