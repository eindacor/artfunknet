import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as imageAdjustments from "../components/item-cards/artwork-image-adjustments.ts";
import * as imageUrls from "./artwork-image-url.ts";
import { createArtistArtworkPreview } from "./artist-artwork-preview.ts";
import type { FeaturedArtistGallery, PublicArtistProfile } from "./artist-types.ts";
import { formatItemDropChance } from "./item-drop-chance-format.ts";
import { formatItemSerialNumber } from "./item-serial-format.ts";
import type { Artwork } from "./gameplay.ts";
import * as galleryFinishes from "./gallery-finishes.ts";

const require = createRequire(import.meta.url);
async function load<T>(relative: string, dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, URL, Date, console, ...globals,
    require: (name: string) => {
      const modules = { react: React, "react/jsx-runtime": require("react/jsx-runtime"), "next/link": require("next/link"), ...dependencies };
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name as keyof typeof modules];
    },
  }) as T;
}

test("the artist application requires new-player credentials and clearly displays locked account details for signed-in players", async () => {
  const datePicker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx");
  const form = await load<typeof import("../app/artists/apply/application-form.tsx")>("../app/artists/apply/application-form.tsx", {
    "@/components/date-picker": datePicker,
  });
  for (const existingPlayer of [null, { email: "existing@example.com", screenName: "Existing-Player" }]) {
    const html = renderToStaticMarkup(React.createElement(form.default, { existingPlayer, latestBirthDate: "2008-11-02" }));
    for (const name of ["name", "dateOfBirth", "portfolioUrl", "bio"]) assert.ok(html.includes(`name="${name}"`), name);
    for (const name of ["email", "screenName"]) {
      const input = html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
      assert.ok(input, name);
      if (existingPlayer) {
        assert.match(input, /disabled=""/);
        assert.ok(input.includes(`value="${existingPlayer[name as keyof typeof existingPlayer]}"`));
      } else {
        assert.match(input, /required=""/);
        assert.doesNotMatch(input, / disabled=""/);
      }
    }
    for (const name of ["password", "confirmPassword"]) {
      assert.equal(html.includes(`name="${name}"`), !existingPlayer, name);
    }
    assert.match(html, /type="url"[^>]*required/);
    assert.doesNotMatch(html, /type="date"/);
    assert.equal((html.match(/<select[^>]*required=""/g) ?? []).length, 3);
    assert.match(html, /Submit artist application/);
    if (existingPlayer) {
      assert.match(html, /You are already signed in/);
      assert.match(html, /no new account or password is created/);
      assert.match(html, /Keep using your existing login/);
    } else assert.match(html, /Become a contributing artist/);
  }
});

test("the application page shows the current stored email and username even while an application is pending", async () => {
  const datePicker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx");
  const form = await load<typeof import("../app/artists/apply/application-form.tsx")>("../app/artists/apply/application-form.tsx", {
    "@/components/date-picker": datePicker,
  });
  for (const pending of [false, true]) {
    const page = await load<typeof import("../app/artists/apply/page.tsx")>("../app/artists/apply/page.tsx", {
      "next/navigation": { redirect: () => assert.fail("This player is not already an artist.") },
      "@/server/session": { getPlayerSession: async () => ({ playerId: "player-id", email: "stale@example.com", screenName: "Stale-Name" }) },
      "@/server/mongodb": { getDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => name === "players"
            ? { _id: "player-id", email: "current@example.com", screen_name: "Current-Name" }
            : pending ? { _id: "application-id" } : null,
        }),
      }) },
      "./application-form": { default: form.default },
    });
    const html = renderToStaticMarkup(await page.default());
    for (const [name, value] of [["email", "current@example.com"], ["screenName", "Current-Name"]]) {
      const input = html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
      assert.ok(input, name);
      assert.match(input, / disabled=""/);
      assert.ok(input.includes(`value="${value}"`));
    }
    assert.doesNotMatch(html, /stale@example.com|Stale-Name/);
    assert.match(html, /Applying with your existing player account/);
    assert.match(html, /Keep using your existing login/);
    if (pending) {
      assert.match(html, /Application awaiting review/);
      assert.doesNotMatch(html, /Submit artist application|name="password"/);
    }
  }
});

