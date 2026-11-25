"use client";
import { useState } from "react";
import { Button, Segmented, Switch, Tabs, useSnackbar, SnackbarProvider } from "@/components/ui";

function Inner() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"monthly" | "yearly">("monthly");
  const { show } = useSnackbar();
  return (
    <div className="space-y-5">
      <Switch checked={on} onChange={setOn} label="Accept walk-in jobs" hint="Customers can scan the QR code at your counter." />
      <Segmented ariaLabel="Billing period" value={seg} onChange={setSeg} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
      <Tabs ariaLabel="Example tabs" tabs={[{ id: "a", label: "Orders", content: <p className="text-sm">Orders panel</p> }, { id: "b", label: "Queue", content: <p className="text-sm">Queue panel</p> }]} />
      <Button variant="tonal" onClick={() => show("Order marked as ready", { tone: "success", action: { label: "Undo", onClick: () => {} } })}>Show snackbar</Button>
    </div>
  );
}
export function DemoInteractive() { return <SnackbarProvider><Inner /></SnackbarProvider>; }
