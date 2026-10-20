<script lang="ts">
  // The app's own mark, matching public/icon.svg and the PNG app icons: an orange
  // rounded tile with a WHITE bot and a BLUE sparkle.
  //
  // Why this exists at all: the splash used to show a violet square with the
  // letters "AW" — a placeholder that matched nothing. A user saw "AW" while the
  // browser tab, the installed PWA and the task switcher all showed a robot, so
  // one app had two identities.
  //
  // Drawn as INLINE SVG (not <img src="/icon.svg">) so it occupies exactly the
  // same layout box the old div did, scales crisply, and costs no extra request.
  interface Props {
    // Rendered size in CSS pixels (the box is square).
    size?: number
    class?: string
  }
  let { size = 40, class: klass = '' }: Props = $props()
</script>

<svg
  class={klass}
  width={size}
  height={size}
  viewBox="0 0 128 128"
  role="img"
  aria-label="EasyAgent"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- Orange tile, same curvature as icon.svg (28/128). -->
  <rect width="128" height="128" rx="28" fill="#f97316" />

  <!-- lucide `bot`: head, antenna, ears, eyes — stroked in white. -->
  <g
    fill="none"
    stroke="#ffffff"
    stroke-width="8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- head: x4 y8 w16 h12 r2, mapped into 128-space around the centre -->
    <rect x="34" y="44" width="60" height="44" rx="7" />
    <!-- antenna: M12 8 V4 H8 -->
    <path d="M64 44 V34 H50" />
    <!-- ears: M2 14h2 / M20 14h2 -->
    <path d="M26 66 h7" />
    <path d="M95 66 h7" />
    <!-- eyes: M9 13v2 / M15 13v2 -->
    <path d="M54 62 v7" />
    <path d="M74 62 v7" />
  </g>

  <!-- Sparkle at the lower-right, clear of the bot with a tile-coloured halo so
       the white outline stays unbroken. -->
  <circle cx="98" cy="98" r="19" fill="#f97316" />
  <path d="M98 79 L102 94 L117 98 L102 102 L98 117 L94 102 L79 98 L94 94 Z" fill="#2563eb" />
</svg>
