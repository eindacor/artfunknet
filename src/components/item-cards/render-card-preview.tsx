import type { ReactNode } from "react";

export default function RenderCardPreview({
  children,
  foil,
}: {
  children: ReactNode;
  foil: boolean;
}) {
  return (
    <div className="render-card-preview">
      {children}
      {foil ? (
        <span aria-hidden="true" className="render-card-foil-sheen" />
      ) : null}
    </div>
  );
}
