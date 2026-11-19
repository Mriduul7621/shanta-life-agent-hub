/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_AUTH?: string;
  /** Dev-only RS256 signing key (PKCS#8 DER, base64). Never in production. */
  readonly VITE_JWT_PRIVATE_KEY_B64?: string;
  /** Public-key override (QA / rotation testing). Public material only. */
  readonly VITE_HUB_PUBLIC_KEY_PEM?: string;
  /** Kid matching VITE_HUB_PUBLIC_KEY_PEM. Set as a pair. */
  readonly VITE_HUB_KID?: string;
  /** QA-only JSON map of module id → URL (points a tile at a local stub). */
  readonly VITE_MODULE_URL_OVERRIDES?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
