# Guía: Ngrok con URL Estática Gratis (Sin Dominio Propio)

Ngrok es la mejor alternativa cuando no tienes un dominio propio y usas el subdominio gratuito de Vercel. Recientemente, Ngrok empezó a regalar **1 Dominio Estático Gratis** por cuenta, lo que significa que tu URL nunca cambiará y podrás usarla permanentemente en el servidor de tu empresa.

---

## Parte 1: Crear la cuenta y obtener tu Dominio Estático

1. Entra a [ngrok.com](https://dashboard.ngrok.com/signup) y crea una cuenta gratuita.
2. Una vez dentro del panel principal (Dashboard), verás un menú a la izquierda.
3. Ve a **Cloud Edge > Domains**.
4. Verás un botón azul que dice **"Create Domain"** o "Claim free static domain". Haz clic ahí.
5. Ngrok te asignará un dominio estático al azar (por ejemplo: `toucan-top-locally.ngrok-free.app`). **Guarda esta URL**, es la que usarás de forma permanente.

---

## Parte 2: Conectar tu PC o Servidor a Ngrok

Ya dejé Ngrok instalado en tu PC, por lo que puedes saltarte el paso de descarga. Solo necesitas vincular tu cuenta.

1. En el panel de Ngrok, ve a **Getting Started > Your Authtoken**.
2. Copia el comando que empieza con `ngrok config add-authtoken...` (tiene un código largo).
3. Abre una nueva ventana de **PowerShell** en tu PC (o en el servidor de la empresa) y pega el comando. Esto vincula tu computadora con tu cuenta de Ngrok.
4. Ahora, para iniciar el túnel y conectar tu backend al dominio estático que reclamaste en el Paso 1, ejecuta:
   ```powershell
   ngrok http --domain=TU_DOMINIO_ESTATICO.ngrok-free.app 3001
   ```
   *(Asegúrate de reemplazar `TU_DOMINIO_ESTATICO` con el que te dio Ngrok y verificar que `3001` sea el puerto correcto de tu backend).*

Verás una pantalla verde en la consola indicando que el túnel está activo. **Recuerda que debes dejar esta consola abierta para que el túnel funcione.**

---

## Parte 3: Conectarlo con Vercel

Como la URL que te dio Ngrok es **permanente**, solo tienes que ponerla en Vercel una vez y olvidarte del asunto.

1. Ve a tu proyecto en **Vercel > Settings > Environment Variables**.
2. Busca tu variable de entorno del backend (por ejemplo, `VITE_API_URL` o `REACT_APP_API_URL`).
3. Pon como valor la URL completa de tu dominio estático de Ngrok:
   `https://TU_DOMINIO_ESTATICO.ngrok-free.app/api` (o similar, según como esté estructurada tu app).
4. Dale a guardar y **haz un nuevo Deploy (Redeploy)** en Vercel para que tu frontend comience a comunicarse con esa URL.

> [!TIP]
> **Para el Servidor de la Empresa 24/7:**
> Simplemente repites la **Parte 2** en el computador de la empresa. Descargas Ngrok, pones tu Authtoken, y ejecutas el mismo comando `--domain=... 3001`. Vercel no se enterará del cambio, porque la URL de Ngrok seguirá siendo exactamente la misma.
