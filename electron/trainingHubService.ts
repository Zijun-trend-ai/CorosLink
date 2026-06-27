import crypto from "node:crypto";
import { deleteSettings, getSetting, setSetting } from "./database";
import type {
  TrainingHubActivity,
  TrainingHubActivityDetail,
  TrainingHubActivityFileType,
  TrainingHubActivityLap,
  TrainingHubAnalytics,
  TrainingHubDailyMetric,
  TrainingHubDailyMetrics,
  TrainingHubRacePredictor,
  TrainingHubRaceScore,
  TrainingHubSportStatistic,
  TrainingHubSportType,
  TrainingHubDashboard,
  TrainingHubPersonalRecord,
  TrainingHubPersonalRecordGroup,
  TrainingHubSleepHrvReading,
  TrainingHubSleepHrvSummary,
  TrainingHubStatus,
  TrainingHubThresholdZone,
  TrainingHubUpcomingWorkout,
  TrainingHubZoneDistributionEntry,
  TrainingHubZoneDistributions
} from "./types";

interface LoginResult {
  loginData: TrainingHubLoginData;
  loginBaseUrl: string;
}

const GLOBAL_BASE_URL = "https://teamapi.coros.com";
const LOGIN_URL = `${GLOBAL_BASE_URL}/account/login`;
const RESULT_SUCCESS = "0000";
const AUTH_ERROR_CODES = new Set(["0101", "0102", "1006"]);

const REGION_BASE_URLS: Record<string, string> = {
  "0": "https://teamapi.coros.com",
  "1": "https://teamapi.coros.com",
  "2": "https://teameuapi.coros.com",
  "3": "https://teamapiap.coros.com",
  cn: "https://teamcnapi.coros.com",
  us: "https://teamapi.coros.com",
  eu: "https://teameuapi.coros.com",
  global: "https://teamapi.coros.com"
};

const REGION_PROBE_URLS = [
  "https://teamapi.coros.com",
  "https://teameuapi.coros.com",
  "https://teamcnapi.coros.com",
  "https://teamapiap.coros.com"
];

const SETTINGS = {
  accessToken: "trainingHub.accessToken",
  userId: "trainingHub.userId",
  regionId: "trainingHub.regionId",
  baseUrl: "trainingHub.baseUrl"
};

interface TrainingHubAuthState {
  accessToken: string;
  userId: string;
  regionId: string;
  baseUrl: string;
}

interface TrainingHubApiResponse<T> {
  result?: string;
  apiCode?: string;
  message?: string;
  data?: T;
}

interface TrainingHubLoginData {
  accessToken?: string;
  userId?: string | number;
  regionId?: string | number;
}

interface TrainingHubAccountData {
  userId?: string | number;
}

interface TrainingHubActivityListData {
  dataList?: RawTrainingHubActivity[];
}

interface RawTrainingHubActivity {
  labelId?: string;
  activityId?: string;
  name?: string;
  sportType?: number;
  startTime?: number;
  endTime?: number;
  totalTime?: number;
  distance?: number;
  avgHr?: number;
  maxHr?: number;
  calorie?: number;
  trainingLoad?: number;
  ascent?: number;
}

interface TrainingHubDashboardData {
  summaryInfo?: Record<string, unknown>;
  sportDataSummary?: {
    count?: number;
    modelValidState?: boolean;
  };
}

interface TrainingHubSportListData {
  sportList?: RawSportType[];
  dataList?: RawSportType[];
}

interface RawSportType {
  sportType?: number;
  sportName?: string;
  name?: string;
}

interface RawDailyMetric {
  happenDay?: string | number;
  trainingLoad?: number;
  rhr?: number;
  avgSleepHrv?: number;
  sleepHrvBase?: number;
  tiredRateNew?: number;
  tiredRateStateNew?: number;
  trainingLoadRatio?: number;
  staminaLevel?: number;
  vo2max?: number;
  distance?: number;
  duration?: number;
}

interface RawRaceScore {
  distance?: number;
  predictSecond?: number;
  predictTime?: number;
  time?: number;
  score?: number;
  raceType?: number | string;
  raceName?: string;
  [key: string]: unknown;
}

interface TrainingHubFileUrlData {
  fileUrl?: string;
}

export function getTrainingHubStatus(): TrainingHubStatus {
  const auth = getStoredAuth();

  return {
    authenticated: Boolean(auth),
    userId: auth?.userId,
    regionId: auth?.regionId,
    baseUrl: auth?.baseUrl
  };
}

