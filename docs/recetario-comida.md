# Recetario — Comida

Referencia de costeo (COP) alineada con `scripts/seed-comida-recipes.ts`.

Para aplicar en la base (tras productos en CSV):

```bash
npm run db:sync-products
npm run db:seed-comida-recipes
```

O: `npm run db:seed-menu-recipes`.

Los **`productName`** deben coincidir con la columna **Nombre** de `prisma/data/lista-productos.csv`.

---

## Tostadas

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Tostada integral | 1 und | $400 | $400 |
| Mantequilla / mermelada | — | — | $400 |
| **Subtotal producto** | | | **$800** |
| Administración (30%) | — | — | $240 |
| **TOTAL COSTO** | | | **$1.040** |

---

## Hot Dog

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Pan suave | 1 und | — | $800 |
| Salchicha premium | 1 und | — | $2.500 |
| Queso | — | — | $800 |
| Papa triturada | — | — | $500 |
| Salsas | — | — | $300 |
| Jalapeños | — | — | $300 |
| **Subtotal producto** | | | **$5.200** |
| Administración (30%) | — | — | $1.560 |
| **TOTAL COSTO** | | | **$6.760** |

---

## Hot Dog en combo

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|---------------|
| Hot Dog base | 1 und | — | $5.200 |
| Gaseosa (vaso) | — | — | $1.000 |
| Papas chips | — | — | $1.500 |
| **Subtotal producto** | | | **$7.700** |
| Administración (30%) | — | — | $2.310 |
| **TOTAL COSTO** | | | **$10.010** |

---

## Productos en menú sin receta en este seed

En el CSV también figuran **Empanadas** y **Porción de galletas**; aún no tienen bloque en `seed-comida-recipes.ts`. Cuando tengas la hoja de costos, se pueden añadir igual que las anteriores.

---

## Nota técnica

La fila **Administración (30%)** del array en el seed **no se persiste tal cual**: se recalcula en `seedRecipeSpecs` (ver `scripts/lib/sheet-recipe-seed.ts`). Los totales de esta página son referencia de negocio; la API puede mostrar valores distintos si la regla de base no coincide con el subtotal manual.
