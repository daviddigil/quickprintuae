# Runbooks

Each runbook: **Detect, Contain, Fix, Verify, Record**. Everything privileged (gateway keys, payouts, IBAN reveal) needs a fresh 2FA step-up. Write down what you did in the incident log (and the audit log records the actions).

## 1. Failed payout
- **Detect**: bank rejects the transfer, or the batch stays `approved` past the expected date, or the shop reports no money.
- **Contain**: do not re-send blindly (double payment risk). Check the bank statement for the reference first.
- **Fix**: confirm the IBAN against the shop's licence holder and bank letter. If the account is wrong: shop updates the payout account (48 h block applies, `pending_review`), superadmin re-verifies. Move the failed item back to the next batch (mark the item failed with a reason, the ledger entry returns to `available`). Never edit ledger rows (append-only): add a correcting entry.
- **Verify**: batch totals equal the bank file; ledger balance for the shop equals the expected amount.
- **Record**: reason, new bank reference, who approved.

## 2. Chargeback / dispute
- **Detect**: gateway dispute webhook / email, negative ledger entry appears.
- **Contain**: place the shop's payouts on hold if the balance would go negative; check for a pattern (same card, same customer).
- **Fix**: gather evidence (order, proof approval, delivery confirmation, messages). Ask the shop within 24 h. Submit via the gateway dashboard before the deadline (Stripe: typically 7 to 21 days). If lost, the negative entry stays and carries forward against future payouts (seller agreement set-off clause).
- **Verify**: dispute status, ledger shows the fee and reversal once.
- **Record**: outcome, lessons, update prohibited-item rules if relevant.

## 3. Suspected fraud seller
- **Signs**: stolen/duplicate licence documents, many orders then refunds, bank account change right before a payout, blocklisted details, review flags (shared device/IP, similar names).
- **Contain (minutes)**: suspend the tenant (login and checkout off), block payouts, do not tell the seller why in writing yet.
- **Fix**: review audit log and orders; verify the licence with the authority by phone; refund affected customers from held funds; add licence/email/phone/IBAN to the blocklist; report to the gateway and, if the lawyer advises, to authorities.
- **Verify**: no pending batch contains the seller; ledger balance frozen.
- **Record**: evidence bundle (export audit rows, documents), decision and approver.

## 4. Gateway outage
- **Detect**: checkout errors, `/api/health` fine but payments failing, gateway status page.
- **Contain**: if only one gateway is down and the other is active, switch the active one in `/superadmin/gateways`. Otherwise show a banner and let shops take pay-on-pickup/walk-in orders.
- **Fix**: wait for the gateway; do not fake payments (`PAYMENTS_FAKE` must stay off).
- **Verify**: place a test payment; reconcile any orders left `pending` with the gateway dashboard (webhooks may arrive late and are idempotent).
- **Record**: duration, affected orders.

## 5. Webhook failures
- **Detect**: orders paid at the gateway but pending in our DB; alert on webhook 4xx/5xx.
- **Contain**: nothing is lost: gateways retry (Stripe up to 3 days).
- **Fix**: check signature errors (wrong webhook secret after rotation, wrong environment test vs live), clock skew, a proxy stripping the body. Fix the secret in `/superadmin/gateways` (step-up). Resend failed events from the gateway dashboard. Handlers are idempotent so replays are safe.
- **Verify**: orders move to paid; commission counted once; reconciliation view matches.
- **Record**: root cause.

## 6. Leaked key (gateway, email, S3, AUTH_SECRET, ENCRYPTION_KEY)
1. **Revoke first**: roll the key at the provider (Stripe dashboard roll key, Resend revoke, S3 access key delete, Mamo key regenerate).
2. Update the new key in the app (gateway keys: `/superadmin/gateways` with step-up; env keys: secret store then redeploy).
3. Check provider logs for use between leak and revoke; for gateways review refunds and payouts in that window.
4. Rotate related webhook secrets. Audit log review for the same window. Notify the lawyer if personal data may be exposed (PDPL breach duties, ask for the timeline).

## 7. Database restore
- **When**: data corruption, bad migration, accidental delete.
- **Contain**: put the app in maintenance (stop containers) so no new writes arrive.
- **Fix (managed Postgres PITR)**: restore to a NEW instance at the timestamp just before the incident; point `DATABASE_URL` at it; start one app instance with `RUN_MIGRATIONS=true` so the schema matches the code; verify; then scale back.
- **Fix (dump)**: `pg_restore --clean --if-exists -d $DATABASE_URL backup.dump`, run `npm run db:migrate`.
- **Verify**: `/api/health` returns `ok:true` with `migrationsUpToDate:true`; compare ledger totals with the last reconciliation; compare order counts with the gateway for the lost window and replay missed webhooks from the gateway dashboard. Files in object storage are not rolled back by a DB restore (orphans are harmless).
- **Drill**: do this on staging quarterly (GO_LIVE 2.2). Record the time to recover.

## 8. Rotating AUTH_SECRET
Effect: every session, step-up grant and 2FA challenge becomes invalid (everyone signs in again). Nothing else depends on it. Rolling procedure: set the new `AUTH_SECRET` on all instances in one deploy (a rolling deploy briefly has both: users may be logged out once). Do it at a quiet hour. Rotate immediately if it leaked.

## 9. Rotating ENCRYPTION_KEY
`ENCRYPTION_KEY` encrypts gateway keys, IBANs, TOTP secrets, WhatsApp tokens and confidential files. **Changing it without re-encrypting makes all of them unreadable.** Procedure:
1. Take a database snapshot (and copy the uploads volume / bucket).
2. Stop writes (maintenance) or accept that anything written during the run needs a second pass.
3. Dry run: `DATABASE_URL=... OLD_ENCRYPTION_KEY=<current> ENCRYPTION_KEY=<new> npx tsx scripts/reencrypt.ts --files --upload-dir /data/uploads`. It lists how many values would change and aborts if any value cannot be decrypted with either key.
4. Apply: same command plus `--apply` (database changes run in one transaction; files are rewritten in place).
5. Deploy with `ENCRYPTION_KEY=<new>`. Remove the old key from the environment. Keep the old key in the vault for 30 days with the snapshot.
6. For `STORAGE_DRIVER=s3`: sync the `.enc` objects to a local folder, run `--files --upload-dir <folder> --apply`, sync back. (The script does not call S3 itself.)
7. Verify: open a shop's verification document, run a gateway Test button, log in as a 2FA user.

## 10. Locked-out superadmin (lost phone, lost recovery codes)
Use a remaining recovery code first. If none: with DB access and a second approver, run `update users set totp_secret_enc=null, totp_enabled_at=null, recovery_codes_hash='[]' where email='...'`, then the user enrols again immediately (in production the admin area redirects to enrolment). The change is not audited automatically: write an audit row manually and record who approved. For a locked account (5 failures) wait 15 minutes or clear `failed_logins`/`locked_until`.
