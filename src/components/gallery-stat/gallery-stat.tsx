/**
 * A single label/value pair for the gallery overview panel.
 * Renders a dt/dd so it must sit inside a <dl>.
 */
export default function GalleryStat({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-[0.56rem] tracking-[0.06em] text-[#817a70] uppercase">
        {label}
      </dt>
      <dd className="font-[Georgia,'Times_New_Roman',serif] text-[0.9rem] font-bold text-[#282722]">
        {value}
      </dd>
    </div>
  );
}
