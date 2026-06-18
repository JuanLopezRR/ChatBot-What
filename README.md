# ChatBot WhatsApp - Lopez Tech

Chatbot profesional para WhatsApp enfocado en la gestión de agendas y citas para Lopez Tech.

## Características

- 🤖 Chatbot conversacional con menús interactivos
- 📅 Sistema completo de agendamiento de citas
- 🔧 Catálogo de servicios
- 👥 Gestión de clientes
- 📊 Panel de estadísticas vía API
- 🔗 Integración con yCloud API
- 💾 Persistencia con SQLite

## Requisitos

- Node.js 18+
- Cuenta en [yCloud.com](https://www.ycloud.com)
- API Key de yCloud

## Instalación

```bash
cd ChatBot-What
npm install
```

## Configuración

1. Copia `.env.example` a `.env` y configura tus credenciales:

```bash
cp .env.example .env
```

2. Configura tu API Key de yCloud en el archivo `.env`

3. Inicializa la base de datos:

```bash
npm run seed
```

## Iniciar

```bash
npm start
# o en desarrollo
npm run dev
```

## Webhook de yCloud

Configura el webhook en tu panel de yCloud apuntando a:

```
https://tu-dominio.com/webhook/whatsapp
```

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
