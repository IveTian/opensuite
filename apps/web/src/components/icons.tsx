import type { SVGProps } from "react";

/**
 * 轻量内联 SVG 图标库（Lucide 风格，24×24，stroke=currentColor）。
 * 项目未引入图标依赖，统一在此维护，避免在标题/标签中使用 emoji。
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ className = "size-5", children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Icon>
);

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </Icon>
);

export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
  </Icon>
);

export const StarFilledIcon = (p: IconProps) => (
  <Icon fill="currentColor" {...p}>
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Icon>
);

export const ReplyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    <path d="m9 17-5-5 5-5" />
  </Icon>
);

export const ForwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    <path d="m15 17 5-5-5-5" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>
);

export const PaperclipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.234 20.252 21 12.3a2.84 2.84 0 0 0 0-4.024 2.84 2.84 0 0 0-4.025 0L8.32 17.18a4.74 4.74 0 0 0 0 6.703" />
    <path d="M16.71 13.88 9.04 21.55a4.74 4.74 0 0 1-6.704-6.704l8.654-8.905a2.84 2.84 0 1 1 4.024 4.024L7.13 16.736" />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Icon>
);

export const DashboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const AtSignIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Icon>
);

export const CreditCardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </Icon>
);

export const TicketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
    <path d="M13 5v2M13 17v2M13 11v2" />
  </Icon>
);

export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Icon>
);

export const ScrollIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" />
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const AlertTriangleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
);

export const ArchiveIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Icon>
);

export const LayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
    <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
    <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
  </Icon>
);

export const MailOpenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0z" />
    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
  </Icon>
);

export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
  </Icon>
);

/* ── 富文本编辑器工具栏图标 ── */

export const BoldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </Icon>
);

export const ItalicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 4h-9M14 20H5M15 4 9 20" />
  </Icon>
);

export const UnderlineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" />
  </Icon>
);

export const StrikethroughIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
  </Icon>
);

export const ListBulletIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);

export const ListOrderedIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </Icon>
);

export const QuoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v3a1 1 0 0 1-1 1h-1a1 1 0 0 0 0 2h1a3 3 0 0 0 3-3V5a2 2 0 0 0-2-2zM6 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v3a1 1 0 0 1-1 1H6a1 1 0 0 0 0 2h1a3 3 0 0 0 3-3V5a2 2 0 0 0-2-2z" />
  </Icon>
);

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </Icon>
);

export const CodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </Icon>
);

export const PaletteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
  </Icon>
);

export const HeadingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12M6 20V4M18 20V4" />
  </Icon>
);

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </Icon>
);

export const RedoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </Icon>
);

export const RemoveFormattingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5M20 15l-5 5" />
  </Icon>
);
