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
  src: string
}

export const PRESET_LOGOS: PresetLogo[] = Object.entries(logoModules)
  .map(([path, src]) => {
    const filename = path.split('/').pop() ?? ''
    const slug = filename.replace(/_logo\.png$/i, '')
    return { name: toCamelLabel(slug), src }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
