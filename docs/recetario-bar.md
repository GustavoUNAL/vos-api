# Recetario — Bar (Michelada, cócteles, shots)

Referencia de costeo (COP) alineada con `scripts/seed-bar-cocteles-shots-recipes.ts`.

Para aplicar en la base (tras productos en CSV, p. ej. `npm run db:sync-products`):

```bash
npm run db:seed-bar-cocteles-shots-recipes
```

El script **deduplica por `productName`**: si en `seed-bar-cocteles-shots-recipes.ts` hubiera el mismo producto dos veces, solo cuenta la **primera** definición (así podés pegar el recetario entero sin riesgo de duplicar filas en BD).

O todo el menú: `npm run db:seed-menu-recipes`.

Los nombres de **producto** deben coincidir con `prisma/data/lista-productos.csv` (ej. `Whisky en las rocas`, no el texto “premium” del recetario).

---

## Cerveza Michelada

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Cerveza | 330 ml | — | $3.500 |
| Limón | 30 ml | — | $400 |
| Sal / picante | 1 porción | — | $100 |
| **Subtotal producto** | | | **$4.000** |
| Administración (30%) | — | — | $1.200 |
| **TOTAL COSTO** | | | **$5.200** |

---

## Cócteles — Jarra de hervidos (1 L)

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Fruta cítrica | 300 g | — | $5.000 |
| Licor artesanal (cóctel) | 213 ml | $17/ml | $3.621 |
| Azúcar | 80 g | — | $800 |
| Agua (Indirecto) | 1000 ml | — | $700 |
| Energía (Indirecto) | — | — | $500 |
| **Subtotal producto** | | | **$10.621** |
| Administración (30%) | — | — | $3.186 |
| **TOTAL COSTO** | | | **$13.807** |

---

## Cóctel arándano

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Ginebra (cóctel) | 2 oz | $3.000/oz | $6.000 |
| Sirope arándano | — | — | $1.500 |
| Hielo | — | — | $200 |
| Energía (Indirecto) | — | — | $300 |
| **Subtotal producto** | | | **$8.000** |
| Administración (30%) | — | — | $2.400 |
| **TOTAL COSTO** | | | **$10.400** |

---

## Margarita

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Tequila (cóctel) | 2 oz | $3.000/oz | $6.000 |
| Limón | — | — | $400 |
| Sirope | — | — | $600 |
| Sal | — | — | $100 |
| Hielo | — | — | $200 |
| Energía (Indirecto) | — | — | $300 |
| **Subtotal producto** | | | **$7.600** |
| Administración (30%) | — | — | $2.280 |
| **TOTAL COSTO** | | | **$9.880** |

---

## Piña colada

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Ron (cóctel) | 2 oz | $2.200/oz | $4.400 |
| Crema de coco | — | — | $2.000 |
| Piña | — | — | $1.500 |
| Hielo | — | — | $200 |
| Energía (Indirecto) | — | — | $300 |
| **Subtotal producto** | | | **$8.400** |
| Administración (30%) | — | — | $2.520 |
| **TOTAL COSTO** | | | **$10.920** |

---

## Negroni

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Ginebra (cóctel) | 2 oz | $3.000/oz | $6.000 |
| Campari | — | — | $3.000 |
| Naranja | — | — | $300 |
| Hielo | — | — | $200 |
| **Subtotal producto** | | | **$9.500** |
| Administración (30%) | — | — | $2.850 |
| **TOTAL COSTO** | | | **$12.350** |

---

## Moscow mule

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Vodka (cóctel) | 2 oz | $2.200/oz | $4.400 |
| Ginger beer | — | — | $2.000 |
| Limón | — | — | $300 |
| Hielo | — | — | $200 |
| **Subtotal producto** | | | **$6.900** |
| Administración (30%) | — | — | $2.070 |
| **TOTAL COSTO** | | | **$8.970** |

---

## Gin Tonic

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Ginebra (cóctel) | 2 oz | $3.000/oz | $6.000 |
| Tónica | — | — | $1.500 |
| Limón | — | — | $300 |
| Hielo | — | — | $200 |
| **Subtotal producto** | | | **$8.000** |
| Administración (30%) | — | — | $2.400 |
| **TOTAL COSTO** | | | **$10.400** |

---

## Whisky en las rocas (premium)

En menú / CSV: **Whisky en las rocas** (`cocteles`).

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Whisky Old Parr | 2 oz | $6.800/oz | $13.600 |
| Hielo | — | — | $200 |
| **Subtotal producto** | | | **$13.800** |
| Administración (30%) | — | — | $4.140 |
| **TOTAL COSTO** | | | **$17.940** |

---

## Shots (licor real)

### Shot Vodka (Smirnoff Tamarindo)

Producto en menú: **Shot Vodka**.

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Vodka Smirnoff Tamarindo | 1 oz | $2.600 | $2.600 |
| Limón / sal | — | — | $300 |
| **Subtotal producto** | | | **$2.900** |
| Administración (30%) | — | — | $870 |
| **TOTAL COSTO** | | | **$3.770** |

### Shot Tequila (Olmeca)

Producto: **Shot Tequila**.

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Tequila Olmeca | 1 oz | $4.400 | $4.400 |
| Limón / sal | — | — | $300 |
| **Subtotal producto** | | | **$4.700** |
| Administración (30%) | — | — | $1.410 |
| **TOTAL COSTO** | | | **$6.110** |

### Shot Aguardiente (Nariño / Amarillo)

Producto: **Shot Aguardiente**.

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Aguardiente Nariño / Amarillo | 1 oz | $2.600 | $2.600 |
| Limón / sal | — | — | $300 |
| **Subtotal producto** | | | **$2.900** |
| Administración (30%) | — | — | $870 |
| **TOTAL COSTO** | | | **$3.770** |

### Shot Ginebra (Gordon’s)

Producto: **Shot Ginebra**.

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Ginebra Gordon’s | 1 oz | $3.800 | $3.800 |
| Limón / aceituna | — | — | $300 |
| **Subtotal producto** | | | **$4.100** |
| Administración (30%) | — | — | $1.230 |
| **TOTAL COSTO** | | | **$5.330** |

### Shot Whisky (Old Parr)

Producto: **Shot Whisky**.

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Whisky Old Parr | 1 oz | $6.800 | $6.800 |
| Limón | — | — | $300 |
| **Subtotal producto** | | | **$7.100** |
| Administración (30%) | — | — | $2.130 |
| **TOTAL COSTO** | | | **$9.230** |

---

## Nota técnica

Igual que en cafetería: la línea **Administración (30%)** del seed se **recalcula** en `seedRecipeSpecs` (30 % sobre la base definida en código). Los totales de esta hoja son la referencia de negocio; la API puede mostrar cifras ligeramente distintas si la regla de base no incluye todas las líneas fijas.