test("the reusable date picker completes month/year choices, clears invalid days, and enforces date bounds", async () => {
  let state: unknown;
  const picker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx", {
    react: {
      useState: (initial: unknown) => {
        if (state === undefined) state = initial;
        return [state, (next: unknown) => { state = typeof next === "function" ? next(state) : next; }];
      },
    },
  });
  const props = { label: "Date of birth", name: "dateOfBirth", min: "1900-03-10", max: "2008-11-02", required: true };
  let view = picker.default(props);
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const selects = () => elements(view).filter(element => element.type === "select");
  const submittedDate = () => elements(view).find(element => element.type === "input")!.props.value;
  const options = (index: number) => elements(selects()[index]).filter(element => element.type === "option").map(element => element.props.value);
  const change = (index: number, value: string) => {
    (selects()[index].props.onChange as (event: unknown) => void)({ target: { value } });
    view = picker.default(props);
  };
  assert.equal(submittedDate(), "");
  assert.ok(selects().every(select => select.props.required));
  assert.equal(selects()[1].props.disabled, true);
  change(0, "1991");
  assert.equal(selects()[1].props.disabled, false);
  assert.equal(selects()[2].props.disabled, true);
  change(1, "11");
  assert.equal(submittedDate(), "");
  assert.equal(selects()[2].props.disabled, false);
  change(2, "19");
  assert.equal(submittedDate(), "1991-11-19");
  change(0, "2000");
  change(1, "02");
  change(2, "29");
  assert.equal(submittedDate(), "2000-02-29");
  change(0, "2001");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("29"), false);
  change(1, "01");
  change(2, "31");
  change(1, "04");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("31"), false);
  change(0, "2008");
  assert.equal(options(1).includes("12"), false);
  change(1, "11");
  assert.deepEqual(options(2), ["", "01", "02"]);
  change(2, "02");
  assert.equal(submittedDate(), props.max);
  change(0, "1900");
  assert.equal(options(1).includes("02"), false);
  change(1, "03");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("09"), false);
  change(2, "10");
  assert.equal(submittedDate(), props.min);
  change(0, "");
  assert.equal(submittedDate(), "");
  assert.equal(selects()[1].props.value, "");
  assert.equal(selects()[2].props.value, "");
  assert.equal(picker.default({ ...props, disabled: true }).props.disabled, true);
});

test("admin artist applications render missing and malformed submission dates without hiding reviews", async () => {
  const reviews = await load<typeof import("../app/admin/artist-applications/application-reviews.tsx")>(
    "../app/admin/artist-applications/application-reviews.tsx",
  );
  const date = "2026-10-12T12:00:00.000Z";
  const dateString = "2026-10-13T12:00:00.000Z";
  const applications = [undefined, new Date(date), dateString, null, "not-a-date", new Date(NaN), true]
    .map((createdAt, index) => ({
      _id: `application-${index}`, name: `Applicant ${index}`, email: "applicant@example.com",
      date_of_birth: "2000-01-02", portfolio_url: "https://portfolio.example.com/", bio: "",
      screen_name: "Player", existing_player: true, status: "pending",
      ...(createdAt === undefined ? {} : { created_at: createdAt }),
    }));
  let views: Parameters<typeof reviews.default>[0]["applications"] = [];
  const page = await load<typeof import("../app/admin/artist-applications/page.tsx")>(
    "../app/admin/artist-applications/page.tsx", {
      "@/server/mongodb": { getDatabase: async () => ({
        collection: () => ({ find: () => ({ sort: () => ({ toArray: async () => applications }) }) }),
      }) },
      "./application-reviews": { default: (props: Parameters<typeof reviews.default>[0]) => {
        views = props.applications;
        return React.createElement(reviews.default, props);
      } },
    },
  );
  const html = renderToStaticMarkup(await page.default());
  assert.deepEqual(Array.from(views, application => application.submittedAt), [null, date, dateString, null, null, null, null]);
  assert.equal((html.match(/<dd>Unknown<\/dd>/g) ?? []).length, 5);
  assert.doesNotMatch(html, /Invalid Date/);
  for (const application of applications) assert.ok(html.includes(application.name));
  assert.equal((html.match(/>Approve<\/button>/g) ?? []).length, applications.length);
});

test("artists use the shared artwork editor with Submit and without artist, rarity or active-in-game fields", async () => {
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "public" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const props = {
    mode: "add" as const, artists: [{ id: "artist-id", name: "Artist", dateOfBirth: "", dateOfDeath: "", artworkCount: 0 }],
    rendererOptions: [], onSave: async () => undefined,
  };
  const artist = renderToStaticMarkup(React.createElement(editor.default, { ...props, artistSubmission: true }));
  assert.doesNotMatch(artist, /aria-label="Artist"|aria-label="Rarity"|Active in game|>Accept<\/button>/);
  assert.match(artist, />Submit<\/button>/);
  for (const label of ["Artwork image", "Genre or style", "Medium", "Height (cm)"]) assert.ok(artist.includes(label), label);
  assert.match(artist, /name="image"/);
  const admin = renderToStaticMarkup(React.createElement(editor.default, props));
  assert.match(admin, /aria-label="Artist"/);
  assert.match(admin, /aria-label="Rarity"/);
  assert.match(admin, /Active in game/);
  assert.match(admin, />Accept<\/button>/);
});

