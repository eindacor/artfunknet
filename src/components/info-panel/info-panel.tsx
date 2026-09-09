import styles from "./info-panel.module.css";
import stylesBrash from './info-panel.brash.module.css';

export default function InfoPanel({
  className,
  children,
  flavor,
}: {
  className?: string;
  children?: React.ReactNode;
  flavor?: 'brash'
}) {
  const styling = flavor ? stylesBrash : styles;
  return (
    <section className={`min-w-0 p-4 border ${styling.panel} ${className}`.trim()}>
      {children}
    </section>
  );
}
