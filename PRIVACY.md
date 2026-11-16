# Política de Privacidad y Transparencia de Datos — InSalud

**Última actualización:** 16 de noviembre de 2026

**InSalud** es una iniciativa ciudadana sin ánimo de lucro y de código abierto ([licencia MIT](LICENSE)) orientada a visibilizar incidencias en el Servicio Canario de la Salud (SCS) en Gran Canaria y facilitar la presentación de reclamaciones formales ante los organismos competentes bajo el **Decreto 8/2025** y la **Ley 39/2015**.

> **Aviso de independencia:** InSalud **no** pertenece, **no** está afiliada y **no** representa al Servicio Canario de la Salud (SCS), al Gobierno de Canarias ni a la ODDUS.

---

## 1. Principio Zero-PII: Qué NO guardamos nunca

InSalud está diseñada bajo el principio de **minimización estricta de datos**. En nuestros servidores **nunca** se recopilan, procesan ni almacenan:

- **Documentos de identidad oficial:** Nunca pedimos ni guardamos tu DNI, NIE, pasaporte ni número de tarjeta sanitaria en la base de datos.
- **Credenciales ni certificados digitales:** Nunca solicitamos ni custodiamos claves de **Cl@ve**, DNIe ni certificados electrónicos. La autenticación oficial ocurre exclusivamente cuando tú accedes a la Sede Electrónica del Gobierno de Canarias.
- **Datos del borrador formal (`Nombre y apellidos` y `DNI / NIE` opcionales tras enviar):** Si decides rellenar los campos locales tras enviar tu reclamación para generar el borrador descargable (`.txt`), imprimible o copiable, esa información se procesa **únicamente en la memoria de tu navegador** y **nunca se envía a Supabase ni a ningún servidor**.
- **Identificadores de Telegram en el texto público:** Si usas el bot de Telegram, tu `chat_id` y tu usuario no se guardan en la descripción de la reclamación. Solo se registra el identificador numérico de actualización (`telegram_update_id`) para evitar envíos duplicados si Telegram reintenta la entrega.
- **Cookies de seguimiento ni analítica invasiva:** No utilizamos cookies publicitarias, píxeles de seguimiento (Meta, Google Ads) ni herramientas de analítica de comportamiento (Google Analytics).
- **Datos médicos en registros de error (logs):** Tanto el frontend como las Edge Functions están programados para no imprimir descripciones médicas, correos ni identificadores personales en los registros de errores.

---

## 2. Qué SÍ guardamos, dónde y para qué

Cuando envías una reclamación voluntariamente, únicamente se almacena la información estrictamente necesaria para dar visibilidad estadística al problema y asistir en el seguimiento del plazo legal:

| Dato | Obligatorio | Dónde se guarda | Visibilidad | Finalidad |
| :--- | :---: | :--- | :--- | :--- |
| **Centro / Hospital** (`center`) | Sí | Supabase (`complaints`) | Pública (si se aprueba) | Estadísticas y filtros por centro |
| **Categoría** (`category`) | Sí | Supabase (`complaints`) | Pública (si se aprueba) | Clasificación de incidencias |
| **Fecha del incidente** (`incident_date`) | Sí | Supabase (`complaints`) | Pública (si se aprueba) | Contexto temporal |
| **Descripción de los hechos** (`description`, 20–2000 caracteres) | Sí | Supabase (`complaints`) | Pública (si se aprueba) | Evidencia ciudadana anónima |
| **Medidas concretas solicitadas** (`requested_measures`) | No | Supabase (`complaints`) | Pública (si se aprueba) | Visibilizar qué soluciones exige el paciente |
| **Estado de reclamación previa y daño físico** (`prior_complaint_status`, `has_physical_harm`, `routed_procedure`) | No | Supabase (`complaints`) | Pública (si se aprueba) | Determinar el organismo oficial adecuado |
| **Correo electrónico** (`email`) | No | Supabase (`complaints`) | **Privada (nunca pública)** | Enviar aviso si pasan 60 días sin respuesta (`deadline-reminder`) o contacto sobre tu caso |
| **Archivos adjuntos** (máx. 3 archivos, 5 MiB c/u, 10 MiB total; JPG, PNG, GIF, WebP, PDF, DOC, DOCX) | No | Bucket privado `complaint-attachments` en Supabase Storage | **Privada (nunca pública)** | Verificación interna en moderación mediante URLs firmadas de 60 segundos |
| **Identificador técnico** (`id` UUID v4, `source`, `status`, `created_at`, `official_deadline_at`) | Automático | Supabase (`complaints`) | Parcial (`status`, `source`, `created_at`) | Evitar duplicados, moderación y cálculo del plazo legal de 60 días |

