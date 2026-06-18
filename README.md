# ChatBot WhatsApp - Lopez Tech

Chatbot profesional para WhatsApp enfocado en la gestión de agendas y citas para Lopez Tech.

## Características

- 🤖 Chatbot conversacional con menús interactivos
- 📅 Sistema completo de agendamiento de citas
- 🔧 Catálogo de servicios
- 👥 Gestión de clientes
- 📊 Panel de estadísticas vía API
- 🔗 Integración con yCloud API (WhatsApp Business API oficial)
- 💾 Persistencia con SQLite

## Guía de Conexión con yCloud

### Paso 1: Crear cuenta en yCloud

1. Ve a [ycloud.com](https://www.ycloud.com)
2. Haz clic en "Try for free"
3. Crea tu cuenta
4. Verifica tu email

### Paso 2: Obtener tu API Key

1. Entra al [Panel de yCloud](https://www.ycloud.com/console/#/app/developers/apikey)
2. Ve a **Developer > API Keys**
3. Haz clic en **Create API Key**
4. Copia la API Key (guárdala, solo se muestra una vez)

### Paso 3: Registrar tu número de WhatsApp

1. En yCloud, ve a **WhatsApp > Get Started**
2. Haz clic en **Add Phone Number**
3. Sigue los pasos para verificar tu número
4. Tu número quedará en formato: `57XXXXXXXXXX`

### Paso 4: Configurar el Webhook

1. En yCloud, ve a **Developer > Webhooks**
2. Haz clic en **Add Endpoint**
3. Ingresa la URL de tu servidor:
   ```
   https://tu-dominio.com/webhook/whatsapp
   ```
4. Selecciona los eventos:
   - `whatsapp.message.received`
5. Guarda

### Paso 5: Configurar el ChatBot

1. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con tus datos:
   ```
   YCLOUD_API_KEY=tu_api_key_aqui
   YCLOUD_PHONE_NUMBER=57XXXXXXXXXX
   ```

3. Instala dependencias:
   ```bash
   npm install
   ```

4. Inicializa la base de datos:
   ```bash
   npm run seed
   ```

5. Inicia el servidor:
   ```bash
   npm start
   ```

### Paso 6: Exponer tu servidor (para pruebas locales)

**Opción A: ngrok** (recomendado para pruebas)
```bash
# Instala ngrok
npm install -g ngrok

# Abre ngrok en otra terminal
ngrok http 3000

# Copia la URL https://xxxx.ngrok.io y pégala en yCloud webhook
```

**Opción B: Subir a la nube** (para producción)
- Ve a [Railway.app](https://railway.app) o [Render.com](https://render.com)
- Conecta tu repositorio de GitHub
- Agrega las variables de entorno
- ¡Listo! Tendrás una URL pública

## Iniciar el Servidor

```bash
cd ChatBot-What
npm install
npm run seed
npm start
```

El servidor arrancará en `http://localhost:3000`

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/appointments` | Listar citas |
| POST | `/api/appointments` | Crear cita |
| PUT | `/api/appointments/:id/confirm` | Confirmar cita |
| PUT | `/api/appointments/:id/cancel` | Cancelar cita |
| GET | `/api/slots?date=&service_id=` | Horarios disponibles |
| GET | `/api/services` | Listar servicios |
| GET | `/api/clients` | Listar clientes |
| GET | `/api/stats` | Estadísticas |

## Flujo del Chatbot

1. **Saludo** → Menú principal
2. **Agendar cita** → Seleccionar servicio → Seleccionar fecha → Seleccionar hora → Confirmar
3. **Ver citas** → Lista de próximas citas
4. **Cancelar cita** → Seleccionar cita → Confirmar cancelación
5. **Servicios** → Catálogo completo
6. **Info** → Datos del negocio
7. **Hablar con persona** → Transferencia a asesor

## Estructura

```
ChatBot-What/
├── src/
│   ├── server.js          # Servidor principal
│   ├── routes/
│   │   ├── webhook.js     # Webhook de WhatsApp
│   │   └── api.js         # API REST
│   ├── services/
│   │   ├── ycloud.js      # Integración yCloud
│   │   ├── appointments.js # Gestión de citas
│   │   ├── clients.js     # Gestión de clientes
│   │   ├── conversation.js # Estado conversacional
│   │   └── services.js    # Catálogo servicios
│   ├── handlers/
│   │   └── messageHandler.js # Lógica del chatbot
│   ├── database/
│   │   ├── init.js        # Inicialización DB
│   │   ├── seed.js        # Datos iniciales
│   │   └── migrate.js     # Migraciones
│   └── utils/
│       └── logger.js      # Sistema de logs
├── data/                   # Base de datos SQLite
├── logs/                   # Archivos de log
├── .env                    # Variables de entorno
└── package.json
```

## Licencia

Privado - Lopez Tech 2026
