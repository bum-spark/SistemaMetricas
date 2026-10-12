# Deploy de la API (Render + MongoDB Atlas)

Guía paso a paso para publicar la API. La configuración del servicio está en
[`render.yaml`](../render.yaml); aquí van los pasos manuales, en orden.

> **Reglas de secretos:** la cadena de conexión de Atlas, el `JWT_SECRET` y las API keys
> solo viven en el panel de Render y en tu `api/.env` local (que git ignora). Nunca en el
> repositorio, ni en un chat, ni en capturas. Si alguno se filtra: cambia la contraseña del
> usuario de Atlas, genera otro `JWT_SECRET` o rota la API key (`npm run rotar-api-key`).

---

## 0. Antes de empezar

- El repositorio debe estar en GitHub (puede ser privado): Render despliega desde ahí.
- Tu cluster de Atlas debe ser **MongoDB 7.0 o superior** (Atlas → tu cluster → versión);
  las estadísticas usan `$median`.
- En tu computadora: Node **22.22.0** y `npm install` hecho en `/api`.

## 1. Atlas: base, usuario y acceso de red

El cluster es compartido con otro proyecto, así que la API usa **su propia base y su propio
usuario, con permiso solo sobre esa base** (R-41).

1. **Crear la base** (Data Explorer / *Browse Collections* → **Create Database**):
   - *Database name*: **`xolos_analytics`**.
   - *Collection name* (Atlas pide una colección inicial): **`juegos`**.
   - Las demás colecciones (`jugadores`, `sesiones`, `eventos`, `logros`, `admins`) y todos
     los índices los crea la API sola al arrancar; no hace falta crearlos a mano.
2. **Crear el usuario** (Security → **Database Access → Add New Database User**):
   - *Authentication Method*: **Password**.
   - Usuario: por ejemplo `xolos_api`. Contraseña: botón **Autogenerate Secure Password**
     (cópiala a tu gestor de contraseñas; no la pegues en ningún chat).
   - *Database User Privileges*: **no** elijas un rol integrado como "Read and write to any
     database". Abre **Specific Privileges → Add Specific Privilege** y pon:
     - Role: **`readWrite`**
     - Database: **`xolos_analytics`**
     - Collection: vacío (toda la base)
   - Así la API no puede leer ni tocar la base del otro proyecto.
3. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`).
   Render (plan gratuito) no tiene IP de salida fija. El riesgo queda acotado porque el
   usuario solo tiene `readWrite` en `xolos_analytics` y una contraseña aleatoria larga
   (R-41). Si después se usa un plan con IP fija, se reemplaza por esas IPs.
4. **Connect → Drivers**: copia la cadena `mongodb+srv://...` y **quítale el nombre de base**
   de la ruta (debe terminar en `.mongodb.net/?retryWrites=true&w=majority`) y pon la contraseña del
   usuario `xolos_api`. La base se indica aparte con `MONGODB_DB`; si la URI trae otra, la API
   no arranca (R-33).

## 2. Render: crear el servicio

1. Render → **New → Blueprint** → elige el repositorio. Render detecta `render.yaml` y
   propone el servicio `xolos-analytics-api` (web, Node, plan free, carpeta `api`).
2. Llena las variables de entorno que pide (ninguna tiene valor en el repositorio):

   | Variable | Valor | ¿Secreta? |
   |---|---|---|
   | `NODE_ENV` | `production` | no |
   | `APP_NAME` | `Estudio Xolos` | no |
   | `MONGODB_URI` | la cadena del paso 1.4 (sin nombre de base) | **sí** |
   | `MONGODB_DB` | `xolos_analytics` | no |
   | `JWT_SECRET` | 48 bytes aleatorios (ver abajo). **Obligatoria**: sin ella (o con menos de 32 caracteres) la API no arranca | **sí** |
   | `CORS_ORIGIN` | **provisionalmente `http://localhost:4200`**; cuando el dashboard esté publicado, cámbialo por su dominio (p. ej. `https://xolos-dashboard.netlify.app`) y vuelve a desplegar | no |
   | `TRUST_PROXY` | `1` | no |
   | `RATE_LIMIT_INGESTA_IP` | `300` (o vacío = 300) | no |
   | `RATE_LIMIT_INGESTA_KEY` | `1000` (o vacío = 1000) | no |
   | `RATE_LIMIT_PUBLICO_IP` | `600` (o vacío = 600) | no |
   | `RATE_LIMIT_LOGIN_IP` | `5` (o vacío = 5): intentos fallidos de login por IP cada 15 min | no |

   Para generar `JWT_SECRET` en tu computadora:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   `PORT` no se configura: Render la define sola. Una variable vacía cuenta como no
   definida (toma el valor por defecto; R-42).
3. **Apply / Deploy**. El build hace `npm ci` (sin descargar el MongoDB de los tests),
   compila TypeScript y quita las dependencias de desarrollo. En los logs debe aparecer:
   ```
   [Estudio Xolos] API escuchando en el puerto 10000 (production)
   ```
   Si aparece `Configuración inválida: ...`, el mensaje dice qué variable falta o está mal.
