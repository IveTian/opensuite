import { useEffect, useState } from "react";

const QUERY = "(max-width: 639px)";

/** 是否为小屏（< sm / 640px），与 Tailwind sm 断点对齐 */
export function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
