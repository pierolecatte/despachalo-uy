-- Add columns for extended label configuration (logo, styles, service info)

ALTER TABLE label_configs
ADD COLUMN logo_position text NOT NULL DEFAULT 'top_left',
ADD COLUMN logo_width_mm int NOT NULL DEFAULT 25,
ADD COLUMN logo_height_mm int NOT NULL DEFAULT 10,
ADD COLUMN logo_fit text NOT NULL DEFAULT 'contain',
ADD COLUMN show_service_label boolean NOT NULL DEFAULT true,
ADD COLUMN show_freight_badge boolean NOT NULL DEFAULT true,
ADD COLUMN freight_badge_position text NOT NULL DEFAULT 'service_block',
ADD COLUMN freight_badge_variant text NOT NULL DEFAULT 'outline',
ADD COLUMN theme_preset text NOT NULL DEFAULT 'classic',
ADD COLUMN primary_color text NOT NULL DEFAULT '#16a34a',
ADD COLUMN show_border boolean NOT NULL DEFAULT true,
ADD COLUMN border_width_pt numeric NOT NULL DEFAULT 1,
ADD COLUMN header_band boolean NOT NULL DEFAULT true,
ADD COLUMN header_band_height_mm numeric NOT NULL DEFAULT 14;
