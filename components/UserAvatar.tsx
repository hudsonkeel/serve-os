import Image from "next/image";

interface UserAvatarProps {
  firstName: string;
  lastName: string;
  profilePhoto?: string;
  /** Rendered diameter in px — defaults to 40 */
  size?: number;
}

export function UserAvatar({ firstName, lastName, profilePhoto, size = 40 }: UserAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const fontSize = Math.round(size * 0.35);

  if (profilePhoto) {
    return (
      <Image
        src={profilePhoto}
        alt={`${firstName} ${lastName}`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-ivory"
      style={{ width: size, height: size }}
    >
      <span
        className="font-sans font-medium text-navy"
        style={{ fontSize, lineHeight: 1 }}
      >
        {initials}
      </span>
    </div>
  );
}
