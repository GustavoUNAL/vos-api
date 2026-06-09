/** Slug URL-safe para rutas #/e/{slug}/… y tienda pública. */
export function slugifyCompanyLabel(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'empresa';
}

export async function uniqueShopSlug(
  prisma: { company: { findUnique: (args: { where: { shopSlug: string } }) => Promise<{ id: string } | null> } },
  base: string,
): Promise<string> {
  let slug = slugifyCompanyLabel(base);
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const hit = await prisma.company.findUnique({ where: { shopSlug: candidate } });
    if (!hit) return candidate;
    n += 1;
  }
}