export async function loginTrainingHub(
  email: string,
  password: string
): Promise<TrainingHubStatus> {
  const account = email.trim();
  if (!account || !password) {
    throw new Error("Enter your COROS email and password.");
  }

  const pwdHash = crypto.createHash("md5").update(password).digest("hex");
  const session = await establishTrainingHubSession(account, pwdHash);

  setSetting(SETTINGS.accessToken, session.accessToken);
  setSetting(SETTINGS.userId, session.userId);
  setSetting(SETTINGS.regionId, session.regionId);
  setSetting(SETTINGS.baseUrl, session.baseUrl);

  return getTrainingHubStatus();
}

async function establishTrainingHubSession(
  account: string,
  pwdHash: string
): Promise<TrainingHubAuthState> {
  const { loginData, loginBaseUrl } = await loginViaAnyBase(account, pwdHash);
  const accessToken = loginData.accessToken;

  if (!accessToken) {
    throw new Error("COROS login response did not include a usable token.");
  }

  const regionId =
    loginData.regionId === undefined ? "1" : String(loginData.regionId);
  const baseUrl = await resolveTrainingHubBaseUrl(accessToken, loginBaseUrl);

  let userId = String(loginData.userId ?? "").trim();
  const accountData = await queryTrainingHubAccount(accessToken, baseUrl);
  if (accountData?.userId !== undefined) {
    userId = String(accountData.userId).trim();
  }

  if (!userId) {
    throw new Error("COROS login response did not include a user ID.");
  }

  return {
    accessToken,
    userId,
    regionId,
    baseUrl
  };
}

