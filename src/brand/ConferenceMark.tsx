/** Al-Farabi Conference mark, redrawn as vector from the official flyer. */
export const MARK_PATHS = {
  diamond: 'M150 6 L166 22 L150 38 L134 22 Z',
  pillar: 'M118 170 L118 94 C118 72 133 58 150 46 C167 58 182 72 182 94 L182 170 Z',
  window: 'M136 139 L136 102 C136 90 142 82 150 75 C158 82 164 90 164 102 L164 139 Z',
  swoosh: 'M8 151 C52 146 92 142 118 139 L118 170 C78 168 38 162 8 151 Z',
} as const;

type Props = { size?: number; title?: string; className?: string };

export function ConferenceMark({ size = 56, title = 'Al-Farabi Conference', className }: Props) {
  return (
    <svg
      viewBox="0 0 190 176"
      width={size}
      height={(size * 176) / 190}
      role="img"
      aria-label={title}
      className={className}
    >
      <path d={MARK_PATHS.swoosh} fill="#FFFFFF" />
      <path d={MARK_PATHS.pillar} fill="#FFFFFF" />
      <path d={MARK_PATHS.window} fill="#A3262B" />
      <path d={MARK_PATHS.diamond} fill="#A3262B" />
    </svg>
  );
}
