/**
 * Empareja textos históricos de ventas con el catálogo H1 2026.
 */
import { LEGACY_PRODUCT_ID_MAP } from './h1-2026-menu';

export function normalizeProductLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type MatchResult = {
  productId: string;
  productName: string;
  recipeCostMultiplier: number;
};

type Rule = {
  test: RegExp;
  catalogName: string;
  recipeCostMultiplier?: number;
};

const RULES: Rule[] = [
  {
    test: /media\s+aguardiente|1\s*\/\s*2.*aguardiente|mitad.*aguardiente|^aguardiente\s+nari[oñ]o$/i,
    catalogName: 'Media Aguardiente Nariño',
  },
  {
    test: /aguardiente\s*amarillo/i,
    catalogName: 'Aguardiente Amarillo',
  },
  {
    test: /1\s*\/\s*2\s*botella.*smirnoff|media.*smirnoff|vodka-smirnoff-media|mitad\s+smirnoff/i,
    catalogName: 'Vodka Smirnoff Tamarindo',
    recipeCostMultiplier: 0.5,
  },
  {
    test: /café\s*artesanal.*pastel|pastel.*café|combo.*café.*pastel/i,
    catalogName: 'Combo café y pastel',
  },
  {
    test: /acompañante|acompanante|buñuelo|^empanada$|suspiros/i,
    catalogName: 'Acompañante del día',
  },
  {
    test: /pastel\s*del\s*d[ií]a/i,
    catalogName: 'Pastel del día',
  },
  {
    test: /sandwich|sándwich/i,
    catalogName: 'Sándwich del día',
  },
  {
    test: /arom[aá]tica/i,
    catalogName: 'Aromática con fruta',
  },
  {
    test: /hervido|c[oó]ctel\s*de\s*frutas?|fruta\s*de\s*temporada/i,
    catalogName: 'Hervido',
  },
  {
    test: /moscow|moscowmule|chapil|c[oó]ctel\s*moscow/i,
    catalogName: 'Moscow Mule',
  },
  {
    test: /campari/i,
    catalogName: 'Cóctel de Campari',
  },
  {
    test: /michelada/i,
    catalogName: 'Cerveza Michelada',
  },
  {
    test: /club\s*colombia|cerveza\s*club.*330|^cerveza\s*club/i,
    catalogName: 'Cerveza Club Colombia',
  },
  {
    test: /poker.*330|330.*poker/i,
    catalogName: 'Cerveza Poker',
  },
  {
    test: /^cerveza$/i,
    catalogName: 'Cerveza Club Colombia',
  },
  {
    test: /budweiser/i,
    catalogName: 'Cerveza Budweiser',
  },
  {
    test: /heineken/i,
    catalogName: 'Cerveza Heineken',
  },
  {
    test: /águila|aguila/i,
    catalogName: 'Cerveza Águila',
  },
  {
    test: /poker/i,
    catalogName: 'Cerveza Poker',
  },
  {
    test: /coronita/i,
    catalogName: 'Cerveza Coronita',
  },
  {
    test: /shot\s*tequila|tequila.*shot|olmeca.*shot|tequila\s*\(shot\)/i,
    catalogName: 'Shot tequila',
  },
  {
    test: /shot\s*ginebra|gin-?gordon|gordon'?s/i,
    catalogName: 'Shot ginebra',
  },
  {
    test: /shot\s*vodka|^vodka\s*smirnoff$/i,
    catalogName: 'Shot vodka',
  },
  {
    test: /vodka.*tamarindo|smirnoff.*tamarindo/i,
    catalogName: 'Vodka Smirnoff Tamarindo',
  },
  {
    test: /shot\s*brandy|brandy|domecq/i,
    catalogName: 'Shot brandy',
  },
  {
    test: /shot\s*ron|^ron\s/i,
    catalogName: 'Shot ron',
  },
  {
    test: /shot\s*whisky|whisky\s*old\s*parr/i,
    catalogName: 'Shot whisky',
  },
  {
    test: /shot\s*aguardiente/i,
    catalogName: 'Shot aguardiente',
  },
  {
    test: /^aguardiente$/i,
    catalogName: 'Botella Aguardiente Nariño',
  },
  {
    test: /botella\s*de\s*licor|botella-generica/i,
    catalogName: 'Botella de licor',
  },
  {
    test: /cigarrillo|cigarro|marlboro/i,
    catalogName: 'Cigarrillo',
  },
  {
    test: /refajo/i,
    catalogName: 'Refajo',
  },
  {
    test: /papas/i,
    catalogName: 'Papas fritas',
  },
  {
    test: /^soda$/i,
    catalogName: 'Soda',
  },
  {
    test: /limonada/i,
    catalogName: 'Limonada de la casa',
  },
  {
    test: /café\s*negro|cafe-negro/i,
    catalogName: 'Café negro artesanal',
  },
  {
    test: /margarita/i,
    catalogName: 'Margarita',
  },
  {
    test: /cóctel\s*ar[aá]ndano|coctel\s*arandano/i,
    catalogName: 'Cóctel Arándano',
  },
];

function lookupCatalogName(
  legacyProductId: string | null | undefined,
  productName: string,
): string | null {
  const id = legacyProductId?.trim();
  if (id && LEGACY_PRODUCT_ID_MAP[id]) {
    return LEGACY_PRODUCT_ID_MAP[id];
  }
  return null;
}

export function matchSaleLineToCatalog(
  productName: string,
  nameToId: Map<string, { id: string; name: string }>,
  legacyProductId?: string | null,
): MatchResult | null {
  const raw = productName.trim();
  if (!raw) return null;

  const fromId = lookupCatalogName(legacyProductId, raw);
  if (fromId) {
    const row = nameToId.get(normalizeProductLabel(fromId));
    if (row) {
      const mult =
        /media|mitad|1\s*\/\s*2/i.test(raw) &&
        /smirnoff|vodka/i.test(fromId)
          ? 0.5
          : 1;
      return {
        productId: row.id,
        productName: row.name,
        recipeCostMultiplier: mult,
      };
    }
  }

  const norm = normalizeProductLabel(raw);
  const direct = nameToId.get(norm);
  if (direct) {
    return {
      productId: direct.id,
      productName: direct.name,
      recipeCostMultiplier: 1,
    };
  }

  for (const r of RULES) {
    if (r.test.test(raw)) {
      const row = nameToId.get(normalizeProductLabel(r.catalogName));
      if (!row) return null;
      return {
        productId: row.id,
        productName: row.name,
        recipeCostMultiplier: r.recipeCostMultiplier ?? 1,
      };
    }
  }

  return null;
}
