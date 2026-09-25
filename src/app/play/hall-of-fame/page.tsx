import Link from "next/link";
import { notFound } from "next/navigation";

import { getXpGoal } from "@/server/collection-gameplay";
import type { HallOfFameRecord } from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { requirePlayer } from "@/server/session";
import PlayerHeader from "../player-header";

export const dynamic = "force-dynamic";

export default async function PlayerHallOfFamePage() {
  const session = await requirePlayer();
  const database = await getDatabase();

  const player = await database
    .collection<{ _id: string; active: boolean; screen_name: string; profile: { level: number; bank_balance: number; xp: number; karma?: number } }>("players")
    .findOne({ _id: session.playerId });

  if (!player || player.active !== true) {
    notFound();
  }

  const records = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .sort({ created_at: -1 })
    .toArray();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <PlayerHeader
        auctionEscrow={0}
        bankBalance={player.profile.bank_balance}
        impersonating={false}
        isMaxLevel={player.profile.level >= 50}
        karma={player.profile.karma ?? 0}
        level={player.profile.level}
        xp={player.profile.xp}
        xpGoal={getXpGoal(player.profile.level)}
      />

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex justify-between items-end border-b border-white/10 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-[var(--accent)] tracking-tight">🏆 Hall of Fame</h1>
            <p className="text-sm text-[var(--muted)]">
              A monument honoring historic masterpiece drops, first mint achievements, record valuations, and legendary milestones.
            </p>
          </div>
          <Link
            className="text-sm text-[var(--accent)] hover:underline"
            href="/play"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {records.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-12 text-center text-[var(--muted)]">
            No items have been enshrined in the Hall of Fame yet. Keep opening drops and making history!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {records.map((rec) => {
              const snapshot = rec.item_snapshot;
              return (
                <div
                  key={rec._id}
                  className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6 space-y-4 hover:border-amber-500/50 transition-colors"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                        {rec.title}
                      </span>
                      <h2 className="text-xl font-bold text-white">
                        {snapshot?.artwork_title || "Enshrined Artwork"}
                      </h2>
                      <p className="text-sm text-[var(--muted)]">
                        by {snapshot?.artist_name || "Unknown Artist"}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                      {new Date(rec.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-300 italic border-l-2 border-amber-500/50 pl-3 py-1">
                    "{rec.description}"
                  </p>

                  {snapshot && (
                    <div className="grid grid-cols-3 gap-2 bg-black/40 rounded-lg p-3 text-xs">
                      <div>
                        <span className="text-[var(--muted)] block">Condition</span>
                        <span className="font-semibold">{snapshot.mint ? "✨ Mint (100%)" : `${(snapshot.condition * 100).toFixed(0)}%`}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block">Variant</span>
                        <span className="font-semibold">{snapshot.foil ? "🌟 Foil" : "Standard"}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block">Valuation</span>
                        <span className="font-semibold text-emerald-400">${snapshot.values?.actual?.toLocaleString() || "—"}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-[var(--muted)] flex justify-between border-t border-white/5 pt-3">
                    <span>Inducted by player: <strong className="text-white">{rec.player_screen_name || "System"}</strong></span>
                    <span>Item ID: <code className="text-[10px] opacity-70">{rec.item_id.slice(0, 8)}...</code></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
