# ROADMAP — InSalud (Estrategia Integral)

> Plan táctico y evolutivo de InSalud. Foco inicial: Gran Canaria. Visión: Que ninguna reclamación sanitaria acabe en un cajón ni despachada con un "gracias y lo sentimos mucho", convirtiendo cada queja en evidencia pública y trámite oficial efectivo.

---

## 🗺️ Fases del Proyecto

### Fase 1: MVP Core & Seguridad RLS (✅ Completado)
- [x] Estructura HTML/CSS mobile-first con temática médica.
- [x] Base de datos Supabase con RLS estricto y vistas de seguridad (`public_complaints`).
- [x] Función RPC atómica `submit_complaint` con validación server-side robusta.
- [x] Listado público filtrable por centro de salud y categoría.

### Fase 2: Canales Alternativos & Bot de Telegram (🔄 En curso)
- [x] Arquitectura de Edge Function en Deno/TypeScript (`supabase/functions/telegram-webhook/`).
- [ ] Configuración del bot en Telegram (`@BotFather`).
- [ ] Despliegue de funciones y registro del webhook con token secreto.
- [ ] Idempotencia asegurada mediante `telegram_update_id`.

### Fase 3: Panel de Administración & Moderación (🔄 En curso)
- [x] Autenticación de administradores vía Supabase Auth y RBAC (`profiles`).
- [x] Dashboard con contadores en tiempo real y paginación de 500 registros.
- [x] Acciones de moderación (publicar, rechazar, despublicar, eliminar con cascada en Storage).
- [x] URLs firmadas temporales (60s) para acceso seguro a adjuntos privados.
- [ ] Sistema de alertas por correo electrónico ante nuevas reclamaciones pendientes.

### Fase 4: Pipeline de Defensa del Paciente & Enrutamiento Institucional (🔥 Prioridad Actual)
> Objetivo: Pasar de un mero tablón de quejas a un asistente legal y de presión institucional en Gran Canaria bajo el **Decreto 8/2025** y la **Ley 39/2015**, sin recopilar nunca credenciales ni DNI en InSalud.

- [x] **Incremento 1 — Corrección, Solicitud de Medidas y Enrutamiento (Frontend):**
  - [x] Corregir bug en `js/app.js` (`incident_date` -> `incidentDate` en `generateFormalDraft()`).
  - [x] Añadir al formulario bloque de **Medidas Concretas Solicitadas** (expediente informativo, cambio de especialista, cita urgente, respuesta motivada) y pregunta de **Reclamación previa / Disconformidad**.
  - [x] Crear motor puro `js/routing-engine.js` con tests unitarios (`tests/routing.test.cjs`) para enrutar automáticamente a:
    - **SCS / ODDUS — Reclamación ordinaria** (Sede Electrónica Trámite `3831`, plazo 2 meses).
    - **ODDUS — Escrito de Disconformidad** (Sede Electrónica Trámite `3832`, plazo 1 mes desde respuesta insatisfactoria o silencio).
    - **SCS — Responsabilidad Patrimonial** (Sede Electrónica Trámite `1817`).
    - **Asociación El Defensor del Paciente** (`negligenciasmedicas.com` / `defensorpaciente@telefonica.net`, para negligencias médicas, secuelas o listas de espera graves).
    - **Diputado del Común** (`diputadodelcomun.com`).
  - [x] Generador local de **Escrito Formal Blindado** (en memoria del navegador, sin subir DNI a Supabase) + botón **Copiar para Sede Electrónica** + **Redirección externa segura** para que el paciente firme con **Cl@ve, DNIe o Certificado Digital** directamente en la web oficial.
- [x] **Incremento 2 — Seguimiento de Plazos (2 meses) & Notificaciones (Backend):**
  - [x] Migración SQL (`supabase/migrations/004_pipeline_tracking.sql`) para registrar medidas solicitadas, organismo destino sugerido, plazo legal a 60 días y estado de respuesta (`pending`, `resolved`, `empty_response`, `silence_2m`, `escalated_oddus`).
  - [x] Edge Function (`supabase/functions/deadline-reminder/index.ts`) de recordatorio a los **60 días (2 meses)** para activar en 1 clic el **Escrito de Disconformidad (Trámite 3832)** si hubo silencio o respuesta tipo *"lo sentimos mucho"* (pendiente de despliegue en Supabase y cron).
- [ ] **Incremento 3 — Accesibilidad por Voz (Opcional / Inclusivo):**
  - [ ] Botón "Escuchar en voz alta" con formateador de lenguaje natural (`formatForSpeech`) usando Web Speech API local (zero-PII) para pacientes mayores o con dificultades visuales.

### Fase 5: UI/UX System & Rediseño Visual (📅 Siguiente Etapa)
- [ ] **Design System unificado:** Variables CSS globales para paleta médica (azul clínico, acentos de alerta), tipografía y espaciados.
- [ ] **Micro-interacciones y Feedback UX:** Estados de carga esqueléticos (*skeletons*), notificaciones *toast* nativas, y validación visual en tiempo real en formularios.
- [ ] **Optimización Mobile-First extrema:** Navegación inferior fija en móviles, accesibilidad táctil (touch targets > 48px).
- [ ] **Cumplimiento WCAG 2.1 AA:** Contraste de colores verificado, navegación por teclado (`tabindex`) y etiquetas ARIA en componentes interactivos.

### Fase 6: Observabilidad, Analítica & Rendición de Cuentas (📅 Futuro)
- [ ] **Dashboard analítico con Chart.js:** Gráficas interactivas de reclamaciones por centro de salud, evolución temporal y **tasa de respuestas vacías / silencio administrativo por centro**.
- [ ] **Exportación de datos:** Descarga de reportes anónimos en formato CSV y JSON para análisis ciudadano, asociaciones o medios.
- [ ] **Informes automáticos:** Generación de resúmenes mensuales en PDF para asociaciones de pacientes u organismos oficiales.

### Fase 7: Resiliencia & Anti-Spam (📅 Largo Plazo)
- [ ] **Rate Limiting & Anti-Spam:** Control de peticiones por IP/fingerprint en Edge Functions y Cloudflare.
- [ ] **Verificación Anti-Bots:** Integración opcional de Turnstile o CAPTCHA invisible.

---
*Documento vivo mantenido mediante PBL Project Chronicler.*
