# SPEC.md — Especificación Técnica y Arquitectura de InSalud

> Documento vivo de contexto técnico y especificaciones del sistema para InSalud (Gran Canaria).

## 🏛️ Arquitectura del Sistema
InSalud es una plataforma de **Civic Tech** con arquitectura Serverless y BaaS (Backend-as-a-Service) utilizando Supabase, maximizando la velocidad de aprendizaje y simplicidad operativa.

### Filosofía de Implementación
- **Autonomía del Agente:** El agente ejecuta tareas reversibles y seguras sin pedir confirmación, enfocado en completar el trabajo concreto.
- **Resultados Revisables:** El usuario aprueba resultados finales y tangibles.
- **Estilo Directo:** Comunicación clara, enfocada en el proceso y la evidencia técnica.

### Capas:
1. **Frontend:** HTML5, CSS3, Vanilla ES6+ (`index.html`, `listado.html`, `admin/index.html`).
2. **Backend / BaaS:** Supabase (PostgreSQL 15+, Auth, Private Storage, RPC Functions, Edge Functions con Deno).
3. **Seguridad (Defense in Depth):**
   - RLS estricto en todas las tablas.
   - Vistas con `security_barrier = true` (`public_complaints`).
   - Funciones RPC `SECURITY DEFINER` para aislar escrituras y aplicar validación robusta en servidor.
   - Storage privado con URLs firmadas con expiración de 60 segundos.

---

## 🗄️ Esquema de Base de Datos
- **`complaints`**: Almacena reclamaciones (centro, categoría, fecha de incidencia, descripción, estado, email opcional, `telegram_update_id`).
- **`attachments`**: Metadatos de archivos adjuntos asociados a reclamaciones (CASCADE delete).
- **`profiles`**: Gestión de roles de usuario (`user` vs `admin`) vinculada a `auth.users`.

---

## 🔌 Canales de Entrada
1. **Formulario Web (`index.html`):** Envío mediante función RPC atómica `submit_complaint`.
2. **Bot de Telegram (`supabase/functions/telegram-webhook/`):** Webhook serverless validando token secreto, límites de tamaño y control de duplicados por `telegram_update_id`.

---
*Actualizado incrementalmente en paralelo al desarrollo.*