async function loginViaAnyBase(
  account: string,
  pwdHash: string
): Promise<LoginResult> {
  const loginTargets = REGION_PROBE_URLS.map(
    (baseUrl) => [baseUrl, `${baseUrl}/account/login`] as const
  );

  let lastError: unknown;

  for (const [loginBaseUrl, loginUrl] of loginTargets) {
    try {
      const loginData = await loginAtBase(loginUrl, account, pwdHash);
      return { loginData, loginBaseUrl };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.message) {
    throw lastError;
  }

  throw new Error(
    "COROS login failed. Check your email and password, then try again."
  );
}

async function loginAtBase(
  url: string,
  account: string,
  pwdHash: string
): Promise<TrainingHubLoginData> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*"
    },
    body: JSON.stringify({
      account,
      accountType: 2,
      pwd: pwdHash
    })
  });

  if (!response.ok) {
    throw new Error(
      `COROS login request failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as TrainingHubApiResponse<TrainingHubLoginData>;
  const result = String(payload.result ?? payload.apiCode ?? "");

  if (result !== RESULT_SUCCESS) {
    throw new Error(payload.message || "COROS login failed.");
  }

  if (!payload.data?.accessToken) {
    throw new Error("COROS login response did not include a usable token.");
  }

  return payload.data;
}

async function queryTrainingHubAccount(
  accessToken: string,
  baseUrl: string
): Promise<TrainingHubAccountData | null> {
  try {
    const response = await fetch(`${baseUrl}/account/query`, {
      headers: buildTrainingHubHeaders(accessToken)
    });

    if (!response.ok) {
      return null;
    }

    const payload =
      (await response.json()) as TrainingHubApiResponse<TrainingHubAccountData>;
    const result = String(payload.result ?? payload.apiCode ?? "");

    if (result !== RESULT_SUCCESS || !payload.data) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export function logoutTrainingHub(): TrainingHubStatus {
  clearTrainingHubAuth();
  return getTrainingHubStatus();
}

export async function listTrainingHubActivities(
  page = 1,
  size = 50
): Promise<TrainingHubActivity[]> {
  const data = await trainingHubGet<TrainingHubActivityListData>(
    "/activity/query",
    {
      size,
      pageNumber: page
    }
  );

  return (data.dataList ?? []).map(mapTrainingHubActivity);
}

export async function getTrainingHubActivityDetail(
  activityId: string,
  sportType: number
): Promise<TrainingHubActivityDetail> {
  const raw = await trainingHubRequest<Record<string, unknown>>(
    "/activity/detail/query",
    {
      method: "POST",
      params: {
        labelId: activityId,
        sportType
      }
    }
  );

  return parseActivityDetail(raw);
}

export async function getTrainingHubActivityFileUrl(
  activityId: string,
  sportType: number,
  fileType: TrainingHubActivityFileType = 4
): Promise<string> {
  const data = await trainingHubRequest<TrainingHubFileUrlData>(
    "/activity/detail/download",
    {
      method: "POST",
      params: {
        labelId: activityId,
        sportType,
        fileType
      }
    }
  );

  if (!data.fileUrl) {
    throw new Error("COROS did not return a file URL for this activity.");
  }

  return data.fileUrl;
}

export async function getTrainingAnalytics(): Promise<TrainingHubAnalytics> {
  const raw = await trainingHubGet<Record<string, unknown>>("/analyse/query");
  return parseAnalytics(raw);
}

export async function getTrainingDashboard(): Promise<TrainingHubDashboard> {
  const dashboard = await trainingHubGet<TrainingHubDashboardData>(
    "/dashboard/query"
  );

  return parseTrainingDashboard(dashboard);
}

export async function getRacePredictor(): Promise<TrainingHubRacePredictor> {
  const dashboard = await getTrainingDashboard();
  return dashboard.racePredictor;
}

export async function getDailyMetrics(
  dateList: string[]
): Promise<TrainingHubDailyMetrics> {
  const sortedDates = [...dateList].sort();
  const startDay = sortedDates[0];
  const endDay = sortedDates[sortedDates.length - 1];

  if (!startDay || !endDay) {
    throw new Error("At least one date is required for daily metrics.");
  }

  const raw = await trainingHubGet<Record<string, unknown>>(
    "/analyse/dayDetail/query",
    {
      startDay,
      endDay
    }
  );

  return parseDailyMetrics(raw);
}

export async function getSportTypeMap(): Promise<TrainingHubSportType[]> {
  try {
    const data = await trainingHubGet<TrainingHubSportListData>(
      "/activity/fit/getImportSportList"
    );
    const list = data.sportList ?? data.dataList ?? [];

    return list
      .map((item) => ({
        sportType: item.sportType ?? 0,
        sportName: item.sportName ?? item.name ?? `Sport ${item.sportType ?? 0}`
      }))
      .filter((item) => item.sportType > 0);
  } catch {
    return [];
  }
}

export async function getUpcomingWorkouts(
  days = 14
): Promise<TrainingHubUpcomingWorkout[]> {
  const { startDay, endDay } = upcomingScheduleDateRange(days);
  const raw = await trainingHubGet<Record<string, unknown>>(
    "/training/schedule/query",
    {
      startDate: startDay,
      endDate: endDay,
      supportRestExercise: 1
    }
  );

  return parseUpcomingWorkouts(raw, startDay);
}

function upcomingScheduleDateRange(days: number): {
  startDay: string;
  endDay: string;
} {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + Math.max(0, days - 1));

  return {
    startDay: formatScheduleDay(start),
    endDay: formatScheduleDay(end)
  };
}

function formatScheduleDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function parseUpcomingWorkouts(
  raw: Record<string, unknown>,
  todayDay: string
): TrainingHubUpcomingWorkout[] {
  const entities = extractArray(raw, ["entities"]) ?? [];
  const programs = extractArray(raw, ["programs"]) ?? [];
  const programsByIdInPlan = new Map<string, Record<string, unknown>>();
  const programsById = new Map<string, Record<string, unknown>>();

  for (const item of programs) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const program = item as Record<string, unknown>;
    const idInPlan = program.idInPlan;

    if (idInPlan !== undefined && idInPlan !== null) {
      programsByIdInPlan.set(String(idInPlan), program);
    }

    if (program.id !== undefined && program.id !== null) {
      programsById.set(String(program.id), program);
    }
  }

  const workouts: TrainingHubUpcomingWorkout[] = [];

  entities.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const entity = item as Record<string, unknown>;
    const status = toOptionalNumber(entity.status);

    if (status === 3) {
      return;
    }

    const happenDay = String(entity.happenDay ?? "");

    if (!/^\d{8}$/.test(happenDay) || happenDay < todayDay) {
      return;
    }

    const idInPlan = String(entity.idInPlan ?? "");
    const planProgramId = String(entity.planProgramId ?? "");
    const program =
      (idInPlan ? programsByIdInPlan.get(idInPlan) : undefined) ??
      (planProgramId ? programsById.get(planProgramId) : undefined) ??
      (programs[index] && typeof programs[index] === "object"
        ? (programs[index] as Record<string, unknown>)
        : undefined);

    workouts.push({
      happenDay,
      name: resolveUpcomingWorkoutName(program, entity),
      volume: formatUpcomingWorkoutVolume(program),
      trainingLoad: resolveUpcomingWorkoutLoad(program),
      sportType: toOptionalNumber(program?.sportType),
      sortNo: toOptionalNumber(entity.sortNoInSchedule ?? entity.sortNo)
    });
  });

  return workouts.sort((left, right) => {
    if (left.happenDay !== right.happenDay) {
      return left.happenDay.localeCompare(right.happenDay);
    }

    return (left.sortNo ?? 0) - (right.sortNo ?? 0);
  });
}

function resolveUpcomingWorkoutName(
  program: Record<string, unknown> | undefined,
  entity: Record<string, unknown>
): string {
  return (
    (program ? pickString(program, ["name"]) : undefined) ??
    pickString(entity, ["name"]) ??
    "Scheduled workout"
  );
}

function resolveUpcomingWorkoutLoad(
  program: Record<string, unknown> | undefined
): number | undefined {
  return (
    toOptionalNumber(program?.trainingLoad) ??
    toOptionalNumber(program?.estimatedValue)
  );
}

function formatUpcomingWorkoutVolume(
  program: Record<string, unknown> | undefined
): string | undefined {
  const distanceMeters = resolveWorkoutDistanceMeters(program);

  if (distanceMeters > 0) {
    return `${(distanceMeters / 1000).toFixed(2)}km`;
  }

  const sets = resolveWorkoutSetCount(program);

  if (sets > 0) {
    return `${sets} set(s)`;
  }

  return undefined;
}

function resolveWorkoutDistanceMeters(
  program: Record<string, unknown> | undefined
): number {
  if (!program) {
    return 0;
  }

  const directDistance = toOptionalNumber(program.distance);

  if (directDistance && directDistance >= 100) {
    return directDistance;
  }

  const estimatedDistance = toOptionalNumber(program.estimatedDistance);

  if (estimatedDistance && estimatedDistance > 0) {
    return estimatedDistance / 100;
  }

  if (directDistance && directDistance > 0) {
    return directDistance / 100;
  }

  const exercises = Array.isArray(program.exercises) ? program.exercises : [];
  let total = 0;

  for (const item of exercises) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const exercise = item as Record<string, unknown>;
    const targetType = toOptionalNumber(exercise.targetType);
    const targetValue = toOptionalNumber(exercise.targetValue);
    const sets = Math.max(1, toOptionalNumber(exercise.sets) ?? 1);

    if (targetType === 5 && targetValue) {
      total += (targetValue / 100) * sets;
    }
  }

  return total;
}

function resolveWorkoutSetCount(
  program: Record<string, unknown> | undefined
): number {
  if (!program) {
    return 0;
  }

  const totalSets =
    toOptionalNumber(program.totalSets) ??
    toOptionalNumber(program.sets) ??
    toOptionalNumber(program.exerciseNum);

  if (totalSets && totalSets > 0) {
    return Math.round(totalSets);
  }

  const exercises = Array.isArray(program.exercises) ? program.exercises : [];

  if (exercises.length === 0) {
    return 0;
  }

  return exercises.reduce((count, item) => {
    if (!item || typeof item !== "object") {
      return count;
    }

    const exercise = item as Record<string, unknown>;
    return count + Math.max(1, toOptionalNumber(exercise.sets) ?? 1);
  }, 0);
}

function mapTrainingHubActivity(
  raw: RawTrainingHubActivity
): TrainingHubActivity {
  const activityId = raw.labelId ?? raw.activityId ?? "";

  return {
    activityId,
    name: raw.name,
    sportType: raw.sportType ?? 0,
    startTime: raw.startTime,
    endTime: raw.endTime,
    duration: raw.totalTime,
    distance: raw.distance,
    avgHr: raw.avgHr,
    maxHr: raw.maxHr,
    calories:
      raw.calorie && raw.calorie > 0
        ? Math.round(raw.calorie / 1000)
        : undefined,
    trainingLoad: raw.trainingLoad,
    elevationGain: raw.ascent
  };
}

function parseDailyMetric(raw: RawDailyMetric): TrainingHubDailyMetric {
  return {
    happenDay: String(raw.happenDay ?? ""),
    trainingLoad: toOptionalNumber(raw.trainingLoad),
    rhr: toOptionalNumber(raw.rhr),
    avgSleepHrv: toOptionalNumber(raw.avgSleepHrv),
    sleepHrvBase: toOptionalNumber(raw.sleepHrvBase),
    tiredRateNew: toOptionalNumber(raw.tiredRateNew),
    tiredRateStateNew: toOptionalNumber(raw.tiredRateStateNew),
    trainingLoadRatio: toOptionalNumber(raw.trainingLoadRatio),
    staminaLevel: toOptionalNumber(raw.staminaLevel),
    vo2max: toOptionalNumber(raw.vo2max),
    distance: toOptionalNumber(raw.distance),
    duration: toOptionalNumber(raw.duration)
  };
}

function parseDailyMetrics(raw: Record<string, unknown>): TrainingHubDailyMetrics {
  const dayList = extractDayList(raw).map((item) =>
    parseDailyMetric(item as RawDailyMetric)
  );
  const weekList = extractArray(raw, ["weekList", "evoLab.weekList"]);

  return {
    dayList,
    weekList,
    raw
  };
}

function parseAnalytics(raw: Record<string, unknown>): TrainingHubAnalytics {
  const dayList = extractDayList(raw).map((item) =>
    parseDailyMetric(item as RawDailyMetric)
  );
  const weekList = extractArray(raw, ["weekList", "evoLab.weekList"]);
  const sportStatistics = extractSportStatistics(raw);
  const summary = pickObject(raw, ["summaryInfo"]) ?? {};

  return {
    dayList,
    weekList,
    sportStatistics,
    zoneDistributions: parseZoneDistributions(summary),
    raw
  };
}

function parseZoneDistributions(
  summary: Record<string, unknown>
): TrainingHubZoneDistributions {
  return {
    hrTrainingLoad: parseZoneDistributionEntries(summary.hrTlAreaList),
    hrDistance: parseZoneDistributionEntries(summary.hrDisAreaList),
    hrTime: parseZoneDistributionEntries(summary.hrTimeAreaList),
    distanceFrequency: parseZoneDistributionEntries(
      summary.distanceCountAreaList
    ),
    distanceTrainingLoad: parseZoneDistributionEntries(
      summary.distanceTlAreaList
    ),
    distanceTime: parseZoneDistributionEntries(summary.distanceTimeAreaList)
  };
}

function parseZoneDistributionEntries(
  raw: unknown
): TrainingHubZoneDistributionEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item): TrainingHubZoneDistributionEntry | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const entry = item as Record<string, unknown>;
      const index = toOptionalNumber(entry.index);

      if (index === undefined) {
        return null;
      }

      const ratio = toOptionalNumber(entry.ratio);
      const value = toOptionalNumber(entry.value);

      return {
        index,
        ...(ratio !== undefined ? { ratio } : {}),
        ...(value !== undefined ? { value } : {})
      };
    })
    .filter(
      (entry): entry is TrainingHubZoneDistributionEntry => entry !== null
    )
    .sort((left, right) => left.index - right.index);
}

const RECORD_TYPE_LABELS: Record<number, string> = {
  6: "3K",
  7: "1K",
  8: "1 Mile",
  9: "2 Mile",
  10: "5K",
  11: "10K",
  12: "Half Marathon",
  13: "Marathon",
  101: "Longest Run",
  102: "Best Pace"
};

const RECORD_GROUP_LABELS: Record<number, string> = {
  1: "All-time",
  2: "This year",
  3: "This month",
  4: "This week"
};

function parseTrainingDashboard(
  dashboard: TrainingHubDashboardData
): TrainingHubDashboard {
  const summary = dashboard.summaryInfo ?? {};
  const racePredictor = parseRacePredictor(summary);

  return {
    racePredictor,
    rhr: toOptionalNumber(summary.rhr),
    recoveryPct: toOptionalNumber(summary.recoveryPct),
    recoveryState: toOptionalNumber(summary.recoveryState),
    fullRecoveryHours: toOptionalNumber(summary.fullRecoveryHours),
    fitnessMaxHr: toOptionalNumber(summary.fitnessMaxHr),
    runningLevelHr: toOptionalNumber(summary.runningLevelHr),
    lthrZones: parseThresholdZones(summary.lthrZone),
    ltspZones: parseThresholdZones(summary.ltspZone),
    personalRecords: parsePersonalRecordGroups(summary.recordDetailList),
    sleepHrv: parseSleepHrvSummary(summary.sleepHrvData),
    sportDataCount: toOptionalNumber(dashboard.sportDataSummary?.count),
    raw: dashboard as Record<string, unknown>
  };
}

function parseThresholdZones(raw: unknown): TrainingHubThresholdZone[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const zones: TrainingHubThresholdZone[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const zone = item as Record<string, unknown>;
    const index = toOptionalNumber(zone.index);

    if (index === undefined) {
      continue;
    }

    zones.push({
      index,
      hr: toOptionalNumber(zone.hr),
      pace: toOptionalNumber(zone.pace),
      ratio: toOptionalNumber(zone.ratio)
    });
  }

  return zones.sort((left, right) => left.index - right.index);
}

function parsePersonalRecordGroups(raw: unknown): TrainingHubPersonalRecordGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const group = item as Record<string, unknown>;
      const type = toOptionalNumber(group.type) ?? 0;
      const recordList = extractArray(group, ["recordList"]) ?? [];

      return {
        type,
        label: RECORD_GROUP_LABELS[type] ?? `Period ${type}`,
        records: recordList.map((record) =>
          parsePersonalRecord(record as Record<string, unknown>)
        )
      };
    })
    .filter((group): group is TrainingHubPersonalRecordGroup => group !== null);
}

function parsePersonalRecord(
  raw: Record<string, unknown>
): TrainingHubPersonalRecord {
  const type = toOptionalNumber(raw.type) ?? 0;
  const duration =
    toOptionalNumber(raw.record) ?? toOptionalNumber(raw.duration);
  const distance = toOptionalNumber(raw.distance);
  let label = RECORD_TYPE_LABELS[type];

  if (!label && distance && distance > 0) {
    label =
      distance >= 1000
        ? `${(distance / 1000).toFixed(distance % 1000 === 0 ? 0 : 1)} km`
        : `${Math.round(distance)} m`;
  }

  if (!label) {
    label = pickString(raw, ["name", "site"]) ?? `Record ${type}`;
  }

  return {
    type,
    label,
    name: pickString(raw, ["name", "site"]),
    distance: distance && distance > 0 ? distance : undefined,
    duration,
    avgPace: toOptionalNumber(raw.avgPace),
    happenDay: normalizeHappenDay(raw.happenDay),
    activityId: pickString(raw, ["labelIdStr", "labelId"])
  };
}

function parseSleepHrvSummary(
  raw: unknown
): TrainingHubSleepHrvSummary | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const data = raw as Record<string, unknown>;
  const readings: TrainingHubSleepHrvReading[] = [];

  if (Array.isArray(data.sleepHrvList)) {
    for (const item of data.sleepHrvList) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const reading = item as Record<string, unknown>;
      const happenDay = normalizeHappenDay(reading.happenDay);

      if (!happenDay) {
        continue;
      }

      readings.push({
        happenDay,
        avgSleepHrv: toOptionalNumber(reading.avgSleepHrv),
        sleepHrvBase: toOptionalNumber(reading.sleepHrvBase)
      });
    }
  }

  return {
    happenDay: normalizeHappenDay(data.happenDay),
    avgSleepHrv: toOptionalNumber(data.avgSleepHrv),
    sleepHrvBase: toOptionalNumber(data.sleepHrvBase),
    remainWearDays: toOptionalNumber(data.remainWearDays),
    recentReadings: readings
  };
}

function normalizeHappenDay(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value);

  if (/^\d{8}$/.test(text)) {
    return text;
  }

  return undefined;
}

function parseRacePredictor(
  summary: Record<string, unknown>
): TrainingHubRacePredictor {
  const runScoreList = Array.isArray(summary.runScoreList)
    ? summary.runScoreList.map((item) => parseRaceScore(item as RawRaceScore))
    : [];

  return {
    staminaLevel: toOptionalNumber(summary.staminaLevel),
    recoveryPct: toOptionalNumber(summary.recoveryPct),
    aerobicEnduranceScore: toOptionalNumber(summary.aerobicEnduranceScore),
    lactateThresholdCapacityScore: toOptionalNumber(
      summary.lactateThresholdCapacityScore
    ),
    anaerobicEnduranceScore: toOptionalNumber(summary.anaerobicEnduranceScore),
    anaerobicCapacityScore: toOptionalNumber(summary.anaerobicCapacityScore),
    lthr: toOptionalNumber(summary.lthr),
    ltsp: toOptionalNumber(summary.ltsp),
    runScoreList,
    raw: summary
  };
}

function parseRaceScore(raw: RawRaceScore): TrainingHubRaceScore {
  const distance = toOptionalNumber(raw.distance);
  const predictSeconds =
    toOptionalNumber(raw.predictSecond) ??
    toOptionalNumber(raw.predictTime) ??
    toOptionalNumber(raw.time);

  return {
    distance,
    distanceLabel: formatRaceDistanceLabel(distance, raw.raceName, raw.raceType),
    predictSeconds,
    score: toOptionalNumber(raw.score),
    raw
  };
}

function parseActivityDetail(raw: Record<string, unknown>): TrainingHubActivityDetail {
  const summary = pickObject(raw, ["summaryInfo", "summary", "activitySummary"]) ?? raw;
  const lapSource =
    pickArray(raw, ["lapList", "laps", "lapInfoList"]) ??
    pickArray(summary, ["lapList", "laps", "lapInfoList"]) ??
    [];

  const laps = lapSource.map((item, index) => parseActivityLap(item, index));

  return {
    activityId: pickString(raw, ["labelId", "activityId"]) ?? pickString(summary, ["labelId", "activityId"]),
    name: pickString(raw, ["name"]) ?? pickString(summary, ["name"]),
    sportType: toOptionalNumber(raw.sportType) ?? toOptionalNumber(summary.sportType),
    startTime: toOptionalNumber(raw.startTime) ?? toOptionalNumber(summary.startTime),
    duration:
      toOptionalNumber(raw.totalTime) ??
      toOptionalNumber(raw.duration) ??
      toOptionalNumber(summary.totalTime) ??
      toOptionalNumber(summary.duration),
    distance: toOptionalNumber(raw.distance) ?? toOptionalNumber(summary.distance),
    avgHr: toOptionalNumber(raw.avgHr) ?? toOptionalNumber(summary.avgHr),
    maxHr: toOptionalNumber(raw.maxHr) ?? toOptionalNumber(summary.maxHr),
    calories: normalizeCalories(raw.calorie ?? summary.calorie),
    elevationGain:
      toOptionalNumber(raw.ascent) ??
      toOptionalNumber(raw.elevationGain) ??
      toOptionalNumber(summary.ascent) ??
      toOptionalNumber(summary.elevationGain),
    trainingLoad:
      toOptionalNumber(raw.trainingLoad) ?? toOptionalNumber(summary.trainingLoad),
    laps,
    raw
  };
}

function parseActivityLap(raw: unknown, index: number): TrainingHubActivityLap {
  if (!raw || typeof raw !== "object") {
    return { index: index + 1 };
  }

  const lap = raw as Record<string, unknown>;

  return {
    index: index + 1,
    distance: toOptionalNumber(lap.distance),
    duration:
      toOptionalNumber(lap.totalTime) ?? toOptionalNumber(lap.duration),
    avgHr: toOptionalNumber(lap.avgHr),
    maxHr: toOptionalNumber(lap.maxHr),
    pace: toOptionalNumber(lap.avgSpeed) ?? toOptionalNumber(lap.pace),
    elevationGain: toOptionalNumber(lap.ascent) ?? toOptionalNumber(lap.elevationGain)
  };
}

function extractDayList(raw: Record<string, unknown>): unknown[] {
  return extractArray(raw, [
    "dayList",
    "dayDetailList",
    "dataList",
    "evoLab.dayList",
    "evoLab.dayDetailList"
  ]);
}

function extractSportStatistics(
  raw: Record<string, unknown>
): TrainingHubSportStatistic[] {
  const list = extractArray(raw, [
    "sportStatistic",
    "sportStatistics",
    "evoLab.sportStatistic",
    "evoLab.sportStatistics"
  ]);

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      sportType: toOptionalNumber(item.sportType),
      sportName: pickString(item, ["sportName", "name"]),
      distance: toOptionalNumber(item.distance),
      duration: toOptionalNumber(item.duration),
      count: toOptionalNumber(item.count),
      trainingLoad: toOptionalNumber(item.trainingLoad)
    }));
}

function extractArray(raw: Record<string, unknown>, paths: string[]): Record<string, unknown>[] {
  for (const path of paths) {
    const value = pickPath(raw, path);
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      );
    }
  }

  return [];
}

function pickPath(raw: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = raw;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function pickObject(
  raw: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return undefined;
}

function pickArray(raw: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeCalories(value: unknown): number | undefined {
  const numeric = toOptionalNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  return numeric > 1000 ? Math.round(numeric / 1000) : Math.round(numeric);
}

function formatRaceDistanceLabel(
  distance?: number,
  raceName?: string,
  raceType?: number | string
): string | undefined {
  if (raceName?.trim()) {
    return raceName.trim();
  }

  if (distance) {
    if (distance >= 40_000) {
      return "Marathon";
    }
    if (distance >= 20_000) {
      return "Half Marathon";
    }
    if (distance >= 9_000) {
      return "10K";
    }
    if (distance >= 4_000) {
      return "5K";
    }

    return `${(distance / 1000).toFixed(1)} km`;
  }

  if (raceType !== undefined) {
    return String(raceType);
  }

  return undefined;
}

async function trainingHubGet<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  return trainingHubRequest<T>(path, { method: "GET", params });
}

async function trainingHubFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return trainingHubRequest<T>(path, options);
}

async function trainingHubRequest<T>(
  path: string,
  options: RequestInit & {
    params?: Record<string, string | number>;
  } = {}
): Promise<T> {
  const auth = getStoredAuth();
  if (!auth) {
    throw new Error("Log in to COROS Training Hub first.");
  }

  try {
    return await executeTrainingHubRequest<T>(auth, path, options);
  } catch (error) {
    const retryReason = getTrainingHubRetryReason(error);
    if (!retryReason) {
      throw error;
    }

    const resolvedBaseUrl = await resolveTrainingHubBaseUrl(
      auth.accessToken,
      auth.baseUrl
    );
    if (resolvedBaseUrl === auth.baseUrl) {
      if (retryReason === "token") {
        clearTrainingHubAuth();
        throw new Error("COROS session expired. Log in again.");
      }

      throw error;
    }

    setSetting(SETTINGS.baseUrl, resolvedBaseUrl);

    try {
      return await executeTrainingHubRequest<T>(
        { ...auth, baseUrl: resolvedBaseUrl },
        path,
        options
      );
    } catch (retryError) {
      if (retryReason === "token") {
        clearTrainingHubAuth();
        throw new Error("COROS session expired. Log in again.");
      }

      throw retryError;
    }
  }
}

async function executeTrainingHubRequest<T>(
  auth: TrainingHubAuthState,
  path: string,
  options: RequestInit & {
    params?: Record<string, string | number>;
  } = {}
): Promise<T> {
  const { params, ...requestOptions } = options;
  const url = new URL(`${auth.baseUrl}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    ...buildTrainingHubHeaders(auth.accessToken),
    ...(requestOptions.headers as Record<string, string> | undefined)
  };

  if (requestOptions.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetchJson<T>(url.toString(), {
    ...requestOptions,
    headers
  });
}

async function resolveTrainingHubBaseUrl(
  accessToken: string,
  loginBaseUrl: string
): Promise<string> {
  if (await probeTrainingHubBaseUrl(accessToken, loginBaseUrl)) {
    return loginBaseUrl;
  }

  for (const baseUrl of REGION_PROBE_URLS) {
    if (baseUrl === loginBaseUrl) {
      continue;
    }

    if (await probeTrainingHubBaseUrl(accessToken, baseUrl)) {
      return baseUrl;
    }
  }

  return (
    REGION_BASE_URLS["1"] ??
    loginBaseUrl ??
    GLOBAL_BASE_URL
  );
}

async function probeTrainingHubBaseUrl(
  accessToken: string,
  baseUrl: string
): Promise<boolean> {
  const candidates = [
    `${baseUrl}/activity/query?size=1&pageNumber=1`,
    `${baseUrl}/account/query`
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: buildTrainingHubHeaders(accessToken)
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as TrainingHubApiResponse<unknown>;
      const result = String(payload.result ?? payload.apiCode ?? "");

      if (result === RESULT_SUCCESS) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function getTrainingHubRetryReason(
  error: unknown
): "token" | "not-found" | null {
  if (error instanceof InvalidTrainingHubTokenError) {
    return "token";
  }

  if (
    error instanceof Error &&
    error.message.includes("COROS API request failed: 404")
  ) {
    return "not-found";
  }

  return null;
}

class InvalidTrainingHubTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTrainingHubTokenError";
  }
}

function isInvalidTokenMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("access token is invalid") ||
    normalized.includes("token is invalid")
  );
}

