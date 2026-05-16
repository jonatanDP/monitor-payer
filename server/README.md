# Secure Screen Manager Backend

Backend para monitoreo y control remoto de dispositivos Android kiosk.

## Stack

- Node.js
- Express
- PostgreSQL
- JWT
- bcrypt
- dotenv

## Estructura

```text
/server
|- src
|  |- config
|  |- controllers
|  |- routes
|  |- services
|  |- middleware
|  |- models
|  |- utils
|  |- app.js
|  `- server.js
|- .env
|- .env.example
|- package.json
`- README.md
```

## Instalacion

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## Variables .env

```env
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=root
DB_NAME=monitor
JWT_SECRET=change_this_secret
```

## Endpoints

Auth:
- `POST /auth/login`

Devices:
- `GET /devices`
- `POST /devices`
- `PUT /devices/:id`
- `GET /devices/:id`

Commands:
- `POST /devices/:id/command`
- `GET /devices/:id/commands`
- `PUT /commands/:id/execute`

Heartbeat:
- `POST /devices/:id/heartbeat`

## Ejecucion

```bash
npm run dev
```

## Notas

- El heartbeat actualiza `last_seen` y `status=online`.
- Si `last_seen` supera 20 segundos, el dispositivo pasa a `offline`.
- Las rutas de dispositivos y comandos administrativos usan JWT.
- Las respuestas de error se devuelven en JSON.
- Al iniciar, el backend prueba la conexion, crea tablas si no existen y deja `/health` reportando el estado real de la base.
