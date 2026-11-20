/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Alamat dasar link undangan (mis. https://elemental-clash.vercel.app). Kosong = alamat halaman saat ini. */
  readonly VITE_SHARE_URL?: string;
  /** Server sinyal PeerJS sendiri untuk versi web; kosong = cloud publik PeerJS. */
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
  readonly VITE_PEER_SECURE?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
