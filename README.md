# sistema-turnos

Monolito modular con `apps/api` y `apps/web` sobre `pnpm workspace`.

## Producción

1. Configurar las variables de `.env.example` en el gestor de secretos.
2. Rotar `AUTH_SECRET`, Access Token y firma webhook antes del primer deploy.
3. Ejecutar `pnpm install --frozen-lockfile`.
4. Ejecutar `pnpm deploy:api` antes de iniciar la nueva versión.
5. Iniciar API con `pnpm --filter @sistema-turnos/api start`.
6. Publicar `apps/web/dist` detrás de HTTPS.
7. Configurar Mercado Pago hacia `/api/v1/billing/webhooks/mercadopago`.
8. Usar `/health` para liveness y `/api/v1/health/ready` para readiness.

## Datos

### Suscripciones pendientes

La API consulta solo las suscripciones pendientes de Mercado Pago al iniciar y cada 5 minutos
después de finalizar la revisión anterior (no recorre el historial de autorizadas/canceladas).
Cancela checkouts de Turnosi que sigan pendientes 30 minutos después de su creación en
Mercado Pago, recorriendo todas las páginas, incluidos enlaces reemplazados. Reconsulta
el estado antes de cancelar y confirma la cancelación antes de cambiar el estado local.
En condiciones normales la cancelación ocurre aproximadamente entre los 30 y 35 minutos.
Los accesos manuales/trial y las suscripciones ya autorizadas no se vencen por este proceso.
Consultar el panel no reinicia el plazo. Si Mercado Pago falla, reintenta en la siguiente
revisión; requiere una API encendida. Supervisar los logs `pending subscription cancellation
deferred` y `pending subscription cleanup interrupted`. `jobs:cleanup` reutiliza esta lógica.
Referencia: [actualizar suscripciones](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/update-preapproval/put).

### Imágenes y Supabase Storage

- Por defecto `IMAGE_STORAGE_PROVIDER=database`: logos y galería siguen en PostgreSQL.
- Para activar Storage, crear un bucket **privado** `organization-images` en Supabase,
  con límite de 1 MB y tipos `image/webp`, `image/png`, `image/jpeg` (las imágenes se optimizan antes de subir).
  Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
  e `IMAGE_STORAGE_PROVIDER=supabase` exclusivamente en el backend. Nunca usar prefijo `VITE_`
  para la clave secreta. No hacen falta políticas públicas: la API sirve las imágenes.
- Aplicar `pnpm --filter @sistema-turnos/api prisma:migrate:deploy` antes de iniciar
  la API actualizada. Mantener el mismo proyecto/bucket para los archivos existentes.
- Ejecutar `pnpm --filter @sistema-turnos/api images:migrate` para trasladar las imágenes
  anteriores. Es reanudable: los bytes se eliminan de PostgreSQL solo después de subir y
  guardar la referencia; las imágenes antiguas siguen siendo legibles durante la transición.
- Eliminar una imagen borra su registro; reemplazarla o eliminar el negocio encola el
  archivo anterior mediante triggers de PostgreSQL, en la misma transacción. El worker
  de la API borra el objeto por la API de Storage y luego su registro de limpieza.
  Ante fallos reintenta con espera creciente (hasta una hora), incluso después de reiniciar.
  Las subidas interrumpidas se limpian después de una hora. Mantener una instancia de API
  activa y supervisar `image storage cleanup deferred`/`image storage cleanup interrupted`.
- Sin configuración válida, el modo Supabase rechaza nuevas subidas: no cambia silenciosamente
  al almacenamiento en base de datos. La limpieza conserva las tareas hasta poder ejecutarlas.
- Referencia: [acceso a Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control).

Para verificar el ciclo de imágenes en PostgreSQL local, con Storage simulado:
`$env:IMAGE_DB_TESTS='1'; pnpm --filter @sistema-turnos/api test -- src/modules/organizations/organization-images.integration.test.ts`

### Backups

- Activar backups diarios y recuperación punto en el tiempo en PostgreSQL.
- Conservar al menos 30 días y cifrar backups en reposo.
- Probar una restauración completa en staging mensualmente.
- Nunca ejecutar `prisma migrate reset` fuera de desarrollo.

## Validación

Antes de publicar:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @sistema-turnos/api test
pnpm build
```
