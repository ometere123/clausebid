/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_CLAUSEBID_ADDRESS?: string; readonly VITE_STUDIONET_RPC?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
