import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const SHOP_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateShopSettingsDto {
  /** Slug público de la tienda (ej. arandano). Enviar null o "" para desactivar. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  @Matches(SHOP_SLUG_RE, {
    message: 'El slug solo puede tener minúsculas, números y guiones',
  })
  shopSlug?: string | null;
}
