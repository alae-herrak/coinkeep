import { getIcon } from '../../lib/icons';

interface CategoryIconProps {
  icon: string;
  color: string;
  /** Diameter in px. */
  size?: number;
}

/** Round, tinted badge with a category/goal icon. Decorative — pair it with a visible name. */
export function CategoryIcon({ icon, color, size = 40 }: CategoryIconProps) {
  const Icon = getIcon(icon);
  return (
    <span
      aria-hidden
      className="cat-icon inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, '--cat': color } as React.CSSProperties}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
