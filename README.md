# ForexIQ — Deployment Guide (Vercel + Supabase)

## Estructura del proyecto

```
forexiq/
├── api/
│   ├── ai/
│   │   └── chat.js          ← Proxy seguro para Anthropic AI
│   ├── auth/
│   │   ├── register.js      ← Registro de usuarios
│   │   ├── login.js         ← Login de usuarios
│   │   └── admin-login.js   ← Login exclusivo de admins
│   ├── users/
│   │   ├── profile.js       ← Ver perfiles
│   │   └── leaderboard.js   ← Leaderboard de payouts
│   ├── forum/
│   │   └── posts.js         ← CRUD del foro
│   ├── payouts/
│   │   ├── submit.js        ← Solicitar verificación
│   │   └── review.js        ← Admin aprueba/rechaza
│   └── admin/
│       └── ban.js           ← Sistema de bans
├── lib/
│   ├── supabase.js          ← Cliente Supabase (backend)
│   └── auth.js              ← JWT + bcrypt utilities
├── sql/
│   └── schema.sql           ← Schema completo de la BD
├── public/
│   └── ForexIQ.html         ← Tu app frontend (copia aquí el HTML)
├── .env.example             ← Template de variables de entorno
├── vercel.json              ← Configuración de Vercel
└── package.json
```

---

## PASO 1 — Crear cuenta en Supabase

1. Ve a https://supabase.com y crea una cuenta gratuita
2. Haz clic en **"New project"**
3. Ponle nombre: `forexiq`
4. Elige una región (Europe West para España/Europa)
5. Crea una contraseña segura para la base de datos (guárdala)
6. Espera ~2 minutos a que el proyecto se cree

---

## PASO 2 — Configurar la base de datos

1. En tu proyecto Supabase, ve a **SQL Editor** (icono de tabla en el sidebar)
2. Haz clic en **"New query"**
3. Copia y pega todo el contenido de `sql/schema.sql`
4. Haz clic en **"Run"** (botón verde)
5. Deberías ver: `Success. No rows returned`

---

## PASO 3 — Obtener las credenciales de Supabase

1. Ve a **Settings > API** en tu proyecto Supabase
2. Copia estos valores:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_KEY` ⚠️ (nunca la expongas en el frontend)

---

## PASO 4 — Obtener tu API key de Anthropic

1. Ve a https://console.anthropic.com
2. Inicia sesión o crea una cuenta
3. Ve a **API Keys** y crea una nueva key
4. Copia la key → `ANTHROPIC_API_KEY`
5. Añade créditos si no tienes (mínimo $5 es suficiente para empezar)

---

## PASO 5 — Crear cuenta en Vercel

1. Ve a https://vercel.com y crea una cuenta (gratis)
2. Instala la CLI de Vercel:
   ```bash
   npm install -g vercel
   ```

---

## PASO 6 — Preparar el proyecto

```bash
# 1. Entra al directorio del proyecto
cd forexiq

# 2. Copia el .env.example
cp .env.example .env.local

# 3. Edita .env.local con tus credenciales reales
# (abre con cualquier editor de texto)

# 4. Instala dependencias
npm install

# 5. Pon el ForexIQ.html en la carpeta public/
# (copia el archivo HTML que descargaste)
```

---

## PASO 7 — Crear el primer admin en Supabase

Antes de desplegar, crea tu cuenta de admin directamente en la base de datos:

1. Ve a **Supabase > Table Editor > users**
2. O ejecuta este SQL (cambia los valores):

```sql
-- Primero registrate normalmente en la app, luego ejecuta esto:
-- Sustituye 'tu@email.com' por tu email real
UPDATE public.users 
SET is_admin = TRUE, role = 'elite'
WHERE email = 'tu@email.com';
```

---

## PASO 8 — Desplegar en Vercel

```bash
# Desde la carpeta del proyecto:
vercel

# Te hará preguntas:
# - Set up and deploy? → Y
# - Which scope? → tu cuenta personal
# - Link to existing project? → N
# - Project name? → forexiq
# - Directory? → ./ (enter)
# - Override settings? → N
```

Vercel te dará una URL temporal como: `https://forexiq-xxxx.vercel.app`

---

## PASO 9 — Configurar variables de entorno en Vercel

1. Ve a https://vercel.com > tu proyecto **forexiq**
2. Haz clic en **Settings > Environment Variables**
3. Añade cada variable una por una:

| Variable | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | sk-ant-api03-... |
| `SUPABASE_URL` | https://xxx.supabase.co |
| `SUPABASE_ANON_KEY` | eyJhbG... |
| `SUPABASE_SERVICE_KEY` | eyJhbG... (service role) |
| `JWT_SECRET` | cadena-aleatoria-32-chars |
| `ADMIN_SECRET_KEY` | tu-clave-admin-secreta |

4. Haz clic en **Redeploy** para que apliquen las variables

---

## PASO 10 — Actualizar el frontend para usar el backend

En tu `ForexIQ.html`, cambia la función `callAI` para que use tu backend:

```javascript
// REEMPLAZA la función callAI en el HTML por esta:
async function callAI(messages, onDone) {
  const token = localStorage.getItem('forexiq_token')
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messages,
        language: document.getElementById('lang-sel')?.value || 'en'
      })
    })
    const data = await res.json()
    onDone(data.response || 'Error connecting to AI.')
  } catch (e) {
    onDone('Connection error. Please try again.')
  }
}
```

Y el registro/login:

```javascript
// Register
async function doRegister() {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, username, email, password, country })
  })
  const data = await res.json()
  if (data.token) {
    localStorage.setItem('forexiq_token', data.token)
    localStorage.setItem('forexiq_user', JSON.stringify(data.user))
    loginUser(data.user)
  }
}

// Admin login
async function doAdminLogin() {
  const res = await fetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, adminKey })
  })
  const data = await res.json()
  if (data.token) {
    localStorage.setItem('forexiq_token', data.token)
    loginUser(data.user)
  }
}
```

---

## LINKS FINALES

Una vez desplegado, tus links serán:

```
👤 Usuarios:   https://forexiq.vercel.app/
🔐 Admins:     https://forexiq.vercel.app/#admin-login
```

O si compras un dominio propio (recomendado):
```
👤 Usuarios:   https://forexiq.com/
🔐 Admins:     https://forexiq.com/admin
```

---

## DOMINIO PROPIO (opcional)

1. Compra un dominio en Namecheap, GoDaddy, o Cloudflare (~$10-15/año)
2. En Vercel > Settings > Domains > añade tu dominio
3. Sigue las instrucciones para configurar los DNS

---

## COSTOS ESTIMADOS

| Servicio | Plan | Coste |
|----------|------|-------|
| Vercel | Free tier | €0/mes |
| Supabase | Free tier (500MB BD, 50K usuarios) | €0/mes |
| Anthropic API | ~$0.003 por mensaje | ~$5-20/mes según uso |
| Dominio | — | ~€10-15/año |
| **Total mínimo** | | **~€5-20/mes** |

---

## SOPORTE

Si tienes problemas, comparte el error y te ayudo a resolverlo.