test("submission reviews keep rarity but omit artist, value and effect controls while catalog editing retains them", async () => {
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "admin" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      "@/components/artwork-editor/artwork-editor-panel": editor,
    },
  );
  for (const rarity of ["rare", "legendary", "masterpiece"] as const) {
    const artwork = {
      _id: "submission", artist_id: "artist-id", artist: "Artist", title: "Pending work", date: 2026,
      genre: "Abstract", medium: "Oil", height: 100, width: 80, active: false, rarity, value_scale: 0.5,
    };
    const props = {
      artists: [{ id: "artist-id", name: "Artist", dateOfBirth: "", dateOfDeath: "", artworkCount: 0 }],
      rendererOptions: [], onSave: async () => undefined,
    };
    const html = renderToStaticMarkup(React.createElement(reviews.default, { ...props, initialWorks: [artwork] }));
    assert.match(html, /aria-label="Rarity"/);
    assert.match(html, /Accept artwork/);
    assert.doesNotMatch(html, /aria-label="Artist"|Value scale|Unique effect|Special attribute|Active in game/);
    const catalog = renderToStaticMarkup(React.createElement(editor.default, { ...props, artwork, mode: "edit" }));
    assert.match(catalog, /aria-label="Artist"/);
    assert.match(catalog, /Value scale/);
    assert.match(catalog, rarity === "rare" ? /Special attribute/ : /Unique effect/);
  }
});

test("review acceptance sends its approval action without manual value or effect assignments", async () => {
  const artwork = {
    _id: "submission", artist_id: "artist-id", artist: "Artist", title: "Pending work", date: 2026,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: false,
    rarity: "legendary" as const, value_scale: 0.5, effect_id: "old-effect",
  };
  const hooks = {
    ...React,
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  };
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      react: hooks, "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "admin" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  let sent: Record<string, unknown> | undefined;
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      react: hooks, "@/components/artwork-editor/artwork-editor-panel": editor,
    }, {
      fetch: async (url: string, options: RequestInit) => {
        assert.equal(url, "/api/admin/artworks/submission");
        assert.equal(options.method, "PATCH");
        sent = JSON.parse(String(options.body));
        return Response.json({ artwork: { ...artwork, active: true } });
      },
    },
  );
  const tree = reviews.default({ initialWorks: [artwork], artists: [], rendererOptions: [] });
  const children = React.Children.toArray(tree.props.children);
  const panel = children.find(child => React.isValidElement(child) && child.type === editor.default) as
    React.ReactElement<Parameters<typeof editor.default>[0]>;
  assert.ok(panel);
  const form = editor.default(panel.props);
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.ok(sent);
  assert.equal(sent.action, "approve");
  assert.equal(sent.rarity, "legendary");
  assert.equal(sent.artist_id, "artist-id");
  for (const key of ["value_scale", "effect_id", "special_attributes"]) assert.equal(key in sent, false, key);
});

test("the admin layout scopes inactive editor, thumbnail, detail, and item-card images without changing game views", async () => {
  const scope = await load<typeof import("../components/artwork-image-scope.tsx")>("../components/artwork-image-scope.tsx");
  const image = { default: ({ src, alt, unoptimized }: { src: string; alt: string; unoptimized: boolean }) =>
    React.createElement("img", { src, alt, "data-unoptimized": unoptimized }) };
  const thumbnail = await load<typeof import("../components/artwork-thumbnail.tsx")>("../components/artwork-thumbnail.tsx", {
    "next/image": image, "@/server/artwork-image-url": imageUrls, "./artwork-image-scope": scope,
    "./item-cards/artwork-image-adjustments": imageAdjustments,
  });
  const detail = await load<typeof import("../components/artwork-detail-image.tsx")>("../components/artwork-detail-image.tsx", {
    "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
    "@/server/artwork-image-url": imageUrls, "./artwork-image-scope": scope,
  });
  const shared = await load<typeof import("../components/item-cards/shared.tsx")>("../components/item-cards/shared.tsx", {
    "../item-expiration-display": {}, "@/server/artwork-image-url": imageUrls,
    "../artwork-image-scope": scope, "@/server/item-drop-chance-format": {}, "@/server/item-serial-format": {},
    "@/server/archive-gameplay": {}, "@/components/floating-popover": {}, "./card-cosmetics-provider": {},
    "./catalog": {}, "./artwork-image-adjustments": imageAdjustments,
  });
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": image, "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls, "@/components/artwork-image-scope": scope,
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const layout = await load<typeof import("../app/admin/layout.tsx")>("../app/admin/layout.tsx", {
    "./admin-header": { default: () => null }, "@/server/session": { requireAdmin: async () => ({ email: "admin@example.com" }) },
    "@/components/artwork-image-scope": scope,
  });
  const work: Artwork = {
    _id: "inactive-work", artist_id: "artist-id", artist: "Artist", title: "Inactive work", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: false,
  };
  const examples = [
    { variant: "thumb" as const, component: React.createElement(thumbnail.default, { artworkId: work._id, alt: work.title }) },
    { variant: "full" as const, component: React.createElement(detail.default, { artworkId: work._id, alt: work.title, adjustment: { x: 0, y: 0, scale: 1 } }) },
    { variant: "card" as const, component: React.createElement(shared.ArtworkImage, { item: createArtistArtworkPreview(work), className: "" }) },
    { variant: "card" as const, component: React.createElement(editor.default, {
      mode: "edit", artwork: work, artists: [], rendererOptions: [], onSave: async () => undefined,
    }) },
  ];
  for (const { variant, component } of examples) {
    const publicHtml = renderToStaticMarkup(component).replaceAll("&amp;", "&");
    assert.ok(publicHtml.includes(imageUrls.getArtworkImageUrl(work._id, variant)));
    assert.doesNotMatch(publicHtml, /admin=1/);
    const adminHtml = renderToStaticMarkup(await layout.default({ children: component })).replaceAll("&amp;", "&");
    assert.ok(adminHtml.includes(imageUrls.getArtworkImageUrl(work._id, variant, undefined, false, "admin")));
    if (variant === "thumb" || component.type === editor.default) assert.match(adminHtml, /data-unoptimized="true"/);
  }
});

