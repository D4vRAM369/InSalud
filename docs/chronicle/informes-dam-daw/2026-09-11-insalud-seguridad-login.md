# Login, privacidad y bot InSalud

> Informe DAM/DAW generado el 2026-09-11. Objetivo: explicar esta tarea a alguien que sabe programar algo, por ejemplo Python, pero no domina Android/Kotlin de memoria.

## 1. Resumen para situarse

- Que se ha construido: TODO
- Donde esta en el codigo: TODO
- Por que era necesario: TODO
- Estado final: TODO

## 2. Que problema resolvia esta tarea

El problema era que el sistema no tenía un canal alternativo para que los usuarios reportaran reclamaciones, lo que limitaba su alcance y accesibilidad. El bot de Telegram permitirá a los usuarios enviar reclamaciones de manera más rápida y sin necesidad de acceder al formulario web.

## 3. Archivos principales

- `supabase/functions/telegram-webhook/index.ts`: Contiene la lógica del bot de Telegram y la integración con Supabase. - `docs/06_SIGUIENTE_NIVEL.markdown`: Documenta las mejoras futuras, incluyendo el bot de Telegram.

- `ruta/al/archivo.kt`: TODO
- `docs/...`: TODO

## 4. Paso a paso de implementacion

1. 1. Crear el bot de Telegram con @BotFather y obtener el token.
2. 2. Implementar la Edge Function en Supabase para procesar los mensajes del bot.
3. 3. Validar el flujo de mensajes y asegurarse de que se integren con el RPC de `submit_complaint`.

Explica el orden. Un estudiante debe entender por que se hizo primero una cosa y luego otra.

## 5. Conceptos que hay que entender

- **Edge Functions**: Funciones que se ejecutan en el borde de la red, cerca del usuario, para procesar solicitudes de manera más rápida y eficiente. - **Telegram Bot API**: API de Telegram para crear bots y recibir mensajes.

## 6. Comparacion mental con Python

```python
# Ejemplo mental: Un servidor web simple que recibe mensajes y los procesa
from flask import Flask, request

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_message():
    message = request.json
    # Procesar el mensaje y guardarlo en una base de datos
    save_to_database(message)
    return 'OK'
```

```python
# Ejemplo mental, no codigo real del proyecto.
```

## 7. Decisiones tecnicas tomadas

- **Decisión**: Usar Edge Functions en Supabase para procesar los mensajes del bot. - **Por qué**: Permite una integración más rápida y eficiente con la base de datos. - **Alternativa rechazada**: Usar un servidor externo, lo que complicaría la integración y aumentaría la latencia.

- Decision: TODO
- Por que: TODO
- Alternativa rechazada: TODO

## 8. Pruebas y verificacion

```bash
# Crear el bot de Telegram con @BotFather
# Implementar la Edge Function en Supabase
# Probar el flujo de mensajes
```
Resultado: El bot de Telegram está funcionando y se está integrando correctamente con el sistema de reclamaciones.

```bash
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew assembleDev
adb install -r app/build/outputs/apk/dev/app-dev.apk
```

Resultado: TODO

## 9. Errores, riesgos o limites

El bot de Telegram está implementado, pero aún no se ha probado con usuarios reales. También falta implementar la gestión de archivos adjuntos y mejorar la validación de mensajes.

## 10. Que queda despues de esto

La siguiente tarea natural es implementar el panel de administración para que los moderadores puedan gestionar las reclamaciones. Esto es necesario para mantener la calidad y relevancia de las reclamaciones publicadas.

## 11. Mapa rapido

```text
```text
Usuario -> Bot de Telegram -> Edge Function -> Base de Datos -> Panel de Administración -> Moderador
```
```
