# Artfunkel

The original Meteor implementation remains in `client`, `lib`, and `server`
while the game is migrated to Next.js.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Start MongoDB with `npm run db:up`.
3. Start the application with `npm run dev`.
4. Open <http://localhost:3000>.

The MongoDB connection can be checked at
<http://localhost:3000/api/health>.

The development database requires authentication and is exposed only on
`127.0.0.1:27018`, avoiding any MongoDB service already using the default
port.

## Database seeding

Run the idempotent seed process after MongoDB is running:

```powershell
npm.cmd run db:seed
```

`ARTWORK_IMPORT_DIR` in `.env.local` selects the local image directory. It
defaults to `public/uploaded_images`, which contains the images submitted
through the legacy upload screen.

Images are hashed and inserted into `artwork_submissions` with an
`unverified` status. Re-running the seed does not duplicate them. No title,
rarity, artist, or other game metadata is inferred from filenames; those
fields remain in an empty `draft` object for the future admin review portal.
Only an approved submission should eventually create records in `artists`
and `artworks`.

## Artwork administration

The seed command also creates or updates the local administrator configured by
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.local`. Sign in at
<http://localhost:3000/login>, then open
<http://localhost:3000/admin/artwork>.

The artwork intake portal supports image review, draft metadata, rejection,
approval, and inline artist creation. Approval requires an existing artist.
The uploaded source is processed with Pillow into full, card, and thumbnail
variants before the active `artworks` record is created. Reviewers enter only
the physical height; physical width is calculated from the processed full
image aspect ratio.

Images can be uploaded directly from the administrator's computer. Uploaded
filenames are retained only for review; S3 keys are
`artwork-intake/<checksum>` before approval and:

```text
artworks/full/<artworkId>_full.<extension>
artworks/card/<artworkId>_card.<extension>
artworks/thumb/<artworkId>_thumb.<extension>
```

MongoDB stores the dimensions, byte size, checksum, content type, and storage
reference for each variant. Temporary processor input and output files are
deleted after the upload attempt. No uploaded images are committed to Git.

Install the local image processor in a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-artwork.txt
```

Set `ARTWORK_PYTHON_BINARY=.venv\Scripts\python.exe` in `.env.local`.
`ARTWORK_CARD_MAX_PIXELS` and `ARTWORK_THUMB_MAX_PIXELS` default to 900 and
240 respectively.

To test Pillow without changing S3 or MongoDB:

```powershell
New-Item -ItemType Directory -Force storage\image-test | Out-Null
.\.venv\Scripts\python.exe scripts\process-artwork-image.py `
  --input "storage\mock-s3\artworks\<existing-artwork-id>" `
  --output-dir "storage\image-test" `
  --artwork-id "local-test" `
  --extension "jpg"
```

Use the real source extension from `artwork-image-manifest.txt`. Confirm that
`local-test_full`, `local-test_card`, and `local-test_thumb` exist and that
the card and thumbnail have maximum dimensions of 900 and 240 pixels. Delete
`storage\image-test` afterward.

Configure `AWS_REGION`, `ARTWORK_S3_BUCKET`, and `ARTWORK_CDN_BASE_URL` in
`.env.local`. AWS credentials are loaded through the standard AWS SDK
credential chain and must not be added to the repository.

For local development, enable the built-in mock:

```env
USE_MOCK_S3=true
```

The mock uses the same object keys as S3 and stores files under the ignored
`storage/mock-s3` directory. Approve a test submission or replace an image in
the catalog editor, then confirm that files appear under
`storage/mock-s3/artworks/full`, `card`, and `thumb`. Artwork is fetched by ID
from `/api/artwork/<artworkId>/image?variant=full|card|thumb`; older
single-image records fall back automatically.

Generate a tab-separated manifest for offline image processing with:

```powershell
npm.cmd run artwork:manifest
```

The generated `artwork-image-manifest.txt` maps every current artwork ID to
its canonical source object and the expected `<artworkId>_full`,
`<artworkId>_card`, and `<artworkId>_thumb` output filenames.

On AWS, switch it off:

```env
USE_MOCK_S3=false
```

Uploads will then use the configured private S3 bucket and the same
full/card/thumb object-key layout.

The private versioned bucket and CloudFront distribution can be created with
the CloudFormation template in `infra/artwork-storage.yaml`:

