/**
 * Decorative, non-interactive background of spruce-tree outlines.
 * Rendered as a subtle repeating SVG silhouette behind all content.
 */
export function SpruceBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* soft radial depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, oklch(0.32 0.05 152) 0%, oklch(0.24 0.045 152) 60%, oklch(0.2 0.04 152) 100%)",
        }}
      />

      {/* Faint full-field forest texture */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <g id="spruce">
            <path
              d="M16 0
                 L24 14 L20 14
                 L28 26 L22 26
                 L32 40 L18 40
                 L18 52 L14 52 L14 40
                 L0 40 L10 26 L4 26
                 L12 14 L8 14 Z"
              fill="currentColor"
            />
          </g>

          <pattern
            id="spruce-pattern"
            width="120"
            height="110"
            patternUnits="userSpaceOnUse"
          >
            <use href="#spruce" x="10" y="20" />
            <use href="#spruce" x="74" y="55" />
          </pattern>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#spruce-pattern)"
          className="text-foreground"
          opacity="0.04"
        />
      </svg>

      {/* Denser tree line anchored to the bottom edge */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 160"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <g id="spruce-lg">
            <path
              d="M32 0
                 L48 28 L40 28
                 L56 52 L44 52
                 L64 80 L36 80
                 L36 104 L28 104 L28 80
                 L0 80 L20 52 L8 52
                 L24 28 L16 28 Z"
              fill="currentColor"
            />
          </g>
        </defs>
        <g className="text-primary" opacity="0.12">
          <use href="#spruce-lg" x="20" y="55" />
          <use href="#spruce-lg" x="130" y="70" transform="scale(0.85)" />
          <use href="#spruce-lg" x="260" y="48" />
          <use href="#spruce-lg" x="420" y="75" transform="scale(0.8)" />
          <use href="#spruce-lg" x="560" y="52" />
          <use href="#spruce-lg" x="720" y="72" transform="scale(0.9)" />
          <use href="#spruce-lg" x="900" y="50" />
          <use href="#spruce-lg" x="1060" y="68" transform="scale(0.85)" />
        </g>
      </svg>
    </div>
  );
}