test("item details link both artist credits to the artist gallery for signed-in and anonymous visitors without a discovery button", async () => {
  const shared = await load<typeof import("../components/item-cards/shared.tsx")>("../components/item-cards/shared.tsx", {
    "../item-expiration-display": {}, "@/server/artwork-image-url": imageUrls,
    "../artwork-image-scope": {}, "@/server/item-drop-chance-format": { formatItemDropChance },
    "@/server/item-serial-format": { formatItemSerialNumber }, "@/server/archive-gameplay": {},
    "@/components/floating-popover": {}, "./card-cosmetics-provider": {}, "./catalog": {},
    "./artwork-image-adjustments": imageAdjustments,
  });
  const work: Artwork = {
    _id: "artist-work", artist_id: "artist / id", artist: "Contributing Artist", title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  type GalleryResponse = { ok: boolean; json: () => Promise<{ playerId: string | null }> };
  const response = (playerId: string | null): GalleryResponse => ({ ok: true, json: async () => ({ playerId }) });
  const noop = () => null;
  for (const viewerId of [null, "visitor"]) {
    for (const outcome of ["linked", "unlinked", "failed"] as const) {
      const states: unknown[] = [];
      let stateIndex = 0;
      let effect: React.EffectCallback | undefined;
      let item = { ...createArtistArtworkPreview(work), owner: "unrelated-owner" };
      let fetchGallery = async (): Promise<GalleryResponse> => {
        if (outcome === "failed") throw new Error("Gallery lookup unavailable");
        return response(outcome === "linked" ? "artist/player" : null);
      };
      const details = await load<typeof import("../components/item-cards/standard-item-dialog.tsx")>(
        "../components/item-cards/standard-item-dialog.tsx", {
          react: {
            ...React,
            useState: (initial: unknown) => {
              const index = stateIndex++;
              if (!(index in states)) states[index] = initial;
              return [states[index], (value: unknown) => { states[index] = value; }];
            },
            useEffect: (callback: React.EffectCallback) => { effect = callback; },
          },
          "@/components/artwork-thumbnail": { default: noop }, "@/components/artwork-detail-image": { default: noop },
          "@/components/community-emotes": { CommunityReactionLoader: noop },
          "@/components/item-expiration-display": { ItemExpirationBadge: noop },
          "./art-style-action-button": {}, "./item-action-layout": {},
          "./auction-watermark": { default: noop }, "./known-forgery-watermark": { default: noop },
          "./render-card-preview": { default: noop }, "./registry": { CARD_RENDERERS: { museum: noop } },
          "./artwork-image-adjustments": imageAdjustments,
          "./shared": { ...shared, AttributeIcons: noop, ItemVariantBadges: noop },
          "@/server/raffle-core": { RAFFLE_OWNER_ID: "raffle" },
        }, { fetch: async (url: string, options: RequestInit) => {
          assert.equal(url, `/api/artists/${encodeURIComponent(item.artwork.artist_id)}/gallery`);
          assert.equal(options.cache, "no-store");
          return fetchGallery();
        } },
      );
      const render = () => {
        stateIndex = 0;
        return renderToStaticMarkup(React.createElement(details.StandardItemDetails, {
          item, legendaryAttributes: [], currentRendererId: "museum", viewerId,
          permissions: { canManageItem: false, canCustomizeCosmetic: false },
        }));
      };
      const galleryLinks = (html: string) => [...html.matchAll(/<a\b[^>]*href="(\/gallery\/[^"]+)"[^>]*>(.*?)<\/a>/g)];
      assert.equal(galleryLinks(render()).length, 0);
      assert.ok(effect);
      const cleanup = effect();
      await new Promise<void>(resolve => setImmediate(resolve));
      const html = render();
      const links = galleryLinks(html);
      assert.equal(links.length, outcome === "linked" ? 2 : 0, `${viewerId}: ${outcome}`);
      assert.doesNotMatch(html, /See more from this artist|standard-item-artist-gallery-link/);
      if (outcome === "linked") {
        assert.ok(links.every(link => link[1] === "/gallery/artist%2Fplayer"));
        assert.equal(links.filter(link => link[2] === work.artist).length, 2);
      } else {
        assert.match(html, /<p>Contributing Artist<\/p>/);
      }
      if (typeof cleanup === "function") cleanup();

      if (outcome === "linked") {
        let resolvePrevious!: (value: GalleryResponse) => void;
        const previous = new Promise<GalleryResponse>(resolve => { resolvePrevious = resolve; });
        item = createArtistArtworkPreview({ ...work, artist_id: "previous-artist" });
        fetchGallery = () => previous;
        assert.equal(galleryLinks(render()).length, 0, "Changing artists must immediately hide the old gallery link");
        const cancelPrevious = effect!();
        if (typeof cancelPrevious === "function") cancelPrevious();
        item = createArtistArtworkPreview({ ...work, artist_id: "current-artist" });
        fetchGallery = async () => response("current-player");
        render();
        const cancelCurrent = effect!();
        await new Promise<void>(resolve => setImmediate(resolve));
        resolvePrevious(response("previous-player"));
        await new Promise<void>(resolve => setImmediate(resolve));
        const currentLinks = galleryLinks(render());
        assert.equal(currentLinks.length, 2);
        assert.ok(currentLinks.every(link => link[1] === "/gallery/current-player"), "Late artist lookups must not replace the current artist's links");
        if (typeof cancelCurrent === "function") cancelCurrent();
      }
    }
  }
});

test("gallery previews track window height while artist introductions and owner controls keep their layout", async () => {
  const finishMenu = await load<typeof import("../components/gallery-finish-menu.tsx")>("../components/gallery-finish-menu.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/server/gallery-finishes": galleryFinishes,
  });
  const artist: PublicArtistProfile = {
    id: "artist-id", playerId: "artist-player", name: "Artist", bio: "An artist biography.",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: { bluesky: "https://bsky.app/profile/artist.example" },
    featured: true,
  };
  const work: Artwork = {
    _id: "artist-work", artist_id: artist.id, artist: artist.name, title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const artistComponents = await load<typeof import("../components/artist-gallery.tsx")>("../components/artist-gallery.tsx", {
    "./artwork-thumbnail": {},
    "./item-cards/item-card": { default: ({ item }: { item: ReturnType<typeof createArtistArtworkPreview> }) =>
      React.createElement("article", { "data-preview": item._id }, item.artwork.title) },
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
  });
  const gallery = {
    artist: artist as PublicArtistProfile | null, artistWorks: [work],
    galleryId: "artist-gallery", finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES,
    owner: { playerId: "artist-player", screenName: "Artist-Player", level: 1, vintageLevel: 0 },
    items: [], auctions: [], legendaryAttributes: [], npcs: [], metadata: null,
  };
  let seedGallery = true;
  let windowHeight = 560;
  let onResize: (() => void) | undefined;
  let disconnected = false;
  const heightEffects: React.EffectCallback[] = [];
  const properties = new Map<string, string>();
  const galleryWindow = { getBoundingClientRect: () => ({ height: windowHeight }) };
  const workspace = {
    querySelector: (selector: string) => {
      assert.equal(selector, ".public-gallery-window");
      return galleryWindow;
    },
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
  };
  const noop = () => {};
  const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
    "../app/play/galleries/gallery-explorer.tsx", {
      react: {
        ...React,
        useRef: (initial: unknown) => React.useRef(initial === null ? workspace : initial),
        useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
          if (dependencies?.[0] === gallery.galleryId) heightEffects.push(effect);
        },
        useState: (initial: unknown) => React.useState(
          initial === null && seedGallery
            ? (seedGallery = false, gallery)
            : initial === true ? false : initial,
        ),
      },
      "next/navigation": { useRouter: () => ({ replace: noop }) },
      "@/components/artwork-thumbnail": {}, "@/components/item-thumbnail": {},
      "@/components/community-emotes": {}, "@/components/item-cards/item-card": {},
      "@/components/item-cards/shared": {},
      "@/components/public-gallery": { default: () => React.createElement("section", { className: "public-gallery-window" }) },
      "@/components/gallery-finish-menu": finishMenu,
      "@/components/use-gallery-visitors": { useGalleryVisitors: () => ({
        visitors: [], markVisitorMet: noop, removeVisitor: noop, refreshVisitors: noop, replaceVisitors: noop,
      }) },
      "@/server/social-battery": {}, "@/server/npc-gameplay": { NPC_QUALITIES: [] },
      "../auctions/auction-house": {}, "./gallery-chat": { default: () => null },
      "@/components/artist-gallery": artistComponents,
    }, {
      URLSearchParams,
      ResizeObserver: class {
        constructor(callback: () => void) { onResize = callback; }
        observe(element: unknown) { assert.equal(element, galleryWindow); }
        disconnect() { disconnected = true; }
      },
    },
  );
  for (const [viewerId, isArtist] of [["artist-player", true], ["visitor", true], ["visitor", false]] as const) {
    gallery.artist = isArtist ? artist : null;
    seedGallery = true;
    heightEffects.length = 0;
    windowHeight = 560;
    disconnected = false;
    const html = renderToStaticMarkup(React.createElement(explorer.default, {
      impersonating: false, initialBankBalance: 0, initialGalleryId: "artist-player",
      initialSort: "score", initialViewMode: "grid", meetingNpc: null, npcSpawnIntervalMinutes: 5,
      npcSpawnOptions: [], npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
      onViewSettingsChange: noop, socialBattery: 100, viewerId,
    }));
    if (viewerId === "artist-player") {
      assert.match(html, /aria-label="Gallery finishes"/);
      assert.match(html, /Save finishes/);
      assert.match(html, /aria-label="Wall color picker"/);
      assert.match(html, /aria-label="Frame width"/);
    } else {
      assert.doesNotMatch(html, /Gallery finishes|Save finishes/);
      assert.match(html, isArtist ? /Artist&#x27;s Gallery/ : /Artist-Player&#x27;s Gallery/);
    }
    if (isArtist) {
      const introductionIndex = html.indexOf('class="artist-gallery-introduction"');
      assert.ok(introductionIndex >= 0);
      for (const className of ["visited-gallery-workspace", "collection-preview visited-gallery-preview", "public-gallery-window"]) {
        assert.ok(introductionIndex < html.indexOf(`class="${className}"`), `Artist information precedes ${className}`);
      }
      assert.match(html, /An artist biography\./);
      assert.match(html, /href="https:\/\/portfolio.example.com\/"/);
      assert.match(html, /href="https:\/\/bsky.app\/profile\/artist.example"/);
      assert.ok(html.indexOf('class="artist-gallery-showcase"') > html.indexOf('class="visited-gallery-workspace"'));
      assert.match(html, /data-preview="artist-preview:artist-work"/);
      assert.equal((html.match(/class="artist-bio"/g) ?? []).length, 1);
      assert.equal((html.match(/class="artist-social-links"/g) ?? []).length, 1);
    } else {
      assert.doesNotMatch(html, /artist-gallery-introduction|artist-gallery-showcase|An artist biography/);
    }
    assert.equal(heightEffects.length, 1);
    const cleanup = heightEffects[0]();
    assert.equal(properties.get("--gallery-window-height"), "560px");
    windowHeight = 320;
    assert.ok(onResize);
    onResize();
    assert.equal(properties.get("--gallery-window-height"), "320px");
    assert.equal(typeof cleanup, "function");
    if (typeof cleanup === "function") cleanup();
    assert.equal(disconnected, true);
  }
});

