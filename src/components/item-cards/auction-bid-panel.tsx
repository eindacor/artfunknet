"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getAuctionBidRestriction } from "@/server/auction-bid-permissions";
import type { AuctionView } from "@/server/auction-gameplay";

export default function AuctionBidPanel({
  auction,
  bankBalance,
  canMakePublic = false,
  onClose,
  onMadePublic,
  onSuccess,
  playerId,
}: {
  auction: AuctionView;
  bankBalance: number;
  canMakePublic?: boolean;
  onClose: () => void;
  onMadePublic?: (auctionId: string, message: string) => void;
  onSuccess: (bankBalance: number) => void;
  playerId: string;
}) {
  const [amount, setAmount] = useState(auction.minimum_bid.toString());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const available =
    bankBalance + (auction.currentlyWinning ? auction.current_bid : 0);
  const restriction = getAuctionBidRestriction(auction, playerId);
  const canPublishAuction =
    canMakePublic && auction.privateAuction && auction.viewer === playerId;

  async function submit(buyNow = false) {
    if (restriction) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/play/auctions/${auction._id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), buyNow }),
      });
      const body = (await response.json()) as {
        error?: string;
        bankBalance?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "The bid failed.");
      onSuccess(body.bankBalance ?? bankBalance);
    } catch (bidError) {
      setError(
        bidError instanceof Error ? bidError.message : "The bid failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function makePublic() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/play/auctions/${auction._id}/make-public`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: string;
        madePublicAuctionId?: string;
        message?: string;
      };
      if (!response.ok || !body.madePublicAuctionId) {
        throw new Error(
          body.error ?? "The private auction could not be made public.",
        );
      }
      onMadePublic?.(
        body.madePublicAuctionId,
        body.message ?? "Private auction converted to a public auction.",
      );
      onClose();
    } catch (makePublicError) {
      setError(
        makePublicError instanceof Error
          ? makePublicError.message
          : "The private auction could not be made public.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="standard-item-auction-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="standard-item-auction-heading">
        <span>
          {auction.privateAuction ? "Private auction" : "Public auction"}
        </span>
        {auction.currentlyWinning ? (
          <strong>
            <i aria-hidden="true" className="fa fa-trophy" /> Winning
          </strong>
        ) : null}
      </div>
      <dl className="standard-item-auction-facts">
        <div>
          <dt>Seller</dt>
          <dd>{auction.seller_name}</dd>
        </div>
        <div>
          <dt>{hasPlacedAuctionBid(auction) ? "Current" : "Starting"}</dt>
          <dd>
            {hasPlacedAuctionBid(auction) ? (
              <strong className="auction-current-bid">
                ${auction.current_bid.toLocaleString()}
              </strong>
            ) : (
              `$${auction.current_bid.toLocaleString()}`
            )}
          </dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{formatAuctionRemaining(auction.expiration)}</dd>
        </div>
      </dl>
      {restriction ? (
        <p>{auction.seller_id === playerId ? null : restriction}</p>
      ) : (
        <>
          <p className="standard-item-auction-balance">
            <span>
              Available: ${available.toLocaleString()}
              {auction.currentlyWinning
                ? " including your current bid"
                : ""}
            </span>
            <span>
              Next bid minimum: ${auction.minimum_bid.toLocaleString()}
            </span>
          </p>
          <label>
            <span className="sr-only">Bid amount</span>
            <i aria-hidden="true" className="fa fa-usd" />
            <input
              aria-label="Bid amount"
              min={auction.minimum_bid}
              onChange={(event) => setAmount(event.target.value)}
              required
              step="1"
              type="number"
              value={amount}
            />
          </label>
          {error ? <p className="auction-dialog-error">{error}</p> : null}
          <footer>
            <button
              disabled={submitting || available < Number(amount)}
              type="submit"
            >
              Place bid
            </button>
            {auction.buy_now !== null ? (
              <button
                disabled={submitting || available < auction.buy_now}
                onClick={() => void submit(true)}
                type="button"
              >
                Buy now · ${auction.buy_now.toLocaleString()}
              </button>
            ) : null}
            {canPublishAuction ? (
              <button
                disabled={submitting}
                onClick={() => void makePublic()}
                type="button"
              >
                <i aria-hidden="true" className="fa fa-globe" /> Make public
              </button>
            ) : null}
          </footer>
        </>
      )}
    </form>
  );
}

export function AuctionBidPanelLoader({
  itemId,
  onClose = () => undefined,
  playerId,
}: {
  itemId: string;
  onClose?: () => void;
  playerId: string;
}) {
  const router = useRouter();
  const [auction, setAuction] = useState<AuctionView | null>(null);
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [auctionResponse, accountResponse] = await Promise.all([
          fetch(
            `/api/play/auctions?item=${encodeURIComponent(itemId)}&pageSize=1`,
            { cache: "no-store", signal: controller.signal },
          ),
          fetch("/api/play/account-summary", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const auctionBody = (await auctionResponse.json()) as {
          auctions?: AuctionView[];
          error?: string;
        };
        const accountBody = (await accountResponse.json()) as {
          bankBalance?: number;
          error?: string;
        };
        if (!auctionResponse.ok) {
          throw new Error(
            auctionBody.error ?? "The auction could not be loaded.",
          );
        }
        if (!accountResponse.ok || accountBody.bankBalance === undefined) {
          throw new Error(
            accountBody.error ?? "Your available balance could not be loaded.",
          );
        }
        setAuction(auctionBody.auctions?.[0] ?? null);
        setBankBalance(accountBody.bankBalance);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The auction could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [itemId]);

  if (loading) {
    return (
      <div className="standard-item-auction-panel">
        <p>Loading auction...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="standard-item-auction-panel">
        <p className="auction-dialog-error" role="alert">
          {error}
        </p>
      </div>
    );
  }
  if (!auction || bankBalance === null) return null;

  return (
    <AuctionBidPanel
      auction={auction}
      bankBalance={bankBalance}
      onClose={onClose}
      onSuccess={() => {
        onClose();
        router.refresh();
      }}
      playerId={playerId}
    />
  );
}

export function hasPlacedAuctionBid(
  auction: Pick<AuctionView, "current_bid" | "has_bid" | "starting_bid">,
): boolean {
  return auction.has_bid || auction.current_bid > auction.starting_bid;
}

export function formatAuctionRemaining(expiration: string): string {
  const milliseconds = Math.max(0, new Date(expiration).getTime() - Date.now());
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
