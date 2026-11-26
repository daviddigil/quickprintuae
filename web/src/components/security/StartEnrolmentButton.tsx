import { Button } from "@/components/ui";

/** A plain GET link-form: re-renders the page with ?setup=1 so the server creates the secret and shows the QR. */
export function StartEnrolmentButton() {
  return <form method="get"><input type="hidden" name="setup" value="1" /><Button data-testid="start-2fa">Set up two-factor</Button></form>;
}
