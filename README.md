# Teja Market — Gestión de Producción y Reposición de Stock

PWA Mobile-First para operadores de sala y administradores del supermercado Teja Market.

## Estructura

```
Demanda/
├── backend/    → API Node.js + Express + PostgreSQL
└── frontend/   → Vite + React + TailwindCSS v3
```

## Requisitos

- Node.js ≥ 18
- PostgreSQL ≥ 14
- npm ≥ 9

---

## 1. Base de Datos

Crear la base de datos en PostgreSQL:

```sql
CREATE DATABASE "Demanda";
```

Ejecutar la migración inicial:

```bash
psql -U postgres -d Demanda -f backend/migrations/001_initial_schema.sql
```

---

## 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL y SMTP
npm install
npm run dev
```

La API estará disponible en `http://localhost:3001`.

**Endpoints principales:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/departamentos` | Lista departamentos |
| GET | `/api/productos?dep_id=22&q=kuchen` | Busca productos |
| GET | `/api/admin/config/:depId` | Lee configuración |
| PUT | `/api/admin/config/:depId` | Actualiza factor y días |
| POST | `/api/admin/csv-upload` | Importa maestro CSV |
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

---

## 4. Formato CSV para importación

El CSV exportado del ERP debe tener **3 columnas** (con o sin encabezado):

```
pro_codigo_plu, pro_nombre_producto, vta_total_periodo
1234, "Kuchen de Nuez", 250.5
5678, "Torta Selva Negra", 180.0
```

El campo `dias_historial` se ingresa manualmente en el formulario de carga.

---

## 5. Fórmula de Cálculo

```
venta_diaria_L_D     = vta_total_periodo / dias_historial
venta_diaria_ajustada = venta_diaria_L_D × factor_ajuste     (default: 1.2857)
stock_seguridad       = venta_diaria_ajustada × dias_seguridad (default: 2)
demanda_primaria      = venta_diaria_ajustada + stock_seguridad
requerimiento         = det_stock_sala - demanda_primaria

Si requerimiento < 0 → QUIEBRE → se produce |requerimiento| (redondeado arriba)
```

---

## Roles

| Rol | Acceso |
|-----|--------|
| **Operador** | Selecciona departamento → revisa stock → finaliza → se envía correo |
| **Admin** | Modifica factor/días por departamento → importa CSV maestro |

> Sin autenticación en MVP. El rol se elige en la pantalla de inicio.

---

## Escalabilidad Futura

El servicio `DemandCalculatorService.js` está diseñado como función pura.
Para implementar la **Matriz de Producción por Día de Semana**, se añade
un `ProductionMatrixService` que ajusta la `venta_diaria` antes del cálculo
sin modificar el motor existente.