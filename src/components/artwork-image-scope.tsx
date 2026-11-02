"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ArtworkImageScope } from "@/server/artwork-image-url";

const ImageScopeContext = createContext<ArtworkImageScope>("public");

export function AdminArtworkImages({ children }: { children: ReactNode }) {
  return <ImageScopeContext value="admin">{children}</ImageScopeContext>;
}

export function useArtworkImageScope() {
  return useContext(ImageScopeContext);
}