test("featured artist galleries open on an artist work while other galleries and empty exhibitions retain their defaults", async () => {
  const work: Artwork = {
    _id: "artist-work", artist_id: "artist-id", artist: "Artist", title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const artistPreview = createArtistArtworkPreview(work);
  const collectedItem = {
    ...createArtistArtworkPreview({ ...work, _id: "collected-work", artist_id: "other-artist", artist: "Other Artist" }),
    _id: "valuable-collected-item", owner: "artist-player",
    values: { ...artistPreview.values, actual: 500_000 },
  };
  const artist: PublicArtistProfile = {
    id: "artist-id", playerId: "artist-player", name: "Artist", bio: "",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: {}, instagramUsername: null, featured: true,
  };
  const baseGallery = {
    artist, artistWorks: [work], items: [artistPreview, collectedItem], auctions: [], npcs: [],
    galleryId: "artist-gallery", finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES, legendaryAttributes: [], metadata: null,
    owner: { playerId: "artist-player", screenName: "Artist-Player", level: 1, vintageLevel: 0 },
  };
  const cases = [
    { gallery: baseGallery, expected: artistPreview._id },
    { gallery: { ...baseGallery, artist: { ...artist, featured: false } }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artist: null, artistWorks: [], items: [collectedItem] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [collectedItem] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [], auctions: [
      { _id: "auction", item: collectedItem, current_bid: 100, buy_now: null },
    ] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [] }, expected: undefined },
  ];
  const noop = () => {};
  for (const { gallery, expected } of cases) {
    const states: unknown[] = [];
    let stateIndex = 0;
    let loadEffect: React.EffectCallback | undefined;
    let selectItem: ((item: typeof artistPreview) => void) | undefined;
    const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
      "../app/play/galleries/gallery-explorer.tsx", {
        react: {
          ...React,
          useState: (initial: unknown) => {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value: unknown) => {
              states[index] = typeof value === "function" ? value(states[index]) : value;
            }];
          },
          useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
            if (dependencies?.[0] === gallery.owner.playerId) loadEffect = effect;
          },
        },
        "next/navigation": { useRouter: () => ({ replace: noop }) },
        "@/components/artwork-thumbnail": {}, "@/components/item-thumbnail": { default: () => null },
        "@/components/community-emotes": {}, "@/components/item-cards/shared": {},
        "@/components/item-cards/item-card": { default: ({ item }: { item: typeof artistPreview }) =>
          React.createElement("article", { "data-initial-preview": item._id }) },
        "@/components/public-gallery": { default: ({ focusedItemId, items, onSelectItem }: {
          focusedItemId?: string; items: typeof artistPreview[]; onSelectItem: typeof selectItem;
        }) => {
          selectItem = onSelectItem;
          return React.createElement("div", {
            "data-initial-focus": focusedItemId, "data-gallery-items": items.map(item => item._id).join(","),
          });
        } },
        "@/components/gallery-finish-menu": {},
        "@/components/use-gallery-visitors": { useGalleryVisitors: () => ({ visitors: [], replaceVisitors: noop }) },
        "@/server/social-battery": {}, "@/server/npc-gameplay": { NPC_QUALITIES: [] },
        "../auctions/auction-house": {}, "./gallery-chat": { default: () => null },
        "@/components/artist-gallery": { ArtistGalleryIntroduction: () => null, ArtistGalleryShowcase: () => null },
      }, { URLSearchParams, fetch: async () => ({ ok: true, json: async () => gallery }) },
    );
    const render = () => {
      stateIndex = 0;
      return renderToStaticMarkup(React.createElement(explorer.default, {
        impersonating: false, initialBankBalance: 0, initialGalleryId: gallery.owner.playerId,
        initialSort: "score", initialViewMode: "grid", meetingNpc: null, npcSpawnIntervalMinutes: 5,
        npcSpawnOptions: [], npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
        onViewSettingsChange: noop, socialBattery: 100, viewerId: "visitor",
      }));
    };
    render();
    assert.ok(loadEffect);
    const cleanup = loadEffect();
    await new Promise<void>(resolve => setImmediate(resolve));
    const html = render();
    for (const attribute of ["data-initial-preview", "data-initial-focus"]) {
      assert.equal(html.match(new RegExp(`${attribute}="([^"]*)"`))?.[1], expected);
    }
    if (expected === artistPreview._id) {
      assert.ok(html.includes(`data-gallery-items="${artistPreview._id},${collectedItem._id}"`));
      assert.ok(selectItem);
      selectItem(collectedItem);
      const navigated = render();
      assert.ok(navigated.includes(`data-initial-preview="${collectedItem._id}"`));
      assert.ok(navigated.includes(`data-initial-focus="${collectedItem._id}"`));
    }
    if (typeof cleanup === "function") cleanup();
  }
});

