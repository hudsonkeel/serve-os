import Image from "next/image";

const variants = {
  // For dark/navy backgrounds — white "Serve" wordmark + gold accents
  navy: {
    src: "/serve-logo-white.png",
    width: 2492,
    height: 894,
  },
  // For light/white/ivory backgrounds — navy "Serve" wordmark + gold accents
  transparent: {
    src: "/serve-logo-color.png",
    width: 2492,
    height: 894,
  },
} as const;

interface LogoProps {
  /** "navy" for dark backgrounds (sidebar, intake left panel); "transparent" for light backgrounds */
  variant?: keyof typeof variants;
  /** Rendered pixel width — height scales automatically */
  width?: number;
  className?: string;
}

export function Logo({ variant = "navy", width = 120, className = "" }: LogoProps) {
  const v = variants[variant];
  return (
    <Image
      src={v.src}
      alt="Serve Caregiving"
      width={v.width}
      height={v.height}
      style={{ width, height: "auto" }}
      className={className}
      priority
    />
  );
}
