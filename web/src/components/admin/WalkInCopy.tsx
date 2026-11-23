"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

export function WalkInCopy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1800); }}>
      {done ? <Check size={15} /> : <Copy size={15} />}{done ? "Copied" : label}
    </Button>
  );
}
