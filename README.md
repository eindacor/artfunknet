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
approval, and inline artist creation. Approval requires an existing artist
and promotes the reviewed image from the S3 intake prefix to its permanent
artwork-ID key before creating an active entry in the `artworks` collection.
Reviewers enter only the physical height; physical width is calculated from
the source image aspect ratio.

Images can be uploaded directly from the administrator's computer. Uploaded
filenames are retained only for review; S3 keys are
`artwork-intake/<checksum>` before approval and `artworks/<artworkId>` after
approval. MongoDB stores review state, metadata, `artist_id`, checksums, and
the S3 reference. No uploaded images are committed to Git.

Configure `AWS_REGION`, `ARTWORK_S3_BUCKET`, and `ARTWORK_CDN_BASE_URL` in
`.env.local`. AWS credentials are loaded through the standard AWS SDK
credential chain and must not be added to the repository.

For local development, enable the built-in mock:

```env
USE_MOCK_S3=true
```

The mock uses the same object keys as S3 and stores files under the ignored
`storage/mock-s3` directory. Approved artwork is fetched by ID from
`/api/artwork/<artworkId>/image`.

On AWS, switch it off:

```env
USE_MOCK_S3=false
```

Uploads will then use the configured private S3 bucket, and artwork URLs are
generated as `<ARTWORK_CDN_BASE_URL>/artworks/<artworkId>`.

The private versioned bucket and CloudFront distribution can be created with
the CloudFormation template in `infra/artwork-storage.yaml`:

```powershell
aws cloudformation deploy --stack-name artfunkel-artwork --template-file infra/artwork-storage.yaml
aws cloudformation describe-stacks --stack-name artfunkel-artwork --query "Stacks[0].Outputs"
```

Set the output values in `.env.local`, restart Next.js, and browser uploads
will become available. Publish artwork approved before S3 was configured with:

```powershell
npm.cmd run db:publish-artwork
```

The IAM identity used by the Next.js server needs `s3:PutObject` and
`s3:GetObject` access to the `artwork-intake/*` and `artworks/*` prefixes.
S3 copy operations use those same permissions. On AWS, attach them to the
application instance or task role rather than storing access keys in
`.env.local`.

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

The basic gameplay loop is active:

- Daily drop cooldown, item count, and gallery payout frequency are persisted in
  MongoDB and editable at <http://localhost:3000/admin>.
- Each drop creates six `unclaimed` items using the original level-gated rarity,
  artwork weighting, condition, attribute, foil, unlocked, misprint, and value
  calculations.
- Items can be claimed into the player's capacity-limited inventory or declined
  and removed from the game.
- Unclaimed items can also be sold directly from the loot screen.
- Generated items carry the original unlocked and locked NPC-attraction
  attributes. Rare, legendary, and masterpiece artwork also requires one, two,
  or three permanent special attributes during admin approval.
- Claimed items can be sold for their generated sell value or placed in the
  player's capacity-limited gallery. Only one copy of an artwork can be
  displayed at a time.
- Displayed artwork generates the original hourly money and XP rewards. Rewards
  settle automatically when the player returns, without requiring a local
  background worker.
- Artwork images continue to resolve through the mock-S3/S3 storage abstraction.
