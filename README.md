# PJ | Gestión Digital — Backend

API de **PJ | Gestión Digital** (nombre técnico interno del repositorio:
`FPJ-IA`), plataforma de gestión documental para procedimientos de
captura y aprehensión en flagrancia. Un funcionario diligencia un
formulario por bloques y el sistema genera automáticamente los
documentos oficiales (FPJ 5, FPJ 6, Acta de Incautación, FPJ 7, FPJ 8),
incluida la narrativa de los hechos del FPJ-5, redactada mediante la API
de Anthropic.

**Repositorio hermano:** el frontend vive en
[`assistenceit-arch/FPJ-IA-frontend`](https://github.com/assistenceit-arch/FPJ-IA-frontend)
— repositorio separado, ambos bajo la misma cuenta/organización de
GitHub, ambos privados. Este backend no funciona de forma útil sin ese
frontend corriendo en paralelo (o sin un cliente propio contra esta
misma API).

## Delitos soportados

15 delitos al momento de escribir esto: Tráfico/Fabricación/Porte de
Estupefacientes, Porte Ilegal de Armas de Fuego, Hurto, Lesiones
Personales, Violencia contra Servidor Público, Violencia Intrafamiliar,
Receptación, Homicidio, Suministro a Menor, Uso de Documento Falso,
Falsedad Personal, Tráfico de Moneda Falsa, Secuestro, Extorsión, y
Daño en Bien Ajeno o del Estado. Un delito que no está en
`src/narrativa/delitos.ts` no se puede gestionar desde la plataforma —
no hay una opción de "otro delito" genérica.

## Política de retención de datos

Todo procedimiento se elimina físicamente 7 días después de su
creación, sin excepción (ver `src/limpieza-automatica/`) — las cuentas
de usuario no se ven afectadas. El registro de auditoría
(`src/auditoria/`) conserva un rastro mínimo sin datos personales de
cada evento, incluidos los borrados automáticos, consultable desde el
panel de administración.

## Stack

NestJS + Prisma + PostgreSQL. Autenticación con JWT (`@nestjs/passport`
+ `passport-jwt`). Documentos Word generados por reemplazo de tokens
`{{TOKEN}}` sobre plantillas `.docx` reales (ver `assets/documentos/`),
con la narrativa de los hechos generada por la API de Anthropic (ver
`docs/NARRATIVA-IA-FPJ5.md`). Tareas programadas con `@nestjs/schedule`
(borrado automático por retención).

## Requisitos

- Node.js
- PostgreSQL
- Una API key de Anthropic (para la generación de narrativa del FPJ-5)

## Puesta en marcha

```bash
npm install
```

Crear un archivo `.env` en la raíz con:

```
DATABASE_URL=postgresql://usuario:password@localhost:5432/fpj_ia
JWT_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=http://localhost:3001
PORT=3000
NODE_ENV=development
# Envío de correos (verificación de cuenta, notificaciones)
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

Luego:

```bash
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

El servidor arranca en el puerto configurado en `.env` (por defecto
`3000`). El frontend corre en paralelo en otro puerto (por defecto
`3001`).

## Estructura

- `src/` — un módulo de NestJS por entidad/funcionalidad (funcionario,
  intervinientes/capturados, testigos, víctimas, elementos incautados,
  actuaciones, documentos, narrativa, pagos, admin, auth, auditoria,
  limpieza-automatica).
- `prisma/schema.prisma` — modelo de datos. Las migraciones en
  `prisma/migrations/` son el historial real aplicado a la base de
  datos; no se editan ni se eliminan, incluso si quedan obsoletas.
- `assets/documentos/` — plantillas `.docx` reales que se rellenan por
  tokens para generar los documentos oficiales.
- `assets/prompts/` — el Prompt CORE de la narrativa (`core-transversal.md`,
  transversal a todos los delitos, más `reglas-adultos.md`/`reglas-srpa.md`)
  más 4 archivos `{prefijo}-*.md` por cada uno de los 15 delitos
  soportados.
- `docs/NARRATIVA-IA-FPJ5.md` — cómo funciona el motor de narrativa.

## Agregar un delito nuevo

Registrar el delito en `src/narrativa/delitos.ts`, escribir los 4
archivos de prompt propios del delito (sin duplicar lo que ya cubre
`core-transversal.md` o un módulo hermano ya construido, ej. Lesiones
Personales para cualquier delito con agresión física), y si el delito
necesita un tipo de elemento incautado propio, seguir el patrón de
`ElementoIncautado.tipoElemento` + modelo de detalle 1:1. La mayoría de
los últimos delitos agregados no necesitaron ni entidades nuevas ni
cambios en las plantillas `.docx` — solo extendieron `Victima` o
`ElementoIncautado` con un puñado de campos propios.

## Comandos útiles

```bash
npm run build          # compila con nest build
npm run start:dev      # desarrollo con recarga automática
npx prisma studio       # explorar la base de datos visualmente
npx prisma migrate dev  # crear una migración nueva en desarrollo
```

