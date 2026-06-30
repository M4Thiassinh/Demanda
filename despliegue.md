# Guía de Reactivación del Servidor — Teja Market

Esta guía contiene los pasos necesarios para volver a levantar la aplicación si el servidor físico se apaga o se reinicia. Dado que el frontend está alojado en **Vercel** y configurado con tu dominio estático de **Ngrok**, solo necesitas iniciar los servicios locales en este servidor.

---

## Paso 1: Iniciar la Base de Datos (MySQL)

Al reiniciarse el servidor, es posible que el servicio de base de datos MySQL esté detenido.

1. Abre el menú de inicio en Windows, escribe **Servicios** y abre la aplicación.
2. Busca el servicio llamado **`MySQL80`** (o similar, por ejemplo `MySQL`).
3. Si en la columna *Estado* no dice *En ejecución*, haz clic derecho sobre el servicio y selecciona **Iniciar**.

*También puedes iniciarlo desde una consola de PowerShell (como Administrador) con el comando:*
```powershell
Start-Service -Name MySQL*
```

---

## Paso 2: Iniciar el Backend con PM2

PM2 se encarga de ejecutar el backend de Node.js en segundo plano de manera persistente.

1. Abre una consola de **PowerShell** o CMD.
2. Dirígete a la carpeta del proyecto:
   ```powershell
   cd C:\Users\matyr\Desktop\Demanda
   ```
3. Inicia el backend usando el archivo de configuración:
   ```powershell
   pm2 start ecosystem.config.js
   ```
4. Puedes verificar que esté corriendo correctamente y revisar los logs con:
   ```powershell
   pm2 status
   pm2 logs teja-market
   ```

---

## Paso 3: Iniciar el Túnel de Ngrok

Para que el frontend en Vercel pueda comunicarse con este servidor, debes abrir el túnel de Ngrok en el puerto `3001` usando tu dominio estático gratuito.

1. Abre **otra ventana de PowerShell** (no cierres la de PM2).
2. Ejecuta el comando de Ngrok reemplazando con tu dominio estático (puedes consultar tu [ngrok_guide.md](file:///c:/Users/matyr/Desktop/Demanda/ngrok_guide.md) para ver cuál es):
   ```powershell
   ngrok http --domain=overstate-economic-renewable.ngrok-free.dev 3001
   ```
3. ⚠️ **IMPORTANTE:** Deja esta consola de Ngrok **abierta**. Si la cierras, el túnel se caerá y los usuarios no podrán usar la aplicación.
