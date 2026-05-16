# Secure Screen Manager

Sistema funcional para monitoreo y control remoto de dispositivos Android kiosk en tiempo real.

Incluye:
- backend Node.js + Express
- PostgreSQL
- panel web React + Vite
- integracion con la app Android del repositorio

## Estructura

```text
/project-root
|- app
|- server
|- client
|- database
`- README.md
```

## Base de datos

Archivo: `database/init.sql`

Tablas:
- `devices`
- `commands`
- `users`

Campos principales:
- `devices`: `id`, `name`, `status`, `last_seen`, `ip`, `mode`
- `commands`: `id`, `device_id`, `action`, `executed`, `created_at`

Preparacion:

```bash
createdb secure_screen_manager
psql -d secure_screen_manager -f database/init.sql
```

Usuario inicial:
- usuario: `admin`
- password: `admin123`

## Backend

Ruta: `server`

Instalacion:

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Variables:

```env
DB_URL=postgres://postgres:postgres@localhost:5432/secure_screen_manager
JWT_SECRET=change_this_secret
PORT=4000
```

Endpoints:
- `POST /login`
- `GET /devices`
- `POST /devices`
- `PUT /devices/:id`
- `GET /devices/:id`
- `POST /devices/:id/heartbeat`
- `POST /devices/:id/command`
- `GET /devices/:id/commands`

Comportamiento:
- el heartbeat marca el dispositivo como `online`
- si `last_seen` supera 20 segundos, el backend lo deja en `offline`
- los comandos pendientes se entregan en `GET /devices/:id/commands`
- los comandos entregados se marcan como ejecutados

Comandos soportados:
- `SCREEN_OFF`
- `RESTART_APP`
- `REBOOT_DEVICE`

## Frontend

Ruta: `client`

Instalacion:

```bash
cd client
npm install
npm run dev
```

El panel incluye:
- login con JWT
- dashboard con polling cada 5 segundos
- lista de dispositivos con nombre, IP, estado, ultima conexion y modo
- acciones remotas por dispositivo:
  - `Apagar`
  - `Reiniciar app`
  - `Reiniciar equipo`

## Integracion Android

La app Android debe:
- enviar heartbeat cada 10 segundos a `POST /devices/{id}/heartbeat`
- consultar comandos cada 10 segundos en `GET /devices/{id}/commands`

Ejemplo de heartbeat:

```json
{
  "name": "Pantalla Lobby",
  "location": "Recepcion",
  "timeout_minutes": 30,
  "mode": "SCREEN_OFF"
}
```

Ejemplos de comandos:

```json
{
  "action": "SCREEN_OFF"
}
```

```json
{
  "action": "RESTART_APP"
}
```

```json
{
  "action": "REBOOT_DEVICE"
}
```

## Uso rapido

1. Importa `database/init.sql` en PostgreSQL.
2. Levanta el backend en `http://localhost:4000`.
3. Levanta el frontend en `http://localhost:5173`.
4. Ingresa con `admin / admin123`.
5. Abre el dashboard y controla los dispositivos conectados.