test("gallery directory cards and rows distinguish contributing artists without changing player-only listings", async () => {
  const noop = () => {};
  const baseGallery = {
    schema_version: 4, value: 1000, score: 10, item_count: 2, display_count: 2,
    permanent_count: 0, display_capacity: 2, attributes: [], display_rarities: [],
    featured_item_id: null, featured_artwork_id: null, featured_value: 500,
    reactions: { counts: [], viewerReaction: null }, updated_at: "2026-11-02",
  };
  const data = {
    featuredArtists: [], total: 2, page: 1, pageSize: 12,
    galleries: [
      { ...baseGallery, _id: "artist-gallery", owner_id: "artist-player", owner: "Artist-Player", isArtist: true },
      { ...baseGallery, _id: "ordinary-gallery", owner_id: "ordinary-player", owner: "Collector", isArtist: false },
    ],
  };
  const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
    "../app/play/galleries/gallery-explorer.tsx", {
      react: { ...React, useState: (initial: unknown) => React.useState(
        initial !== null && typeof initial === "object" && "galleries" in initial
          ? data : initial === true ? false : initial,
      ) },
      "next/navigation": { useRouter: () => ({ replace: noop }) },
      "@/components/artwork-thumbnail": {}, "@/components/item-thumbnail": {},
      "@/components/community-emotes": { CommunityReactionPicker: () => null },
      "@/components/item-cards/item-card": {}, "@/components/item-cards/shared": {},
      "@/components/public-gallery": {}, "@/components/gallery-finish-menu": {},
      "@/components/use-gallery-visitors": {}, "@/server/social-battery": {},
      "@/server/npc-gameplay": { NPC_QUALITIES: [] }, "../auctions/auction-house": {},
      "./gallery-chat": {}, "@/components/artist-gallery": { FeaturedArtistGalleries: () => null },
    }, { URLSearchParams },
  );
  for (const initialViewMode of ["grid", "list"] as const) {
    const html = renderToStaticMarkup(React.createElement(explorer.default, {
      impersonating: false, initialBankBalance: 0, initialGalleryId: null,
      initialSort: "score", initialViewMode, meetingNpc: null, npcSpawnIntervalMinutes: 5,
      npcSpawnOptions: [], npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
      onViewSettingsChange: noop, socialBattery: 100, viewerId: "viewer",
    }));
    const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
    assert.equal(articles.length, 2);
    assert.match(articles[0], /gallery-explorer-artist/);
    assert.match(articles[0], /gallery-artist-badge/);
    assert.match(articles[0], /aria-hidden="true" class="fa fa-paint-brush"/);
    assert.match(articles[0], /Contributing artist/);
    assert.match(articles[0], /@Artist-Player/);
    assert.doesNotMatch(articles[1], /gallery-explorer-artist|gallery-artist-badge|Contributing artist/);
    assert.match(articles[1], /@Collector/);
    for (const article of articles) assert.match(article, /\$1,000/);
  }
});

