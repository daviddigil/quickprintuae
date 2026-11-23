import { test } from "node:test";
import assert from "node:assert/strict";
import { groupQueue, priorityLabel, type QueueRow, type JobStatus } from "./group";

let n = 0;
const row = (status: JobStatus, o: Partial<QueueRow> = {}): QueueRow => ({
  id: `j${++n}`, orderId: "o", orderNumber: "N", ticketNo: "W-001", status, priority: 0, filename: "f.pdf", fileId: "f", pages: 1, copies: 1, pagesVerified: true,
  options: { color: "bw", sides: "single", paperSize: "A4" }, printerName: null, attempts: 0, error: null, queuedAt: null, startedAt: null, finishedAt: null,
  createdAt: "2026-11-22T10:00:00Z", customerName: "A", customerPhone: "+971500000000", paid: status !== "awaiting_payment", ...o,
});

test("sections mirror the agent queue order", () => {
  const g = groupQueue([
    row("queued", { id: "normal-old", queuedAt: "2026-11-22T10:00:00Z" }),
    row("queued", { id: "normal-new", queuedAt: "2026-11-22T10:05:00Z" }),
    row("queued", { id: "high", priority: 1, queuedAt: "2026-11-22T10:09:00Z" }),
    row("queued", { id: "urgent", priority: 2, queuedAt: "2026-11-22T10:20:00Z" }),
    row("printing", { id: "p1" }), row("needs_manual", { id: "m1" }), row("failed", { id: "f1" }), row("awaiting_payment", { id: "w1" }), row("cancelled", { id: "c1" }),
  ]);
  assert.deepEqual(g.upNext.map((r) => r.id), ["urgent", "high", "normal-old", "normal-new"]);
  assert.deepEqual(g.printing.map((r) => r.id), ["p1"]);
  assert.deepEqual(g.attention.map((r) => r.id).sort(), ["f1", "m1"]);
  assert.deepEqual(g.awaiting.map((r) => r.id), ["w1"]);
  assert.equal(JSON.stringify(g).includes("c1"), false, "cancelled jobs are hidden");
});
test("recent printed: newest first, capped at 20", () => {
  const rows = Array.from({ length: 25 }, (_, i) => row("printed", { id: `r${i}`, finishedAt: new Date(2026, 10, 22, 10, i).toISOString() }));
  const g = groupQueue(rows);
  assert.equal(g.recent.length, 20); assert.equal(g.recent[0].id, "r24");
});
test("priority labels", () => { assert.deepEqual([0, 1, 2, 3].map(priorityLabel), ["Normal", "High", "Urgent", "Urgent"]); });