4. Anota la URL del servicio: `https://<tu-servicio>.onrender.com`.

## 3. Desde tu computadora: crear el juego y el admin en Atlas

Los scripts corren en tu máquina contra Atlas. La URI **solo** va en tu `api/.env` local.

1. En `api/.env` (crea el archivo a partir de `api/.env.example` si no existe):
   ```dotenv
   MONGODB_URI=<la misma cadena del paso 1.4>
   MONGODB_DB=xolos_analytics
   ADMIN_EMAIL=<tu correo>
   ADMIN_PASSWORD=<mínimo 12 caracteres>
   ADMIN_NOMBRE=<tu nombre>
   ```
2. Primero **sin** `--confirmar`, para ver a dónde apunta (no escribe nada):
   ```bash
   cd api
   npm run crear-juego -- --juego la-casa-del-bosque
   ```
   Debe decir `Base de datos: xolos_analytics en <tu-cluster>.mongodb.net (REMOTA)` y negarse.
   Si la base o el host no son los que esperas, **detente** y revisa el `.env`.
3. Ahora sí, con `--confirmar`:
   ```bash
   npm run crear-juego -- --juego la-casa-del-bosque --confirmar
   ```
   Muestra el `juegoId` y la **API key una sola vez**. Guárdalos en tu gestor de contraseñas
   (la key también irá en la configuración del SDK de Unity). No los pegues en el chat.
4. Crea el admin (recibe acceso a los juegos existentes):
   ```bash
   npm run crear-admin -- --confirmar
   ```
   Después **borra `ADMIN_PASSWORD` de tu `.env`**.
5. **Datos de prueba para la demo (opcional):** primero sin `--confirmar` para revisar el
   destino, luego:
   ```bash
   npm run seed-datos -- --confirmar
   ```
   Crea "Faro Nocturno (demo)" (sin API key) y llena los dos juegos con datos `origen: "seed"`
   de los últimos 14 días. Se puede repetir (borra su seed anterior antes de insertar) y se
   quita con `npm run limpiar-seed -- --confirmar`. El dashboard puede filtrarlos con
   `origen=real`.

## 4. Comprobar el deploy

La primera petición después de un rato puede tardar ~1 minuto (el plan gratuito "duerme").

> ⚠️ **No uses un monitor de ping 24/7** (UptimeRobot, cron-job.org, etc.) para mantener el
> servicio despierto: consume casi todas las **750 horas gratuitas al mes del workspace** de
> Render, que comparten todos tus servicios. Solo haz ping (abrir `/api/v1/salud`) **los días
> de demo**, unos minutos antes de presentar.

1. Salud:
   ```bash
   curl https://<tu-servicio>.onrender.com/api/v1/salud
   # {"estado":"ok"}
   ```
2. Documentación: abre `https://<tu-servicio>.onrender.com/api/v1/docs` en el navegador.
3. Seguridad de la ingesta (no crea datos):
   ```bash
   curl -X POST https://<tu-servicio>.onrender.com/api/v1/eventos -H "Content-Type: application/json" -d "{}"
   # {"error":{"codigo":"API_KEY_INVALIDA",...}}
   ```
4. Postman/Newman contra producción, solo la carpeta "Salud" (no crea datos reales):
   ```bash
   cd api
   npm run postman:produccion -- --env-var baseUrl=https://<tu-servicio>.onrender.com/api/v1
   ```
   La colección completa crea un jugador de prueba con `origen: "real"` y al final lo borra
   (carpeta "Administración" → "Borrar el jugador de prueba"). Necesita también `adminEmail` y
   `adminPassword`: cárgalos en el entorno de Postman de tu computadora (no en el repositorio)
   y córrela desde la app de Postman. Si se interrumpe antes del borrado, quedará ese jugador;
   bórralo con el request "Borrar el jugador de prueba".
5. Para compartir el resultado conmigo, pega solo: la respuesta de `/salud`, el resumen de
   Newman y la salida de los scripts **reemplazando la API key por `ak_***`**.

## 5. Problemas comunes

| Síntoma (en los logs de Render o en el script) | Causa probable |
|---|---|
| `Configuración inválida: - MONGODB_DB: es obligatoria` | Falta la variable en Render o en tu `.env`. |
| `la URI apunta a la base "X" pero MONGODB_DB es "xolos_analytics"` | La URI trae un nombre de base: quítalo (paso 1.4). |
| `Server selection timed out` / el deploy se queda reiniciando | Atlas no permite la IP: revisa Network Access (paso 1.3). |
| `bad auth : authentication failed` | Usuario o contraseña de Atlas incorrectos en la URI (si la contraseña tiene `@`, `:` o `/`, debe ir codificada). |
| `not authorized on xolos_analytics` | El usuario no tiene `readWrite` sobre `xolos_analytics` (paso 1.2). |
| El script dice `La base de datos no es local...` | Es lo esperado sin `--confirmar` (paso 3.2). |
| La primera petición tarda ~1 min | El servicio gratuito estaba dormido; las siguientes son rápidas. |
