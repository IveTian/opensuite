import { useBranding } from "../providers/branding";
import { MailIcon } from "./icons";

/**
 * 站点标识：有自定义 Logo 时渲染图片，否则回退到内置 MailIcon（accent 圆角块）。
 * boxClassName 控制尺寸/圆角/阴影，iconClassName 控制内置图标大小。
 */
export function BrandMark({
  boxClassName = "size-7 rounded-lg",
  iconClassName = "size-4",
}: {
  boxClassName?: string;
  iconClassName?: string;
}) {
  const { logoUrl, siteName } = useBranding();
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={siteName}
        className={"shrink-0 bg-surface object-contain " + boxClassName}
      />
    );
  }
  return (
    <div
      className={
        "flex shrink-0 items-center justify-center bg-accent text-accent-foreground " + boxClassName
      }
    >
      <MailIcon className={iconClassName} />
    </div>
  );
}