```powershell
aws cloudformation deploy --stack-name artfunkel-artwork --template-file infra/artwork-storage.yaml
aws cloudformation describe-stacks --stack-name artfunkel-artwork --query "Stacks[0].Outputs"
```

Set the output values in `.env.local`, restart Next.js, and browser uploads
will become available. Use `artwork-image-manifest.txt` and the Pillow
processor to prepare variants for artwork that predates this pipeline.

The IAM identity used by the Next.js server needs `s3:PutObject`,
`s3:GetObject`, and `s3:DeleteObject` access to the `artwork-intake/*` and
`artworks/*` prefixes. Delete access is used to roll back a partial approval.
On AWS, attach these permissions to the application instance or task role
rather than storing access keys in `.env.local`.

For disaster recovery, back up both MongoDB and the S3 bucket. S3 versioning
protects image objects, while the MongoDB backup preserves artwork metadata
and the artist/artwork relationships.

## Development player

The seed command creates a progress-safe development player from
`PLAYER_EMAIL`, `PLAYER_PASSWORD`, and `PLAYER_SCREEN_NAME`. Existing profile
progress is preserved when the seed is rerun, while the configured password
is refreshed.

Sign in at <http://localhost:3000/play/login>. The protected player dashboard
at <http://localhost:3000/play> preserves the original profile, inventory, and
loot sections and their legacy visual treatment.

Players can also create an account directly from the sign-in page using an
email address, a public player name, and a password of at least 12 characters.
Passwords are stored as per-account salted scrypt hashes and never as plaintext.
Signed-in players can change their public name or password from
<http://localhost:3000/play/account>.

Automated password-reset email is not configured. An administrator can recover
a locked account from <http://localhost:3000/admin/player-accounts> by looking
up its exact email address and assigning a temporary password. Deliver that
password through a trusted private channel and have the player replace it after
signing in.

The main player profile has a lightweight global chat beneath notifications.
Opening another player's gallery replaces that context with the gallery's own
chat; the global feed is not shown while visiting a gallery. Messages support
`@Player Name` links and `/items/<itemId>` links, which render as
rarity-colored painting icons with item previews. Ordinary messages expire
after seven days, and open chats check for new messages every five seconds.
Reporting a message preserves it from automatic deletion so administrators can
review and hide or restore it at
<http://localhost:3000/admin/chat-reports>.

Chat expiration uses a MongoDB TTL index on
`gallery_chat_messages.expires_at`; no separate cleanup worker or scheduled
task is required in production. MongoDB's TTL monitor runs asynchronously, so
expired documents may remain stored briefly after seven days, but the
application excludes them immediately. Reported messages have `expires_at`
removed and remain available for moderation and audit.

Deactivated players cannot use gameplay APIs or render the player interface.
Their galleries are removed from Explore metadata and direct gallery links
return unavailable.

The basic gameplay loop is active:

- Daily drop cooldown, item count, foil, unlocked, Mint, and random card-style
  probabilities, Mint value multiplier, and gallery payout frequency are
  persisted in MongoDB and editable for both Actual and Debug profiles at
  <http://localhost:3000/admin>.
- Each drop creates six `unclaimed` items using the original level-gated rarity,
  artwork weighting, condition, attribute, foil, unlocked, misprint, and value
  calculations.
- Items can be claimed into the player's capacity-limited inventory or declined
  and removed from the game.
- Mint items are generated at perfect condition with the configured value
  multiplier captured on the item. Displaying or directly modifying a Mint
  item, including art-style changes, rerolls, or Legendary Attribute
  selection, permanently consumes Mint, leaves the item at 100% condition, and
  recalculates its value without the Mint premium. Collector-offer tags
  preserve Mint. Mint-breaking actions require confirmation through the shared
  Museum-style warning.
- Unclaimed items can be sold individually or through the Loot tab's Sell All
  action, which excludes unresolved Art Dealer offers.
- Generated items carry the original unlocked and locked NPC-attraction
  attributes. Rare, legendary, and masterpiece artwork also requires one, two,
  or three permanent special attributes during admin approval.
