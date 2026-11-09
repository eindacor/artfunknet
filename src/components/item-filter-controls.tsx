"use client";

import type { ReactNode } from "react";

import {
  COLLECTION_FLAG_KEYS,
  COLLECTION_STATUSES,
  getDefaultCollectionFilters,
  hasActiveCollectionFilters,
  type CollectionAttributeOption,
  type CollectionFilters,
  type CollectionFlagKey,
  type CollectionFlagMode,
  type CollectionStatus,
} from "@/server/collection-inventory";
import { ARTWORK_RARITIES, type ArtworkRarity } from "@/server/gameplay";

const COLLECTION_FLAG_LABELS: Record<CollectionFlagKey, string> = {
  repairing: "Repairing",
  "for-sale": "For sale",
  mint: "Mint",
  foil: "Foil",
  unlocked: "Unlocked",
  seasonal: "Seasonal",
  lottery: "Lottery",
  original: "Original",
  vintage: "Vintage",
  forgery: "Known forgery",
};

export type ItemFilterSortOption = {
  label: string;
  value: string;
};

export type ItemFilterVisibility = {
  artStyle?: boolean;
  attributes?: boolean;
  properties?: false | readonly CollectionFlagKey[];
  rarity?: boolean;
  specialAttributes?: boolean;
  status?: boolean;
  tag?: boolean;
};

