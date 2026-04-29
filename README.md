# Teja Market — Gestión de Producción y Reposición de Stock

PWA Mobile-First para operadores de sala y administradores del supermercado Teja Market.

## Estructura

```
Demanda/
├── backend/    → API Node.js + Express + MySQL
└── frontend/   → Vite + React + TailwindCSS v3
```

## Requisitos

- Node.js ≥ 18
- MySQL ≥ 8
- npm ≥ 9

---

## 1. Base de Datos

Ejecutar el script completo para crear la BD desde cero en MySQL:

```bash
mysql -u root -p < backend/migrations/001_initial_schema.sql
```

---

## 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de MySQL y SMTP
npm install
npm run dev
```

La API estará disponible en `http://localhost:3001`.

**Endpoints principales:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/departamentos` | Lista departamentos |
| GET | `/api/productos?dep_id=22&q=kuchen` | Busca productos |
| GET | `/api/admin/config/:depId` | Lee configuración (días prod/semana, días seguridad) |
| PUT | `/api/admin/config/:depId` | Actualiza configuración de departamento |
| POST | `/api/admin/csv-upload` | Importa maestro CSV |
| GET | `/api/admin/productos/:plu` | Lee producto con overrides |
| PUT | `/api/admin/productos/:plu` | Actualiza overrides de producto |
| GET | `/api/admin/export` | Exporta Excel consolidado |
| POST | `/api/revision` | Inicia revisión |
| POST | `/api/revision/:id/detalle` | Agrega ítem |
| DELETE | `/api/revision/:id/detalle/:plu` | Elimina ítem |
| POST | `/api/revision/:id/finalizar` | Finaliza y envía correo |

---

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acceder en `http://localhost:5173`.

Para construir producción:

```bash
npm run build
```

---

## 4. Formato CSV para importación

El CSV exportado del ERP puede tener **3 o 4 columnas** (con o sin encabezado):

```
# 4 columnas: Cod_Barra ; PLU ; Nombre ; Ventas_Total
7801234567890;1234;Kuchen de Nuez;250.5

# 3 columnas: PLU ; Nombre ; Ventas_Total
1234;Kuchen de Nuez;250.5
```

El campo `dias_historial` se ingresa manualmente en el formulario de carga.

---

## 5. Fórmula de Cálculo — Lotes de Producción Semanales

```
Paso A: Variables Base
  venta_diaria = vta_total_periodo / dias_historial

Paso B: Parámetros Efectivos (override > automático)
  dias_prod_efectivo = pro_dias_produccion_override ?? config.dias_produccion_semana (default: 6)
  dias_seg_efectivo  = pro_dias_seguridad_override  ?? (venta_diaria > 20 ? 1 : 2)

Paso C: Ecuación Final
  lote_produccion_base    = (venta_diaria × 7) / dias_prod_efectivo
  stock_seguridad_calculado = venta_diaria × dias_seg_efectivo
  demanda_total_requerida  = lote_produccion_base + stock_seguridad_calculado
  requerimiento_a_producir = demanda_total_requerida - det_stock_sala

  → Si ≤ 0: no se produce nada
  → Si > 0: Math.ceil() para unidades completas
```

---

## Roles

| Rol | Acceso |
|-----|--------|
| **Operador** | Selecciona departamento → revisa stock → finaliza → se envía correo + Excel |
| **Admin** | Configura días producción/semana → overrides por producto → importa CSV maestro → exporta Excel |

> Sin autenticación en MVP. El rol se elige en la pantalla de inicio.

---

## Despliegue con PM2

```bash
cd /ruta/al/proyecto
npm run build --prefix frontend
pm2 start ecosystem.config.js
```