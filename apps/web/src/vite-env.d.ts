/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Google Fonts Developer API Key（可选；配置后字体下拉走全量字体） */
  readonly VITE_GOOGLE_FONTS_API_KEY?: string;
}