export default function ItemFilterControls({
  additionalFilters,
  artStyleOptions = [],
  attributeOptions = [],
  className = "",
  contextFiltersActive = false,
  filters,
  matchCount,
  onClearFilters,
  onFiltersChange,
  onSortChange,
  searchHint = "Separate terms with commas. Use #tag, *new, or *dupes.",
  searchLabel = "Search inventory",
  searchPlaceholder = "Title or artist, #tag, *new, *dupes",
  sort,
  sortOptions,
  specialAttributeOptions = [],
  tags = [],
  totalCount,
  visibility = {},
}: {
  additionalFilters?: ReactNode;
  artStyleOptions?: CollectionAttributeOption[];
  attributeOptions?: CollectionAttributeOption[];
  className?: string;
  contextFiltersActive?: boolean;
  filters: CollectionFilters;
  matchCount: number;
  onClearFilters?: () => void;
  onFiltersChange: (filters: CollectionFilters) => void;
  onSortChange: (sort: string) => void;
  searchHint?: ReactNode;
  searchLabel?: string;
  searchPlaceholder?: string;
  sort: string;
  sortOptions: readonly ItemFilterSortOption[];
  specialAttributeOptions?: CollectionAttributeOption[];
  tags?: string[];
  totalCount?: number;
  visibility?: ItemFilterVisibility;
}) {
  const visibleProperties =
    visibility.properties === false
      ? []
      : visibility.properties ?? COLLECTION_FLAG_KEYS;
  const showStatus = visibility.status !== false;
  const showRarity = visibility.rarity !== false;
  const showTag = visibility.tag !== false;
  const showArtStyle = visibility.artStyle !== false;
  const showAttributes = visibility.attributes !== false;
  const showSpecialAttributes = visibility.specialAttributes !== false;
  const filtersActive =
    contextFiltersActive || hasActiveCollectionFilters(filters);

  function update(patch: Partial<CollectionFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  function toggleStatus(status: CollectionStatus) {
    update({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((candidate) => candidate !== status)
        : [...filters.statuses, status],
    });
  }

  function toggleRarity(rarity: ArtworkRarity) {
    if (filters.rarities.length === 1 && filters.rarities.includes(rarity)) {
      return;
    }
    update({
      rarities: filters.rarities.includes(rarity)
        ? filters.rarities.filter((candidate) => candidate !== rarity)
        : [...filters.rarities, rarity],
    });
  }

  function toggleAttribute(
    key: "attributeIds" | "specialAttributeIds",
    minimumKey: "attributeMinimum" | "specialAttributeMinimum",
    id: string,
  ) {
    const current = filters[key];
    const next = current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id];
    update({
      [key]: next,
      [minimumKey]: Math.min(filters[minimumKey], Math.max(1, next.length)),
    });
  }

  return (
    <div
      className={`collection-inventory-controls item-filter-controls ${className}`.trim()}
    >
      <label className="collection-search-control">
        <span>{searchLabel}</span>
        <input
          onChange={(event) => update({ search: event.target.value })}
          placeholder={searchPlaceholder}
          type="search"
          value={filters.search}
        />
        {searchHint ? <small>{searchHint}</small> : null}
      </label>
      <div className="collection-control-row">
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => onSortChange(event.target.value)}
            value={sort}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {showTag ? (
          <label>
            <span>Tag</span>
            <select
              onChange={(event) => update({ tag: event.target.value })}
              value={filters.tag}
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <details className="collection-filter-details">
        <summary>
          <span className="collection-filter-label">
            Filters
            {filtersActive ? (
              <span
                aria-label="Filters applied"
                className="collection-filter-indicator"
              >
                *
              </span>
            ) : null}
          </span>
          <span className="collection-filter-count">
            {totalCount === undefined
              ? `${matchCount.toLocaleString()} matches`
              : `${matchCount.toLocaleString()}/${totalCount.toLocaleString()}`}
          </span>
        </summary>
        <div className="collection-filter-content">
          {showStatus || showRarity ? (
            <div className="collection-filter-pair">
              {showStatus ? (
                <fieldset>
                  <legend>Status</legend>
                  <div className="collection-filter-checks">
                    {COLLECTION_STATUSES.map((status) => (
                      <label key={status}>
                        <input
                          checked={filters.statuses.includes(status)}
                          onChange={() => toggleStatus(status)}
                          type="checkbox"
                        />
                        <span>
                          {status === "claimed"
                            ? "Inventory"
                            : status === "displayed"
                              ? "Featured"
                              : "Auctioned"}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {showRarity ? (
                <fieldset>
                  <legend>Rarity</legend>
                  <div className="collection-filter-checks">
                    {ARTWORK_RARITIES.map((rarity) => (
                      <label
                        className="collection-rarity-filter"
                        data-rarity={rarity}
                        key={rarity}
                      >
                        <input
                          checked={filters.rarities.includes(rarity)}
                          onChange={() => toggleRarity(rarity)}
                          type="checkbox"
                        />
                        <span>{rarity}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </div>
          ) : null}
          {showArtStyle && artStyleOptions.length > 0 ? (
            <fieldset className="collection-art-style-filter">
              <label>
                <span>Applied style</span>
                <select
                  onChange={(event) => update({ artStyle: event.target.value })}
                  value={filters.artStyle}
                >
                  <option value="">All art styles</option>
                  {artStyleOptions.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ) : null}
          {visibleProperties.length > 0 ? (
            <fieldset>
              <legend>Properties</legend>
              <div className="collection-flag-filters">
                {visibleProperties.map((key) => (
                  <label key={key}>
                    <span>{COLLECTION_FLAG_LABELS[key]}</span>
                    <select
                      onChange={(event) =>
                        update({
                          flags: {
                            ...filters.flags,
                            [key]: event.target.value as CollectionFlagMode,
                          },
                        })
                      }
                      value={filters.flags[key]}
                    >
                      <option value="any">Any</option>
                      <option value="only">Only</option>
                      <option value="exclude">Exclude</option>
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {additionalFilters}
          {showAttributes &&
          (attributeOptions.length > 0 ||
            (showSpecialAttributes && specialAttributeOptions.length > 0)) ? (
            <div className="collection-attribute-filter-row">
              {attributeOptions.length > 0 ? (
                <ItemAttributeFilters
                  label="Attributes"
                  minimum={filters.attributeMinimum}
                  onMinimumChange={(attributeMinimum) =>
                    update({ attributeMinimum })
                  }
                  onToggle={(id) =>
                    toggleAttribute("attributeIds", "attributeMinimum", id)
                  }
                  options={attributeOptions}
                  selectedIds={filters.attributeIds}
                  thresholdLimit={4}
                />
              ) : null}
              {showSpecialAttributes && specialAttributeOptions.length > 0 ? (
                <ItemAttributeFilters
                  className="collection-special-attributes"
                  label="Special attributes"
                  minimum={filters.specialAttributeMinimum}
                  onMinimumChange={(specialAttributeMinimum) =>
                    update({ specialAttributeMinimum })
                  }
                  onToggle={(id) =>
                    toggleAttribute(
                      "specialAttributeIds",
                      "specialAttributeMinimum",
                      id,
                    )
                  }
                  options={specialAttributeOptions}
                  selectedIds={filters.specialAttributeIds}
                  thresholdLimit={3}
                />
              ) : null}
            </div>
          ) : null}
          <button
            className="collection-clear-filters"
            onClick={
              onClearFilters ??
              (() => onFiltersChange(getDefaultCollectionFilters()))
            }
            type="button"
          >
            Clear filters
          </button>
        </div>
      </details>
    </div>
  );
}

function ItemAttributeFilters({
  className,
  label,
  minimum,
  onMinimumChange,
  onToggle,
  options,
  selectedIds,
  thresholdLimit,
}: {
  className?: string;
  label: string;
  minimum: number;
  onMinimumChange: (minimum: number) => void;
  onToggle: (id: string) => void;
  options: CollectionAttributeOption[];
  selectedIds: string[];
  thresholdLimit: number;
}) {
  const maximum = Math.min(thresholdLimit, Math.max(1, selectedIds.length));
  return (
    <fieldset className={className}>
      <legend>{label}</legend>
      <label className="collection-attribute-minimum">
        <span>Require at least</span>
        <select
          disabled={selectedIds.length === 0}
          onChange={(event) => onMinimumChange(Number(event.target.value))}
          value={Math.min(minimum, maximum)}
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <div className="collection-attribute-filters">
        {options.map((option) => (
          <label key={option.id}>
            <input
              checked={selectedIds.includes(option.id)}
              onChange={() => onToggle(option.id)}
              type="checkbox"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
