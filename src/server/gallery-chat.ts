import "server-only";

import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import type { GameItem } from "./gameplay";
import {
  findItemReferences,
  getGalleryChatExpiration,
  getGalleryChatReportUpdate,
  getVisibleGalleryChatFilter,
  tokenizeChatContent,
  type GalleryChatToken,
} from "./gallery-chat-core";
import { hydrateGameItems } from "./item-artwork";

export const GALLERY_CHAT_MAX_LENGTH = 500;
export const GLOBAL_CHAT_ROOM_ID = "global";
const GALLERY_CHAT_PAGE_SIZE = 50;

export type ChatPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
};

export type GalleryChatDocument = {
  _id: string;
  gallery_owner_id: string;
  gallery_owner_name: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: Date;
  expires_at?: Date;
  reported: boolean;
  reporter_ids: string[];
  reported_at?: Date;
  hidden: boolean;
  moderated_at?: Date;
  moderated_by?: string;
};

export type GalleryChatMessageView = {
  id: string;
  galleryOwnerId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  reportedByViewer: boolean;
  tokens: GalleryChatToken[];
};

export type GalleryChatReportView = {
  id: string;
  galleryOwnerId: string;
  galleryOwnerName: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  reportCount: number;
  hidden: boolean;
  moderatedAt: string | null;
  moderatedBy: string | null;
};

let chatIndexPromise: Promise<void> | undefined;

export function ensureGalleryChatIndexes(database: Db): Promise<void> {
  chatIndexPromise ??= Promise.all([
    database
      .collection("gallery_chat_messages")
      .createIndex({ gallery_owner_id: 1, created_at: -1 }),
    database
      .collection("gallery_chat_messages")
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    database
      .collection("gallery_chat_messages")
      .createIndex({ reported: 1, created_at: -1 }),
  ]).then(() => undefined);
  return chatIndexPromise;
}

export async function getActiveChatPlayers(
  database: Db,
  viewerId: string,
  galleryOwnerId: string,
): Promise<{ viewer: ChatPlayer; owner: ChatPlayer } | null> {
  const players = await database
    .collection<ChatPlayer>("players")
    .find({
      _id: { $in: [...new Set([viewerId, galleryOwnerId])] },
      active: true,
    })
    .project<ChatPlayer>({ _id: 1, screen_name: 1, active: 1 })
    .toArray();
  const viewer = players.find((player) => player._id === viewerId);
  const owner = players.find((player) => player._id === galleryOwnerId);
  return viewer && owner ? { viewer, owner } : null;
}

export async function getGalleryChatMessages(
  database: Db,
  galleryOwnerId: string,
  viewerId: string,
): Promise<GalleryChatMessageView[]> {
  await ensureGalleryChatIndexes(database);
  const now = new Date();
  const documents = await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .find(getVisibleGalleryChatFilter(galleryOwnerId, now))
    .sort({ created_at: -1 })
    .limit(GALLERY_CHAT_PAGE_SIZE)
    .toArray();

  return hydrateChatMessages(database, documents.reverse(), viewerId);
}

export async function createGalleryChatMessage(
  database: Db,
  {
    galleryOwner,
    author,
    content,
    now = new Date(),
  }: {
    galleryOwner: ChatPlayer;
    author: ChatPlayer;
    content: string;
    now?: Date;
  },
): Promise<GalleryChatMessageView> {
  await ensureGalleryChatIndexes(database);
  const normalizedContent = content.trim();
  if (
    normalizedContent.length === 0 ||
    normalizedContent.length > GALLERY_CHAT_MAX_LENGTH
  ) {
    throw new Error(
      `Chat messages must contain 1-${GALLERY_CHAT_MAX_LENGTH} characters.`,
    );
  }

  const recentMessage = await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .findOne({
      author_id: author._id,
      created_at: { $gt: new Date(now.getTime() - 2_000) },
    });
  if (recentMessage) {
    throw new Error("Wait a moment before sending another chat message.");
  }

  const document: GalleryChatDocument = {
    _id: randomUUID(),
    gallery_owner_id: galleryOwner._id,
    gallery_owner_name: galleryOwner.screen_name,
    author_id: author._id,
    author_name: author.screen_name,
    content: normalizedContent,
    created_at: now,
    expires_at: getGalleryChatExpiration(now),
    reported: false,
    reporter_ids: [],
    hidden: false,
  };
  await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .insertOne(document);
  return (await hydrateChatMessages(database, [document], author._id))[0];
}

export async function reportGalleryChatMessage(
  database: Db,
  messageId: string,
  galleryOwnerId: string,
  reporterId: string,
): Promise<boolean> {
  await ensureGalleryChatIndexes(database);
  const result = await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .updateOne(
      {
        _id: messageId,
        gallery_owner_id: galleryOwnerId,
        hidden: { $ne: true },
      },
      getGalleryChatReportUpdate(reporterId, new Date()),
    );
  return result.matchedCount === 1;
}

export async function getGalleryChatReports(
  database: Db,
): Promise<GalleryChatReportView[]> {
  await ensureGalleryChatIndexes(database);
  const reports = await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .find({ reported: true })
    .sort({ created_at: -1 })
    .limit(250)
    .toArray();
  return reports.map((message) => ({
    id: message._id,
    galleryOwnerId: message.gallery_owner_id,
    galleryOwnerName: message.gallery_owner_name,
    authorId: message.author_id,
    authorName: message.author_name,
    content: message.content,
    createdAt: message.created_at.toISOString(),
    reportCount: message.reporter_ids.length,
    hidden: message.hidden,
    moderatedAt: message.moderated_at?.toISOString() ?? null,
    moderatedBy: message.moderated_by ?? null,
  }));
}

async function hydrateChatMessages(
  database: Db,
  messages: GalleryChatDocument[],
  viewerId: string,
): Promise<GalleryChatMessageView[]> {
  if (messages.length === 0) return [];

  const activePlayers = await database
    .collection<ChatPlayer>("players")
    .find({ active: true })
    .project<ChatPlayer>({ _id: 1, screen_name: 1, active: 1 })
    .toArray();
  const itemMatches = messages.flatMap((message) =>
    findItemReferences(message.content),
  );
  const itemIds = [...new Set(itemMatches.map((match) => match.itemId))];
  const rawItems =
    itemIds.length > 0
      ? await database
          .collection<GameItem>("items")
          .find({ _id: { $in: itemIds } })
          .toArray()
      : [];
  const items = await hydrateGameItems(database, rawItems);
  const itemById = new Map(items.map((item) => [item._id, item]));

  return messages.map((message) => ({
    id: message._id,
    galleryOwnerId: message.gallery_owner_id,
    authorId: message.author_id,
    authorName: message.author_name,
    content: message.content,
    createdAt: message.created_at.toISOString(),
    reportedByViewer: message.reporter_ids.includes(viewerId),
    tokens: tokenizeChatContent(
      message.content,
      activePlayers,
      itemById,
    ),
  }));
}