async function fetchJson<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(
      `COROS API request failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as TrainingHubApiResponse<T>;
  const result = String(payload.result ?? payload.apiCode ?? "");

  if (AUTH_ERROR_CODES.has(result)) {
    clearTrainingHubAuth();
    throw new Error("COROS session expired. Log in again.");
  }

  if (result !== RESULT_SUCCESS) {
    const message = payload.message || "COROS API request failed.";
    if (isInvalidTokenMessage(message)) {
      throw new InvalidTrainingHubTokenError(message);
    }
    throw new Error(message);
  }

  if (payload.data === undefined) {
    throw new Error("COROS API response did not include data.");
  }

  return payload.data;
}

function getStoredAuth(): TrainingHubAuthState | null {
  const accessToken = getSetting(SETTINGS.accessToken);
  const userId = getSetting(SETTINGS.userId);
  const regionId = getSetting(SETTINGS.regionId);
  const baseUrl = getSetting(SETTINGS.baseUrl);

  if (!accessToken || !userId || !regionId || !baseUrl) {
    return null;
  }

  return {
    accessToken,
    userId,
    regionId,
    baseUrl
  };
}

function buildTrainingHubHeaders(accessToken: string): Record<string, string> {
  return {
    accesstoken: accessToken,
    Accept: "application/json, text/plain, */*"
  };
}

function clearTrainingHubAuth(): void {
  deleteSettings([
    SETTINGS.accessToken,
    SETTINGS.userId,
    SETTINGS.regionId,
    SETTINGS.baseUrl
  ]);
}
