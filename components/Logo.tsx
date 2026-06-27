import Image from "next/image";

const variants = {
  navy: {
    src: "/Serve Logo - Navy.png",
    width: 196,
    height: 101,
  },
  transparent: {
    src: "/Serve Logo - Transparent.png",
    width: 163,
    height: 95,
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