test("featured artist cards show names and external links, while Instagram stays unloaded until explicitly requested", async () => {
  const gallery = await load<typeof import("../components/artist-gallery.tsx")>("../components/artist-gallery.tsx", {
    "./artwork-thumbnail": { default: ({ alt }: { alt: string }) => React.createElement("span", { "data-thumbnail": alt }) },
    "./item-cards/item-card": { default: ({ item }: { item: ReturnType<typeof createArtistArtworkPreview> }) =>
      React.createElement("article", { "data-preview": item._id }, item.artwork.title) },
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
  });
  const artist: FeaturedArtistGallery = {
    id: "artist-id", playerId: "artist-player", name: "Test Artist", bio: "The artist's biography.",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: { bluesky: "https://bsky.app/profile/test.example" },
    instagramUsername: "test.artist", featured: true, thumbnail: { _id: "rarest-work", title: "Rarest work" },
  };
  const artists = [artist, { ...artist, id: "another-artist", playerId: "another-player", name: "Another Artist", thumbnail: undefined }];
  const visited: string[] = [];
  const props = { artists, onVisit: (playerId: string) => visited.push(playerId) };
  const cards = renderToStaticMarkup(React.createElement(gallery.FeaturedArtistGalleries, props));
  assert.match(cards, /aria-label="Visit gallery: Test Artist"/);
  assert.match(cards, /Rarest work by Test Artist/);
  assert.match(cards, /href="https:\/\/portfolio.example.com\/"/);
  assert.match(cards, /href="https:\/\/www.instagram.com\/test.artist\/"/);
  assert.doesNotMatch(cards, /Gallery value|Gallery score|Shared works|Attribute score/);
  assert.doesNotMatch(cards, /fa-arrow-right/);
  for (const [card] of cards.matchAll(/<article class="featured-artist-card"[\s\S]*?<\/article>/g)) {
    const firstAction = card.match(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/)?.[0];
    assert.ok(firstAction);
    assert.match(firstAction, /^<button[^>]*>Visit gallery<\/button>$/);
  }
  const section = gallery.FeaturedArtistGalleries(props)!;
  const grid = React.Children.toArray(section.props.children)[1] as React.ReactElement<{ children: React.ReactNode }>;
  for (const child of React.Children.toArray(grid.props.children)) {
    const article = child as React.ReactElement<{ children: React.ReactNode }>;
    const social = React.Children.toArray(article.props.children).find(element =>
      React.isValidElement(element) && element.type === gallery.ArtistSocialLinks) as
      React.ReactElement<Parameters<typeof gallery.ArtistSocialLinks>[0]>;
    const navigation = gallery.ArtistSocialLinks(social.props);
    const button = React.Children.toArray(navigation.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
    assert.equal(button.type, "button");
    button.props.onClick();
  }
  assert.deepEqual(visited, artists.map(entry => entry.playerId));
  const work: Artwork = {
    _id: "work", artist_id: artist.id, artist: artist.name, title: "Active artwork", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const showcase = renderToStaticMarkup(React.createElement(gallery.ArtistGalleryShowcase, {
    artist, works: [work], legendaryAttributes: [], onPreview() {}, viewerId: "viewer",
  }));
  const introduction = renderToStaticMarkup(React.createElement(gallery.ArtistGalleryIntroduction, { artist }));
  assert.match(introduction, /The artist&#x27;s biography/);
  assert.match(introduction, /href="https:\/\/portfolio.example.com\/"/);
  assert.match(introduction, /href="https:\/\/www.instagram.com\/test.artist\/"/);
  assert.doesNotMatch(showcase, /artist-gallery-introduction|artist-bio|artist-social-links/);
  assert.match(showcase, /data-preview="artist-preview:work"/);
  assert.match(showcase, /Load Instagram feed/);
  assert.doesNotMatch(showcase, /<iframe/);
  assert.doesNotMatch(JSON.stringify(createArtistArtworkPreview(work)), /"owner":"viewer"/);
});