- Item cards use a renderer registry with Museum Label as the included default
  and safe fallback. A forced renderer is used for previews, an item-level
  `card_renderer` selects the applied style, and unknown renderer IDs fall back
  to `museum`. The premium OG renderer retains the stable internal `legacy` ID
  for saved data and must match the original Meteor card whenever it is
  updated. Newly generated items can independently roll an item-level renderer
  using the active gameplay profile; successful rolls select uniformly from
  renderers currently marked Active. Nine other self-contained
  renderers—Neon Inventory, Artist Postcard, Gilded Salon,
  Archive Terminal, Prismatic Showcase, Curator Blueprint, Downtown Zine,
  Celestial Orbit, and Boss Reliquary—are available at
  <http://localhost:3000/admin/card-designs>. Each design exposes the complete
  artwork, artist, value, condition, property, attribute, and Legendary effect
  record. Every renderer visibly encodes artwork rarity, while more elaborate
  designs use rarity-specific animated borders, glows, and embellishments.
  Foil items receive a slow, recurring spectrum shimmer over the artwork in
  every renderer, while Museum Label also shows a foil badge and a silver
  Unlocked marker. The admin renderer gallery provides combinable Mint, foil,
  unlocked, seasonal, original, and vintage preview controls, plus rarity and
  automatic artwork selection for every style.
- Every card renderer opens the same accessible item-detail dialog when
  clicked or keyboard-activated. Players can purchase the numbered renderer
  styles at <http://localhost:3000/play/cosmetics> using their bank balance.
  Each purchase adds one consumable. Applying a style to a claimed or displayed
  item consumes one copy, does not refund the previously applied style, and is
  inventory-checked server-side. Museum Label is the fallback presentation
  when an item has no applied style and is not sold or listed as a consumable.
  The paint-brush action on inventory cards and item details opens a separate
  Museum-style dialog with an available-style radio list, live preview, and
  explicit Apply Style action. Removing an applied style does not return it to
  inventory and requires confirmation.
  Administrators can activate or deactivate each renderer from the card-design
  gallery. Inactive styles disappear from the store, but consumables purchased
  previously remain usable. Item permissions determine whether the paint-brush
  action is available; read-only viewers see only the applied style. The
  standard item dialog uses the
  Museum Label editorial format, with artwork identity in the header and
  attributes, properties, and actions in a dedicated management column. New
  gameplay dialogs should follow this Museum-style visual language. The
  complete item and artist record has no nested scroll area.
  Attribute and condition ratings expose separate light-card and dark-card
  palettes, allowing dark renderers to use a visible red-to-white scale instead
  of the OG design&apos;s original red-to-black scale.
- The complete 55-pair Legendary Attribute catalog is seeded with its original
  record IDs and flavor text. Legendary artwork receives one pair-derived
  effect, masterpieces receive three eligible effects, and the active effect
  can be selected in the reroll dialog. Active flavor text appears on item
  cards, while behavior text, codes, parameters, and availability are editable
  at <http://localhost:3000/admin/legendary-attributes>.
- Claimed items can be sold for their generated sell value or placed in the
  player's capacity-limited gallery. Only one copy of an artwork can be
  displayed at a time.
- Claimed, non-permanent artwork can be consigned from its card action without
  losing Mint. The price dialog supports the original minimum starting price,
  optional buy-now price, and one-hour, six-hour, twelve-hour, or one-day
  durations. The Auction House at <http://localhost:3000/play/auctions>
  provides title/artist/seller search, rarity and card-type filters, public or
  private access filters, research filters, pagination, and the original
  price, artwork, and market-analysis sort choices. Bids escrow funds, refund
  outbid players, settle lazily without a background worker, transfer sold
  items, and return unsold consignments.
- Claimed items can be modified through an accessible reroll dialog. Attraction
  values can be rerolled, unlocked attributes can be replaced, and each roll
  charges the original rarity-scaled cost before recalculating item value.
  Items retain their cumulative reroll spending even if a future NPC reward
  reduces their roll count.
- Legendary effects currently modify supported gameplay paths for gallery
  XP-to-money conversion, unclaimed-item sale bonuses, reroll discounts,
  Marketing Manager-gated rerolls of displayed items, supported Donor,
  Dealer, Collector, Auctioneer, auction, and quest interactions. Effects
  involving repairs or other unported rewards remain stored and configurable
  until those systems are migrated.
- Displayed artwork generates the original hourly money and XP rewards. Rewards
  settle automatically when the player returns, without requiring a local
  background worker. Clicking artwork on the gallery wall opens the shared
  item dialog; taking it down remains a separate owner-only Inventory action.
  The dialog carries an explicit viewer-versus-other-player ownership context
  for future multiplayer galleries.
