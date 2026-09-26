# ESTABLO — Plataforma de mantenimiento de equipos (Sobitec)

Implementación de la plataforma descrita en "Indicaciones para el desarrollo de la
plataforma ESTABLO": checklists de inspección/mantenimiento con login de operador,
plataforma maestra (admin) para gestionar equipos, checklists, incidencias y usuarios,
código QR por equipo, calendario de inspecciones y alertas de incidencia por Telegram.

Stack: Node.js + Express · Neon (Postgres) · Cloudinary (fotos) · Telegram Bot API (alertas).

## 1. Crear la base de datos en Neon

1. Crea un proyecto en https://neon.tech
2. Copia el "Connection string" (incluye `?sslmode=require`)
3. Aplica el esquema una sola vez:
   ```
   psql "TU_CONNECTION_STRING" -f src/db/schema.sql
   ```

## 2. Crear el bot de Telegram

1. En Telegram, habla con **@BotFather** → `/newbot` → sigue las instrucciones → copia el **token**.
2. Crea un grupo de Telegram con todos los administradores y agrega el bot a ese grupo.
3. Envía cualquier mensaje en el grupo, luego visita en el navegador:
   `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
4. Busca `"chat":{"id": -100XXXXXXXXXX, ...}` — ese número es tu `TELEGRAM_CHAT_ID`.

## 3. Crear la cuenta de Cloudinary

1. Crea una cuenta gratuita en https://cloudinary.com
2. En el dashboard, copia **Cloud name**, **API Key** y **API Secret**.

## 4. Variables de entorno

Copia `.env.example` a `.env` (solo para pruebas locales) y completa:

```
DATABASE_URL=postgresql://usuario:password@ep-xxxx.neon.tech/establo?sslmode=require
JWT_SECRET=una-cadena-larga-y-aleatoria
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
PLATFORM_URL=https://tu-servicio.onrender.com
```

## 5. Cargar datos iniciales (tipos de equipo, tipos de checklist, usuario admin)

Localmente, con `DATABASE_URL` apuntando a Neon:
```
npm install
npm run seed
```
Esto crea el usuario `admin` / `establo2026` (puedes definir `SEED_ADMIN_USER` y
`SEED_ADMIN_PASSWORD` como variables de entorno antes de correr el seed para
usar tus propias credenciales). **Cambia la contraseña desde la plataforma
apenas ingreses por primera vez.**

## 6. Desplegar en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render: **New → Web Service** → conecta el repositorio.
3. Configuración:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
4. En la pestaña **Environment**, agrega las mismas variables de entorno del paso 4
   (usa el `DATABASE_URL` de Neon, no uno local).
5. Despliega. Render asigna automáticamente `PORT`, el servidor ya lo respeta.
6. Corre el seed una vez contra la base de Neon (puedes hacerlo desde tu máquina local
   apuntando `DATABASE_URL` a Neon, como en el paso 5, o desde el Shell de Render).

## 6.1 Actualizaciones posteriores (migraciones)

Cuando se agregan cambios que requieren nuevas columnas o tablas, se entrega un archivo
`src/db/migracion_AAAA-MM-DD.sql`. Se pega y ejecuta una sola vez en el SQL Editor de Neon,
igual que `schema.sql`, después de subir el código actualizado a GitHub/Render.

## 7. Uso

- **Operadores:** entran por la URL raíz (`/`), inician sesión, eligen el checklist,
  ingresan o escanean (QR, cámara del celular) los equipos requeridos y completan el checklist.
- **Administradores:** mismo login, son redirigidos automáticamente a `/admin/dashboard.html`.
  Desde ahí gestionan equipos (con generación de QR para imprimir), tipos de checklist,
  incidencias (ver detalle, marcar resuelta/pendiente), calendario de inspecciones por
  equipo y usuarios (alta de Admin / No admin).
- **Incidencias:** cada ítem marcado "Observado" en un checklist genera automáticamente
  una incidencia con código único y dispara una alerta al grupo de Telegram configurado.

## Estructura del proyecto

```
src/
  server.js          Servidor Express (sirve la API y el frontend estático)
  db/
    schema.sql       Esquema de base de datos (ejecutar una vez en Neon)
    seed.js           Datos iniciales (tipos de equipo, checklists, admin)
    pool.js           Conexión a Postgres
  routes/             auth, equipos, checklists, inspecciones, incidencias, usuarios
  cloudinary.js        Subida de fotos
  telegram.js           Envío de alertas
public/
  index.html            Login (operador y admin)
  seleccionar.html       Selección de checklist + ingreso/escaneo de equipos
  checklist.html          Formulario del checklist
  admin/                  Plataforma maestra
```

## Notas de diseño

- Un checklist puede tener varias **variantes** de equipos requeridos (ej. con SIM Card
  vs. con Starlink); el operador debe completar una variante entera antes de continuar.
- Las inspecciones se agrupan por `carpeta_fecha` (AAAA-MM-DD) y llevan un **folio**
  correlativo por día (ej. `2026-09-25-001`).
- El calendario por equipo distingue por color si en un día hubo checklist
  pre-operacional (código `01-01`), mantenimiento/otro, o ambos.
- Los tipos de checklist y sus ítems son editables desde **Admin → Checklists** sin
  tocar código, tal como pide el punto de la "plataforma maestra" del documento.
