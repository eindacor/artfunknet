"use client";

import { useState, type FormEvent } from "react";

import type { GalleryChatReportView } from "@/server/gallery-chat";

export default function ChatReportList({
  reports,
}: {
  reports: GalleryChatReportView[];
}) {
  const [currentReports, setCurrentReports] = useState(reports);
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementStatus, setAnnouncementStatus] = useState("");

  async function postAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnnouncementStatus("Posting...");
    const response = await fetch("/api/admin/chat-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: announcement }),
    });
    const body = (await response.json()) as { error?: string };
    if (response.ok) {
      setAnnouncement("");
      setAnnouncementStatus("Posted to global chat as @Artfunkel.");
    } else {
      setAnnouncementStatus(body.error ?? "The announcement could not be posted.");
    }
  }

  async function setVisibility(report: GalleryChatReportView, hidden: boolean) {
    setPendingId(report.id);
    setError("");
    const response = await fetch("/api/admin/chat-reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: report.id, hidden }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "The message visibility could not be changed.");
    } else {
      setCurrentReports((current) =>
        current.map((candidate) =>
          candidate.id === report.id ? { ...candidate, hidden } : candidate,
        ),
      );
    }
    setPendingId("");
  }

  if (currentReports.length === 0) {
    return <p>No chat messages have been reported.</p>;
  }

  return (
    <>
      <form className="admin-chat-announcement" onSubmit={postAnnouncement}>
        <label>
          <span>Post as @Artfunkel</span>
          <textarea
            maxLength={500}
            onChange={(event) => setAnnouncement(event.target.value)}
            placeholder="Write a global announcement..."
            required
            rows={3}
            value={announcement}
          />
        </label>
        <button disabled={!announcement.trim()} type="submit">
          Post announcement
        </button>
        {announcementStatus ? <small>{announcementStatus}</small> : null}
      </form>
      <div className="admin-chat-report-list">
        {currentReports.map((report) => (
          <article
            className={`admin-chat-report-card${report.hidden ? " hidden" : ""}`}
            key={report.id}
          >
            <header>
              <div>
                <strong>@{report.authorName}</strong>
                <span>
                  {report.galleryOwnerId === "global"
                    ? " in global chat"
                    : ` in @${report.galleryOwnerName}'s gallery`}
                </span>
              </div>
              <span>{report.reportCount} reports</span>
            </header>
            <p>{report.content}</p>
            <footer>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleString()}
              </time>
              <button
                disabled={pendingId.length > 0}
                onClick={() => void setVisibility(report, !report.hidden)}
                type="button"
              >
                {pendingId === report.id
                  ? "Saving..."
                  : report.hidden
                    ? "Restore visibility"
                    : "Hide message"}
              </button>
            </footer>
            {report.hidden ? (
              <small>
                Hidden
                {report.moderatedBy ? ` by ${report.moderatedBy}` : ""}
              </small>
            ) : null}
          </article>
        ))}
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
    </>
  );
}