### Responsabilidad sobre el contenido libre y adjuntos
Antes de enviar, el formulario solicita confirmación expresa para **eliminar cualquier dato personal** (nombres propios, teléfonos, direcciones, números de historia clínica) tanto del texto descriptivo como de las imágenes o documentos adjuntos.

---

## 3. Visibilidad pública y moderación

- Todas las reclamaciones entran inicialmente con estado **`pending`** (pendiente) y **no son visibles públicamente**.
- Un equipo de moderación revisa las reclamaciones antes de cambiar su estado a **`published`**.
- El listado público (`listado.html`) consulta exclusivamente la vista PostgreSQL `public_complaints` (`security_barrier = true`), que **solo devuelve reclamaciones publicadas** y **excluye** el campo `email`, `telegram_update_id` y los metadatos de envío de recordatorios.
- Los archivos adjuntos **nunca** se muestran en el listado público.

---

## 4. Servicios de terceros y enlaces externos

Para operar sin coste y de forma transparente, InSalud se apoya en los siguientes proveedores técnicos:

1. **Vercel:** Alojamiento web estático del frontend. Como cualquier servidor web, procesa la dirección IP y cabeceras HTTP estándar para servir la página.
2. **Supabase:** Base de datos PostgreSQL, almacenamiento privado de archivos y Edge Functions.
3. **Resend** *(cuando el recordatorio a 60 días está activo con dominio verificado)*: Envío puntual del correo recordatorio de plazo de 2 meses si facilitaste tu email.
4. **Telegram** *(opcional)*: Solo si eliges enviar tu experiencia a través del bot de Telegram, sujeto además a la política de privacidad de Telegram.
5. **CDNs públicos de librerías:** La web carga `@supabase/supabase-js` desde `unpkg.com` y `Chart.js` (solo en `listado.html`) desde `cdn.jsdelivr.net`, lo que implica una petición HTTP estándar de tu navegador a dichos CDNs.
6. **Enlaces a organismos oficiales:** Al pulsar los botones de redirección hacia la **Sede Electrónica del Gobierno de Canarias** (`sede.gobiernodecanarias.org`), **Diputado del Común** (`diputadodelcomun.com`) o **Asociación El Defensor del Paciente** (`negligenciasmedicas.com`), abandonas InSalud y pasas a estar sujeto a las políticas de privacidad de cada entidad.

---

## 5. Medidas técnicas de seguridad

- **Row Level Security (RLS):** Políticas estrictas en PostgreSQL que impiden a usuarios anónimos leer la tabla `complaints` o los adjuntos directamente.
- **Función RPC `submit_complaint` (`SECURITY DEFINER`):** Valida longitudes, formatos de fecha, tipos MIME permitidos y tamaño real de archivos en el servidor antes de registrar la reclamación.
- **Almacenamiento privado:** El bucket `complaint-attachments` es privado; el panel de administración solo accede mediante URLs firmadas que caducan a los **60 segundos**.
- **Protección anti-bots:** Campo trampa (`honeypot`) oculto y limitación de frecuencia en cliente sin recurrir a captchas intrusivos.

---

## 6. Conservación y derechos del usuario (RGPD / LOPDGDD)

Tienes derecho a solicitar el **acceso, rectificación o supresión** de cualquier información que hayas enviado (incluido tu correo opcional y tus archivos adjuntos, cuya eliminación en `complaints` borra en cascada los registros asociados en `attachments`).

- **Cómo ejercer tus derechos o solicitar la retirada de una reclamación:** Puedes abrir una incidencia o contactar a través del repositorio oficial del proyecto en [github.com/D4vRAM369/InSalud](https://github.com/D4vRAM369/InSalud) indicando la fecha aproximada, el centro y un fragmento del texto (nunca compartas tu DNI ni datos sensibles en un issue público) o contactar con el responsable de la instancia desplegada.
- *(Nota para despliegues propios / forks)*: Si despliegas tu propia instancia de InSalud, actualiza esta sección con el correo de contacto del responsable de tu instancia.
