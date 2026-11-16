# SPEC.md — Especificación Técnica y Arquitectura de InSalud

> Documento vivo de contexto técnico y especificaciones del sistema para InSalud (Gran Canaria).

## 🏛️ Arquitectura del Sistema
InSalud es una plataforma de **Civic Tech** con arquitectura Serverless y BaaS (Backend-as-a-Service) utilizando Supabase, maximizando la simplicidad operativa, la privacidad ciudadana y la eficacia real frente a la burocracia sanitaria.

### Filosofía de Implementación
- **Autonomía del Agente:** El agente ejecuta tareas reversibles y seguras sin pedir confirmación, enfocado en completar el trabajo concreto.
- **Privacidad por Diseño (Zero-PII en Identificación Oficial):** InSalud nunca recopila ni almacena DNI, certificados digitales ni credenciales Cl@ve. Para el trámite legal vinculante, InSalud prepara el escrito en local y **redirige** al ciudadano a la Sede Electrónica oficial.
- **Resultados Revisables:** Cambios incrementales verificados con tests unitarios y documentación PBL.

### Capas:
1. **Frontend:** HTML5, CSS3, Vanilla ES6+ (`index.html`, `listado.html`, `admin/index.html`, `js/app.js`, `js/routing-engine.js` [planificado]).
2. **Backend / BaaS:** Supabase (PostgreSQL 15+, Auth, Private Storage, RPC Functions, Edge Functions con Deno).
3. **Seguridad (Defense in Depth):**
   - RLS estricto en todas las tablas (`supabase/migrations/003_security.sql`).
   - Vistas con `security_barrier = true` (`public_complaints`).
   - Funciones RPC `SECURITY DEFINER` para aislar escrituras y aplicar validación robusta en servidor.
   - Storage privado con URLs firmadas con expiración de 60 segundos.

---

## 🗄️ Esquema de Base de Datos Actual
- **`complaints`**: Almacena reclamaciones (`id`, `center`, `category`, `incident_date`, `description`, `email`, `status`, `source`, `telegram_update_id`, `created_at`, `updated_at`).
- **`attachments`**: Metadatos de archivos adjuntos asociados a reclamaciones (CASCADE delete).
- **`profiles`**: Gestión de roles de usuario (`user` vs `admin`) vinculada a `auth.users`.

*(Pendiente en Fase 4 / Migración `004`: campos/tabla para medidas solicitadas, organismo enrutado y seguimiento de plazo legal de 2 meses).*

---

## 🔌 Canales de Entrada y Pipeline de Defensa
1. **Formulario Web (`index.html`):** Envío anónimo mediante función RPC atómica `submit_complaint`.
2. **Bot de Telegram (`supabase/functions/telegram-webhook/`):** Webhook serverless validando token secreto, límites de tamaño y control de duplicados por `telegram_update_id`.
3. **Pipeline de Defensa del Paciente (Fase 4 — En diseño):**
   - **Etapa 1 (Captura Dual):** Hechos + Medidas concretas solicitadas + Indicador de reclamación previa.
   - **Etapa 2 (Motor de Enrutamiento - Gran Canaria):** Clasificación automática según **Decreto 8/2025** hacia:
     - Sede Electrónica Gob. de Canarias — **Trámite `3831`** (Reclamación sanitaria ordinaria, plazo de respuesta 2 meses).
     - Sede Electrónica Gob. de Canarias — **Trámite `3832`** (Disconformidad ante la **ODDUS**, plazo 1 mes tras respuesta insatisfactoria o silencio).
     - Sede Electrónica Gob. de Canarias — **Trámite `1817`** (Responsabilidad Patrimonial por daños).
     - **Asociación El Defensor del Paciente** (`https://www.negligenciasmedicas.com` / `defensorpaciente@telefonica.net`, teléfono `+34 910 55 19 42`, para valoración jurídica y denuncia de negligencias, diagnósticos tardíos o listas de espera graves en Canarias).
     - **Diputado del Común** (`https://www.diputadodelcomun.com`).
   - **Etapa 3 (Paquete Legal Local + Redirección):** Generación del escrito formal en memoria del navegador (sin enviar DNI a Supabase), copia al portapapeles y redirección externa (`rel="noopener noreferrer"`) para autenticación directa con Cl@ve / DNIe / Certificado Digital en la Sede oficial (Ley 39/2015).
   - **Etapa 4 (Seguimiento de Plazos):** Recordatorio a los 60 días para escalar a Disconformidad (`3832`) si hubo silencio o respuesta vacía.

---

## ⚠️ Deuda Técnica Conocida
- **`js/app.js:270`:** `generateFormalDraft()` referencia `document.getElementById('incident_date')` en lugar de `incidentDate` (el `id` real en `index.html:141`), provocando un error al intentar generar el borrador. Prioridad alta en el Incremento 1.

---
*Actualizado incrementalmente en paralelo al desarrollo.*
