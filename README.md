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

Ejecutar el script completo para crear la BD desde cero en MySQL y luego aplicar las migraciones en orden:

```bash
mysql -u root -p < backend/migrations/001_initial_schema.sql
# ...aplicar 002 a 007 en orden...
mysql -u root -p demanda_db < backend/migrations/008_infaltables_y_categorias.sql
```

La migración **008** agrega los perfiles **Producción** e **Infaltables**:
`productos.pro_categoria` (normal/especial), `productos.pro_jornada` (am/pm/ambos),
tablas `infaltables_config`, `chequeo_infaltables`, `chequeo_infaltables_detalle`
y la vista `v_stock_externo`.

> **Stock externo (cross-DB):** la vista `v_stock_externo` lee el stock real desde
> `db_analitica_supermercado.fact_stock_diario` cruzando `id_producto` (analítica) con
> `pro_codigo_plu` (app). El usuario MySQL de la app necesita permiso **`SELECT`** sobre
> esa base. Si no existe, el chequeo de infaltables funciona igual (la columna de stock
> de referencia aparece como `s/d`).

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

**Variables de entorno relevantes** (ver `.env.example`):

| Variable | Uso |
|----------|-----|
| `DB_*` / `SMTP_*` | Conexión MySQL y correo saliente |
| `ADMIN_PASSWORD` / `MASTER_PASSWORD` | Claves del panel Admin / Maestro (obligatorias, *fail-closed*) |
| `CORS_ORIGINS` | Orígenes permitidos (coma). Vacío = cualquiera (LAN) |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | Validación de certificado TLS del SMTP (default `true`) |

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
| **Producción** | | |
| GET | `/api/produccion/productos?dep_id=22` | Lista productos para clasificar (con vta diaria) |
| POST | `/api/produccion/clasificar/bulk` | Guarda categoría normal/especial (lote) |
| GET | `/api/produccion/pendientes?dep_id=22` | Productos sin clasificar |
| **Infaltables** | | |
| GET | `/api/infaltables/turno-actual` | Turno AM/PM según hora de Santiago (corte 12:00) |
| GET | `/api/infaltables/jornada?dep_id=22` | Productos normales para asignar AM/PM/Ambos |
| POST | `/api/infaltables/jornada/bulk` | Guarda jornada (lote) |
| GET | `/api/infaltables/checklist?dep_id=22&turno=am` | Checklist del turno + stock de referencia |
| POST | `/api/infaltables/chequeo` | Guarda chequeo en historial y envía correo |
| GET | `/api/infaltables/dashboard` | Índice real (último chequeo) vs meta por depto |
| GET | `/api/infaltables/config?dep_id=22` | Lee meta % y correos destino |
| PUT | `/api/infaltables/config/:depId` | Actualiza meta % y correos destino |

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

## 6. Perfiles Producción e Infaltables

Dos perfiles trabajan sobre dos clasificaciones independientes de cada producto:

- **Categoría** (`pro_categoria`): `normal` = infaltable (≈80% de la venta) · `especial` = cola larga (≈20%) · `sin_clasificar` (default).
- **Jornada** (`pro_jornada`): `am` · `pm` · `ambos` (= no puede faltar nunca, default).

### 🏭 Producción — clasificar normal/especial
Lista los productos del departamento ordenados por venta diaria (como guía) y permite
marcar cada uno **Normal** o **Especial**. Avisa cuántos quedan **sin clasificar**.
Los importadores CSV/bulk **no pisan** estas columnas, así que la clasificación persiste.

### 🎯 Infaltables — chequeo de quiebres
1. **Asignar jornada**: a los productos *normales*, se les asigna AM / PM / Ambos.
2. **Chequeo**: la app detecta el turno por la hora de Chile (**America/Santiago**, corte a las
   **12:00**; se puede forzar AM/PM). Muestra solo los normales de ese turno (jornada = turno o `ambos`)
   con el **stock de referencia** del sistema. El responsable marca *Está / Falta*.
3. Al finalizar se calcula el **índice de faltantes** (`faltantes / total`), se guarda en el
   historial y se **envía siempre un correo** (HTML + Excel) a los correos configurados.
   El correo incluye el **gráfico de barras Real vs Meta por departamento** (default 15%),
   para el análisis del jefe.
4. **Config**: meta % y correos destino por departamento.

> El responsable solo marca presente/ausente; el gráfico comparativo no se muestra en la
> app, llega en el correo. El endpoint `GET /api/infaltables/dashboard` alimenta ese gráfico.

---

## Roles

| Rol | Acceso |
|-----|--------|
| **Operador** | Selecciona departamento → revisa stock → finaliza → se envía correo + Excel |
| **Producción** | Clasifica productos normal/especial por departamento |
| **Infaltables** | Asigna jornada AM/PM/Ambos → chequea quiebres por turno → correo + dashboard |
| **Admin** | Configura días producción/semana → overrides por producto → importa CSV maestro → exporta Excel |

> **Autenticación:** Operador, Producción e Infaltables son de acceso abierto (se elige el
> perfil en la pantalla de inicio). **Admin** y el **Panel Maestro** requieren contraseña
> (`ADMIN_PASSWORD` / `MASTER_PASSWORD` en `.env`); el acceso es *fail-closed* (si falta la
> variable, el panel queda bloqueado, no abierto).

---

## Despliegue con PM2

```bash
cd /ruta/al/proyecto
npm run build --prefix frontend
pm2 start ecosystem.config.js
```