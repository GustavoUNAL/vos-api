# Recetario — Cafetería (costeo COP)

Referencia de negocio alineada con `scripts/seed-cafeteria-recipes.ts`. Para volcar estas recetas a la base:

```bash
npm run db:seed-cafeteria-recipes
```

(Requiere que existan los productos en menú, p. ej. tras `npm run db:sync-products` desde `prisma/data/lista-productos.csv`.)

---

## Parámetros base

| Concepto | Valor |
|----------|--------|
| 1 ml agua | $27 |
| 100 ml agua | $0,27 |
| 1 litro agua | $2.700 |
| Consumo | ~0,1 kWh / litro |
| Costo kWh | $1.000 |
| Jarra (15 min) | $500 |

---

## Café negro artesanal

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café molido | 15 g | $81,5/g | $1.222 |
| Agua (Indirecto) | 180 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$2.122** |
| Administración (30%) | — | — | $637 |
| **TOTAL COSTO** | | | **$2.759** |

---

## Café aromatizado

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café molido | 15 g | $81,5/g | $1.222 |
| Aromatizante | — | — | $100 |
| Agua (Indirecto) | 180 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$2.222** |
| Administración (30%) | — | — | $667 |
| **TOTAL COSTO** | | | **$2.889** |

---

## Carajillo

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café molido | 15 g | $81,5/g | $1.222 |
| Aguardiente nariño | 30 ml | $75/ml | $2.250 |
| Agua (Indirecto) | 120 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$4.372** |
| Administración (30%) | — | — | $1.312 |
| **TOTAL COSTO** | | | **$5.684** |

---

## Café con leche

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café molido | 15 g | $81,5/g | $1.222 |
| Leche | 60 ml | — | $500 |
| Agua (Indirecto) | 120 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$2.622** |
| Administración (30%) | — | — | $787 |
| **TOTAL COSTO** | | | **$3.409** |

---

## Café irlandés

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café molido | 15 g | $81,5/g | $1.222 |
| Whisky para cóctel | 60 ml | $80/ml | $4.800 |
| Leche | 60 ml | — | $500 |
| Agua (Indirecto) | 90 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$7.422** |
| Administración (30%) | — | — | $2.227 |
| **TOTAL COSTO** | | | **$9.649** |

---

## Vaso de leche

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Leche | 240 ml | — | $2.000 |
| **Subtotal producto** | | | **$2.000** |
| Administración (30%) | — | — | $600 |
| **TOTAL COSTO** | | | **$2.600** |

---

## Café frapé

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Café preparado | 120 ml | — | $1.200 |
| Leche | 60 ml | — | $500 |
| Hielo | — | — | $200 |
| Azúcar | — | — | $100 |
| Chispas de chocolate | 10 g | — | $500 |
| Arequipe | 20 g | — | $600 |
| Chantilly (lata) | 30 g | — | $1.500 |
| Energía (Indirecto) | — | — | $300 |
| **Subtotal producto** | | | **$4.900** |
| Administración (30%) | — | — | $1.470 |
| **TOTAL COSTO** | | | **$6.370** |

---

## Affogato

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Espresso | 60 ml | — | $1.200 |
| Helado | — | — | $3.000 |
| **Subtotal producto** | | | **$4.200** |
| Administración (30%) | — | — | $1.260 |
| **TOTAL COSTO** | | | **$5.460** |

---

## Leche achocolatada

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Leche | 180 ml | — | $1.500 |
| Chocolate | — | — | $800 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$2.500** |
| Administración (30%) | — | — | $750 |
| **TOTAL COSTO** | | | **$3.250** |

---

## Aromática con fruta

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Aromática | — | — | $500 |
| Fruta | — | — | $1.000 |
| Agua (Indirecto) | 200 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$2.400** |
| Administración (30%) | — | — | $720 |
| **TOTAL COSTO** | | | **$3.120** |

---

## Aromática

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Aromática | — | — | $500 |
| Agua (Indirecto) | 200 ml | — | $700 |
| Energía (Indirecto) | — | — | $200 |
| **Subtotal producto** | | | **$1.400** |
| Administración (30%) | — | — | $420 |
| **TOTAL COSTO** | | | **$1.820** |

---

## Jarra de aromática con fruta

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Aromática | — | — | $1.000 |
| Fruta | — | — | $3.000 |
| Agua (Indirecto) | 1000 ml | — | $700 |
| Energía (Indirecto) | — | — | $500 |
| **Subtotal producto** | | | **$5.200** |
| Administración (30%) | — | — | $1.560 |
| **TOTAL COSTO** | | | **$6.760** |

---

## Soda italiana

| Ingrediente | Cantidad | Costo unitario | Costo total |
|-------------|----------|----------------|--------------|
| Soda | 300 ml | $5/ml | $1.500 |
| Sirope | 30 ml | $50/ml | $1.500 |
| Limón | — | — | $300 |
| Hielo | — | — | $200 |
| Sal/picante | — | — | $100 |
| Energía (Indirecto) | — | — | $100 |
| **Subtotal producto** | | | **$3.700** |
| Administración (30%) | — | — | $1.110 |
| **TOTAL COSTO** | | | **$4.810** |

---

## Nota técnica (API / Prisma)

En `seedRecipeSpecs`, la fila **Administración (30%)** del array no se guarda tal cual: se **recalcula** como 30 % de la base definida en código (insumos con cantidad + costos de servicio/indirectos según reglas en `scripts/lib/sheet-recipe-seed.ts`). Los totales de esta hoja son la referencia de negocio; si necesitás cifras idénticas en BD, habría que ajustar esa lógica o fijar `adminRate` y líneas de costo manualmente.
