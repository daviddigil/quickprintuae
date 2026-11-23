"use client";
import { useActionState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { createWalkInAgent, revokeWalkInAgent, type AgentFormState } from "@/app/admin/walk-in/actions";
import { WalkInCopy } from "./WalkInCopy";

interface AgentView { id: string; name: string; prefix: string; active: boolean; online: boolean; lastSeenAt: string | null; printers: string[] }
const seen = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "never");

export function WalkInAgents({ agents, appUrl, isOwner }: { agents: AgentView[]; appUrl: string; isOwner: boolean }) {
  const [state, action, pending] = useActionState<AgentFormState, FormData>(createWalkInAgent, null);
  const cmd = state?.key ? `node agent.mjs --server ${appUrl} --key ${state.key} --printer "Your printer name"` : "";
  return (
    <Card data-testid="agents-card">
      <CardHeader title="Print agents" subtitle="A small program on the shop PC that pulls paid jobs in queue order and sends them to the printer." />
      <div className="space-y-4 p-5">
        {agents.length === 0 ? <p className="text-sm text-slate-500">No agents yet. Add one, then install it on the PC connected to your printer.</p> : (
          <ul className="divide-y rounded-lg border">
            {agents.map((a) => (
              <li key={a.id} data-agent={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${!a.active ? "bg-slate-300" : a.online ? "bg-emerald-500" : "bg-amber-400"}`} />
                    {a.name} <code className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">{a.prefix}…</code>
                    {!a.active && <Badge>revoked</Badge>}{a.active && (a.online ? <Badge tone="green">online</Badge> : <Badge tone="yellow">offline</Badge>)}
                  </p>
                  <p className="text-xs text-slate-500">Last seen {seen(a.lastSeenAt)}{a.printers.length ? ` · printers: ${a.printers.join(", ")}` : ""}</p>
                </div>
                {isOwner && a.active && (
                  <form action={revokeWalkInAgent}><input type="hidden" name="agentId" value={a.id} /><Button variant="ghost" className="text-red-600">Revoke</Button></form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner ? (
          <form action={action} className="flex flex-wrap gap-2">
            <Input name="name" placeholder="e.g. Front counter PC" className="max-w-xs" required minLength={2} maxLength={60} />
            <Button disabled={pending} data-testid="add-agent">{pending ? "Creating…" : "Add agent"}</Button>
          </form>
        ) : <p className="text-xs text-slate-500">Only the shop owner can add or revoke agents.</p>}
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.key && (
          <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4" data-testid="agent-key-box">
            <p className="text-sm font-semibold text-amber-900">Copy this key now — for security it is shown only once.</p>
            <div className="flex flex-wrap items-center gap-2"><code data-testid="agent-key" className="break-all rounded bg-white px-2 py-1 text-sm">{state.key}</code><WalkInCopy text={state.key} label="Copy key" /></div>
            <p className="text-xs font-medium text-amber-900">On the shop PC (Node 20+ installed), in the print-agent folder:</p>
            <div className="flex flex-wrap items-start gap-2"><pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{cmd}</pre><WalkInCopy text={cmd} label="Copy command" /></div>
          </div>
        )}
      </div>
    </Card>
  );
}