- Important asynchronous events are retained in persistent player
  notifications, including lottery wins, auction wins and returns, outbid
  notices, completed repairs, and forgery liabilities. Routine actions and
  item sales do not create notifications. The profile notification panel
  supports individual read/unread changes, deletion, mark-all-read, and
  clear-all.
- Database seeding creates five persistent test players. Administrators can
  open these accounts from the admin panel, exercise normal player gameplay,
  spawn bronze through platinum NPCs from the test gallery, and return to the
  still-authenticated admin session from the player header.
- Meeting an Art Donor now generates the original quality-weighted, persistent
  unclaimed artwork offers and opens an accessible dialog with claim, sell, and
  decline actions for each item. Donor offer count, minimum condition, and
  starting level honor the applicable active Legendary Attributes. Offered
  artwork and other unclaimed drops are labeled as new or already owned.
- Meeting an Art Dealer generates persistent `for_sale` offers in the same
  dialog, with purchase prices plus purchase and decline actions. Purchases
  atomically charge the player before moving the item into inventory, and
  dealer offer count, pricing, starting level, and displayed-condition bonuses
  honor the currently applicable Legendary Attributes. Unresolved offers
  remain available in the Loot tab.
- Claimed inventory artwork can be tagged for Art Collectors independently
  from Dealer `for_sale` offers. Meeting a Collector immediately selects one
  tagged work, applies the original quality and own-gallery payout formula,
  awards money or XP, and normally removes the item before showing an
  informational result dialog. Collector Legendary effects support
  condition/roll-count bonuses, keep-item rewards, XP-to-money interaction,
  additional sale offers, forgery detection reduction, cap-stepped maximum
  quality, and platinum Collector/Donor companion spawns. Auction, quest, and
  temporary reputation side rewards specific to Collectors remain deferred
  with explicit TODOs.
- Art Experts preserve the original two-stage interaction. They first reduce
  the highest positive reroll count on a claimed or displayed item according
  to visitor quality and own-gallery bonuses. Once no positive counts remain,
  they study a random displayed work and grant its rarity- and level-scaled
  Karma rewards. Active Donor and zero-count Legendary effects retain their
  original multiplier and XP behavior.
- Artwork promotion costs are identical across rarities and double at each
  level, requiring 25,550 total Karma to advance an item from Promotion Level
  1 to Promotion Level 10. Donation Karma uses ascending rarity values, so
  rarer donated works earn substantially more than common works.
- The public Auction House automatically maintains 20 system-generated lots.
  Expired auctions settle before missing slots are replenished with new
  one-hour listings, preserving the original recurring auction supply without
  creating overlapping batches.
- Art Historians create the original collection objectives: four distinct
  level-appropriate artworks with three normally required and up to eight
  active objectives. The Quests tab tracks each requested work against claimed
  and displayed inventory, supports cancellation, and enables reward claims
  without consuming collected items. Claims preserve rarity-scaled money and
  XP, bonus XP for extra and special-property targets, completed-quest totals,
  and Legendary or foil-Legendary item rewards for the highest quest tiers.
  Supported displayed Legendary effects retain quest-cap bypass, Marketing
  Manager target reduction, XP amplification, and auction-count money bonuses.
- Auctioneers activate time-limited market analysis, increasing active auction
  capacity and revealing condition, roll-count, level, and sought-item tools.
  Each encounter also creates short invitation-only auctions visible only to
  that player. Private lots retain the original rarity amplification, quality
  duration bonuses, competitive bot bidding, own-gallery extensions, and
  supported Legendary count and starting-price adjustments.
- Benefactors grant the original quality-scaled, randomized cash donations,
  while Art Enthusiasts grant the original quality-scaled XP chunks. Both
  preserve own-gallery amplification, visitor-count effects, Benefactor
  displayed-condition bonuses, level progression, lottery rewards, and
  `MONEY_FOR_XP`. Their immediate rewards use lightweight green dollar and
  pink heart pop-out animations; the shared reward response includes an
  explicit presentation mode so future Legendary behavior can branch to a
  dialog without changing the reward transaction.
- Artwork images continue to resolve through the mock-S3/S3 storage abstraction.

## Modernization conventions

When porting or updating a legacy dialog, preserve its game logic first and its
visual identity second, but implement the interaction with modern web dialog
patterns. New dialogs must use accessible focus management, keyboard handling,
semantic labeling, and non-blocking React-compatible infrastructure rather than
reproducing the original Meteor or Blaze modal implementation.
