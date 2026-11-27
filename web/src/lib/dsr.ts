/** Pure data-subject-request helpers (no server imports). */
export const DSR_TRANSITIONS: Record<string, string[]> = {
  requested: ["in_progress", "completed", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};
export const canMoveDsr = (from: string, to: string) => (DSR_TRANSITIONS[from] ?? []).includes(to);
export const isDsrOverdue = (r: { status: string; dueAt: Date }, now = new Date()) =>
  (r.status === "requested" || r.status === "in_progress") && r.dueAt.getTime() < now.getTime();
