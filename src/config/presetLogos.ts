const logoModules = import.meta.glob('../assets/img/*_logo.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function toCamelLabel(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export type PresetLogo = {
  name: string
  slug: string
  icon: string
  src: string
}

export const PRESET_LOGO_PREFIX = 'preset:'

export const PRESET_LOGOS: PresetLogo[] = Object.entries(logoModules)
  .map(([path, src]) => {
    const filename = path.split('/').pop() ?? ''
    const slug = filename.replace(/_logo\.png$/i, '')
    return { name: toCamelLabel(slug), slug, icon: `${PRESET_LOGO_PREFIX}${slug}`, src }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const srcBySlug = new Map(PRESET_LOGOS.map((logo) => [logo.slug, logo.src]))

// Diagrams saved before presets were referenced by stable slug stored the
// build's content-hashed asset path directly, which breaks on the next
// rebuild (Vite regenerates hashes). Resolve those back to a slug here too.
const slugByLegacySrc = new Map(
  PRESET_LOGOS.map((logo) => [logo.src.replace(/-[^./]+(\.\w+)$/, '$1'), logo.slug]),
)

export function resolveIconSrc(icon: string | undefined): string | undefined {
  if (!icon) return icon
  if (icon.startsWith(PRESET_LOGO_PREFIX)) {
    return srcBySlug.get(icon.slice(PRESET_LOGO_PREFIX.length)) ?? undefined
  }
  const unhashed = icon.replace(/-[^./]+(\.\w+)$/, '$1')
  const legacySlug = slugByLegacySrc.get(unhashed)
  if (legacySlug) return srcBySlug.get(legacySlug)
  return icon
}
