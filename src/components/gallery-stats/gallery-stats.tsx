export default function GalleryStats({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <dl className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
      {children}
    </dl>
  );
}
