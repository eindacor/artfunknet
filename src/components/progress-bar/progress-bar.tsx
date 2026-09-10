import styles from "./progress-bar.module.css";

export default function ProgressBar({
  value,
  goal,
  maxed = false,
}: {
  value: number;
  goal: number;
  maxed?: boolean;
}) {
  const percent = Math.min((value / Math.max(goal, 1)) * 100, 100);

  return (
    <div className={`${styles.track} ${maxed ? styles.maxLevel : ""}`} >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}
