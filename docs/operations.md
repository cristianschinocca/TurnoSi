# Operations

## Backups

- Enable daily managed PostgreSQL backups and point-in-time recovery.
- Retain 30 days, encrypt at rest, and test a staging restore monthly.
- Alert when a backup or monthly restore verification fails.

## Monitoring and alerts

- Monitor `GET /health` every minute and `GET /api/v1/health/ready` every five minutes.
- Alert after three failures, API 5xx above 2%, or p95 latency above two seconds.
- Alert on failed Mercado Pago webhooks, cleanup jobs, database saturation, and expiring certificates.

## Rate limiting

## Billing price changes

Deploy database migrations before starting the API (`pnpm --filter @sistema-turnos/api prisma:migrate:deploy`). The price worker runs in the API process; keep at least one instance running and allow 40 seconds for graceful shutdown. Pending work survives restarts. An advisory lock serializes workers across replicas, independently of checkout creation.

Superadmin > Suscripciones changes the catalog immediately and queues updates for linked Mercado Pago subscriptions. This is not an atomic change across all customers: existing subscriptions may temporarily have different amounts. Already issued payments are not rewritten. The worker reads back the provider amount before reporting success.

Transient failures retry up to five attempts with delays of 30, 60, 120 and 240 seconds. Final failures block another price change for the same plan. Review the subscription IDs and sanitized errors in Incidencias, resolve credentials/provider issues, then retry. A detached subscription requires reconciliation with Mercado Pago; confirming its cancellation allows the task to finish without modifying it. Do not manually mark tasks successful.

Monitor `billing price synchronization failed` and `billing price synchronization interrupted`. Alert on pending tasks whose `nextAttemptAt` is over five minutes old. Logs alone are not configured external alerts. The queue only covers agreements linked in this database when the change is made; reconcile any older, orphaned agreements before onboarding production customers.

Run PostgreSQL integration tests locally in PowerShell:

```powershell
$env:BILLING_DB_TESTS = '1'
pnpm --filter @sistema-turnos/api test -- src/modules/billing/billing-prices.integration.test.ts
```

Tests create and remove an isolated schema and mock Mercado Pago. Before production, verify one controlled subscription end to end with the intended seller account, including the next invoice and failure recovery. Unit/integration tests cannot guarantee availability or charging behavior of an external payment provider.

The API uses process memory to avoid PostgreSQL writes. Run one API instance initially. Before horizontal scaling, replace the store with managed Redis so all instances share counters.
