# ROADMAP — InSalud (Estrategia Integral)

> Plan táctico y evolutivo de InSalud. Foco inicial: Gran Canaria. Visión: Escalabilidad regional en el archipiélago canario.

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

### Fase 4: UI/UX System & Rediseño Visual (📅 Siguiente Etapa)
- [ ] **Design System unificado:** Variables CSS globales para paleta médica (azul clínico, acentos de alerta), tipografía y espaciados.
- [ ] **Micro-interacciones y Feedback UX:** Estados de carga esqueléticos (*skeletons*), notificaciones *toast* nativas, y validación visual en tiempo real en formularios.
- [ ] **Optimización Mobile-First extrema:** Navegación inferior fija en móviles, accesibilidad táctil (touch targets > 48px).
- [ ] **Cumplimiento WCAG 2.1 AA:** Contraste de colores verificado, navegación por teclado (`tabindex`) y etiquetas ARIA en componentes interactivos.

### Fase 5: Observabilidad, Analítica & Estadísticas Públicas (📅 Futuro)
- [ ] **Dashboard analítico con Chart.js:** Gráficas interactivas de reclamaciones por centro de salud, evolución temporal y categorías más críticas.
- [ ] **Exportación de datos:** Descarga de reportes anónimos en formato CSV y JSON para análisis ciudadano o de medios.
- [ ] **Informes automáticos:** Generación de resúmenes mensuales en PDF para asociaciones de pacientes u organismos oficiales.

### Fase 6: Resiliencia & Anti-Spam (📅 Largo Plazo)
- [ ] **Rate Limiting & Anti-Spam:** Control de peticiones por IP/fingerprint en Edge Functions y Cloudflare.
- [ ] **Verificación Anti-Bots:** Integración opcional de turnstile o CAPTCHA invisible.

---
*Documento vivo mantenido mediante PBL Project Chronicler.*
