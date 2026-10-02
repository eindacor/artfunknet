export const DAILY_EVENT_TIME_ZONE = "America/New_York";
export const DAILY_EVENT_NOON_HOUR = 12;

export const DAILY_EVENT_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DailyEventDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DailyEventDebugMode = "today" | "not-today";

export function getDailyEventDayIndex(now = new Date()): DailyEventDayIndex {
  const parts = getTimeZoneParts(now);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() as DailyEventDayIndex;
}

export function isDailyEventDay(
  day: DailyEventDayIndex,
  now = new Date(),
): boolean {
  return getDailyEventDayIndex(now) === day;
}

export function getDailyEventWeekKey(now = new Date()): string {
  const parts = getTimeZoneParts(now);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  localDate.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay());
  return formatLocalDate(localDate);
}

export function getNextDailyEventAt(
  day: DailyEventDayIndex,
  hour = DAILY_EVENT_NOON_HOUR,
  now = new Date(),
): Date {
  const parts = getTimeZoneParts(now);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let dayOffset = (day - localDate.getUTCDay() + 7) % 7;
  if (
    dayOffset === 0 &&
    (parts.hour > hour ||
      (parts.hour === hour && (parts.minute > 0 || parts.second > 0)))
  ) {
    dayOffset = 7;
  }
  localDate.setUTCDate(localDate.getUTCDate() + dayOffset);
  return getUtcDateForTimeZone({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour,
    minute: 0,
    second: 0,
  });
}

export function getMostRecentDailyEventAt(
  day: DailyEventDayIndex,
  hour = DAILY_EVENT_NOON_HOUR,
  now = new Date(),
): Date {
  const parts = getTimeZoneParts(now);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let dayOffset = (localDate.getUTCDay() - day + 7) % 7;
  if (dayOffset === 0 && parts.hour < hour) {
    dayOffset = 7;
  }
  localDate.setUTCDate(localDate.getUTCDate() - dayOffset);
  return getUtcDateForTimeZone({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour,
    minute: 0,
    second: 0,
  });
}

function getTimeZoneParts(date: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DAILY_EVENT_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getUtcDateForTimeZone(target: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): Date {
  const targetWallClock = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  let candidate = targetWallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getTimeZoneParts(new Date(candidate));
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += targetWallClock - actualWallClock;
  }
  return new Date(candidate);
}

function formatLocalDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
