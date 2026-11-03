"use client";

import ResponsiveMenu from "./responsive-menu";
import ProgressBar from "./progress-bar/progress-bar";
import { SOCIAL_BATTERY_MAX } from "@/server/social-battery";

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const TABS = [
  { id: "collection", label: "Home", icon: "fa-home" },
  { id: "explore", label: "Visit Galleries", icon: "fa-picture-o" },
  { id: "loot", label: "Offers", icon: "fa-gift" },
  { id: "quests", label: "Quests", icon: "fa-map-signs" },
  { id: "auctions", label: "Auction House", icon: "fa-gavel" },
  { id: "archive", label: "Archive", icon: "fa-archive" },
  { id: "daily", label: "Daily Events", icon: "fa-calendar" },
  { id: "profile", label: "Social", icon: "fa-comments" },
  { id: "history", label: "Legacy", icon: "fa-history" },
] as const;

export type DashboardTabId = typeof TABS[number]["id"];

export default function PlayerDashboardToolbar({
  archiveCount, level, isMaxLevel, offerCount, onSelect, questCount,
  section, socialBattery, xp, xpGoal,
}: {
  archiveCount: number;
  level: number;
  isMaxLevel: boolean;
  offerCount: number;
  onSelect: (section: DashboardTabId) => void;
  questCount: number;
  section: string;
  socialBattery: number;
  xp: number;
  xpGoal: number;
}) {
  const current = TABS.find(tab => tab.id === section) ?? TABS[0];
  const xpText = `${xp.toLocaleString()} / ${xpGoal.toLocaleString()} XP`;
  const batteryText = `${socialBattery.toLocaleString()} / ${SOCIAL_BATTERY_MAX.toLocaleString()}`;
  return (
    <>
      <section aria-label="Player progress" className="dashboard-resource-bars">
        <div className="dashboard-resource-bar xp-resource">
          <div>
            <span title={isMaxLevel ? "Next lottery ticket" : undefined}>
              Level {level.toLocaleString()}
              {isMaxLevel ? <>
                <span className="xp-reward-label"> · Next lottery ticket</span>
                <i aria-hidden="true" className="xp-reward-icon fa fa-ticket" />
              </> : null}
            </span>
            <strong title={xpText}>
              <span className="dashboard-resource-value-full">{xpText}</span>
              <span className="dashboard-resource-value-compact">
                {compactNumber.format(xp).toLowerCase()}/{compactNumber.format(xpGoal).toLowerCase()}
              </span>
            </strong>
          </div>
          <div aria-label={isMaxLevel ? "XP toward next lottery ticket" : "XP toward next level"}
            aria-valuemax={xpGoal} aria-valuemin={0} aria-valuenow={xp} role="progressbar">
            <ProgressBar value={xp} goal={xpGoal} maxed={isMaxLevel} />
          </div>
        </div>
        <div className="dashboard-resource-bar social-battery-resource">
          <div>
            <span>Social battery</span>
            <strong title={batteryText}>
              <span className="dashboard-resource-value-full">{batteryText}</span>
              <span className="dashboard-resource-value-compact">
                {compactNumber.format(socialBattery).toLowerCase()}/{compactNumber.format(SOCIAL_BATTERY_MAX).toLowerCase()}
              </span>
            </strong>
          </div>
          <div aria-label={`${socialBattery.toLocaleString()} of ${SOCIAL_BATTERY_MAX.toLocaleString()} social battery remaining`}
            aria-valuemax={SOCIAL_BATTERY_MAX} aria-valuemin={0} aria-valuenow={socialBattery}
            className="social-battery-meter" role="progressbar">
            <span style={{ width: `${Math.max(0, Math.min(100, (socialBattery / SOCIAL_BATTERY_MAX) * 100))}%` }} />
          </div>
        </div>
      </section>
      <ResponsiveMenu className="dashboard-navigation" label={current.label}>
        <nav className="dashboard-tabs" aria-label="Player dashboard">
          {TABS.map(tab => {
            const count = tab.id === "loot" ? offerCount : tab.id === "archive" ? archiveCount : tab.id === "quests" ? questCount : 0;
            return (
              <button aria-current={section === tab.id ? "page" : undefined}
                className={section === tab.id ? "current" : ""} key={tab.id}
                onClick={() => onSelect(tab.id)} type="button">
                <i aria-hidden="true" className={`fa ${tab.icon}`} />
                <span>{tab.label}</span>
                {count > 0 ? ` (${count.toLocaleString()})` : ""}
              </button>
            );
          })}
        </nav>
      </ResponsiveMenu>
    </>
  );
}
