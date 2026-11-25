import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { dubai } from "@/components/admin/format";
import { createStaff, toggleStaff } from "../actions";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const sp = await searchParams;
  const team = await db.query.users.findMany({ where: and(eq(schema.users.tenantId, tenant.id), ne(schema.users.role, "customer")), orderBy: [asc(schema.users.name)] });
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const activeCount = team.filter((u) => u.active).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Staff" subtitle={`${activeCount}${plan?.maxStaff ? ` of ${plan.maxStaff}` : ""} team members on the ${plan?.name ?? "current"} plan`} />
      <Flash sp={sp} />
      <Card>
        <Table head={["Name", "Email", "Role", "Last sign-in", "Status", ""]}>
          {team.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium">{u.name}{u.id === user.id && <span className="text-xs text-outline"> (you)</span>}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3"><Badge tone={u.role === "owner" ? "purple" : "gray"}>{u.role}</Badge></td>
              <td className="px-4 py-3 text-xs text-on-surface-variant">{dubai(u.lastLoginAt)}</td>
              <td className="px-4 py-3">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</td>
              <td className="px-4 py-3 text-right">
                {u.id !== user.id && (
                  <form action={toggleStaff}><input type="hidden" name="userId" value={u.id} /><Button variant="ghost" className="text-xs">{u.active ? "Deactivate" : "Re-activate"}</Button></form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <CardHeader title="Add team member" subtitle="Share the email and password with them; they sign in at /login." />
        <form action={createStaff} className="grid items-end gap-4 p-5 md:grid-cols-6">
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="Phone"><Input name="phone" /></Field>
          <Field label="Temporary password"><Input name="password" type="text" minLength={8} required autoComplete="off" /></Field>
          <Field label="Role"><Select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="owner">Co-owner</option></Select></Field>
          <Button>Add member</Button>
        </form>
        <p className="px-5 pb-5 text-xs text-on-surface-variant">Staff can manage orders, products and fulfillment. Owners can also change payments, store settings and staff.</p>
      </Card>
    </div>
  );
}
