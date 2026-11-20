import { PROVIDER_ICONS } from '../system/provider-icons'

/**
 * Provider icon.
 *
 * Data comes from the icon set built into the magpie engine (see provider-icons.ts),
 * compressed into monochrome geometry and rendered here uniformly. When an icon is missing,
 * it falls back to initials, so adding a new registry entry does not require adding art at
 * the same time — it will first show as a readable letter block instead of an empty box.
 */
export function ProviderIcon({ id, name, size = 21 }: { id: string; name: string; size?: number }) {
  const body = PROVIDER_ICONS[id]
  if (body) {
    // Icons are controlled local constants (geometry and gradient definitions only), not user input,
    // so injecting via innerHTML is more direct than maintaining a React element map.
    //
    // fill="currentColor" on the root svg is required, not decoration: SVG paths without fill
    // take the initial value **black**, not "follow text color". A batch in the icon set (github,
    // openai, groq, zai…) is pure geometry without fill, landing on dark-theme #121215 cards
    // as an invisible black block — half the table icons would vanish into thin air. Setting
    // currentColor makes these icons follow theme text color; icons with their own fill (brand
    // colors) are unaffected, because child elements' explicitly declared fill takes precedence
    // over inherited values.
    return <svg
      className="provider-glyph"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  }
  return <span className="provider-glyph-fallback" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
}
