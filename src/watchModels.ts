import type { WatchModelId, WatchStatus } from "../electron/types";
import nomadHero from "../public/assets/nomad-hero.webp";
import pace3Hero from "../public/assets/pace-3-hero.webp";
import pace4Hero from "../public/assets/pace-4-hero.webp";
import paceProHero from "../public/assets/pace-pro-hero.webp";

export const PACE_PRO_BYTES = 32 * 1024 * 1024 * 1024;
export const PACE_4_BYTES = 4 * 1024 * 1024 * 1024;
export const PACE_3_BYTES = PACE_4_BYTES;
export const NOMAD_BYTES = PACE_PRO_BYTES;

export type WatchPresentationState =
  | "disconnected"
  | "connected-known"
  | "connected-unknown";

export type WatchFeatureIcon = "display" | "weight" | "battery";

export interface WatchFeature {
  icon: WatchFeatureIcon;
  label: string;
}

export interface WatchPresentation {
  state: WatchPresentationState;
  model?: WatchModelId;
  displayName: string;
  companion: string;
  connectHint: string;
  heroImage?: string;
  heroAlt?: string;
  capacityLabel?: string;
  fallbackBytes?: number;
  productName?: string;
  tagline?: string;
  features?: WatchFeature[];
}

const DISCONNECTED_PRESENTATION: WatchPresentation = {
  state: "disconnected",
  displayName: "Not connected",
  companion: "Connect your COROS watch to get started",
  connectHint: "Connect your COROS watch via USB to sync music",
};

const CONNECTED_UNKNOWN_PRESENTATION: WatchPresentation = {
  state: "connected-unknown",
  displayName: "COROS Watch",
  companion: "Your COROS watch is connected",
  connectHint: "",
};

const MODEL_PRESENTATION: Record<
  WatchModelId,
  Omit<WatchPresentation, "state"> & { state: "connected-known" }
> = {
  "pace-pro": {
    state: "connected-known",
    model: "pace-pro",
    displayName: "COROS Pace Pro",
    productName: "Pace Pro",
    tagline: "Crafted for Performance",
    companion: "Your Pace Pro companion",
    connectHint: "",
    heroImage: paceProHero,
    heroAlt: "COROS Pace Pro",
    capacityLabel: "32 GB Pace Pro capacity fallback",
    fallbackBytes: PACE_PRO_BYTES,
    features: [
      { icon: "display", label: "Bright AMOLED Display" },
      { icon: "weight", label: "38g Ultralight Design" },
      { icon: "battery", label: "38 Hours Full GPS" },
    ],
  },
  "pace-4": {
    state: "connected-known",
    model: "pace-4",
    displayName: "COROS Pace 4",
    productName: "Pace 4",
    tagline: "Train Without Limits",
    companion: "Your Pace 4 companion",
    connectHint: "",
    heroImage: pace4Hero,
    heroAlt: "COROS Pace 4",
    capacityLabel: "4 GB Pace 4 capacity fallback",
    fallbackBytes: PACE_4_BYTES,
    features: [
      { icon: "display", label: "Bright AMOLED Display" },
      { icon: "weight", label: "Lightweight Build" },
      { icon: "battery", label: "38 Hours Full GPS" },
    ],
  },
  "pace-3": {
    state: "connected-known",
    model: "pace-3",
    displayName: "COROS Pace 3",
    productName: "Pace 3",
    tagline: "Built to Go the Distance",
    companion: "Your Pace 3 companion",
    connectHint: "",
    heroImage: pace3Hero,
    heroAlt: "COROS Pace 3",
    capacityLabel: "4 GB Pace 3 capacity fallback",
    fallbackBytes: PACE_3_BYTES,
    features: [
      { icon: "display", label: "Always-On MIP Display" },
      { icon: "weight", label: "39g Lightweight Build" },
      { icon: "battery", label: "38 Hours Full GPS" },
    ],
  },
  nomad: {
    state: "connected-known",
    model: "nomad",
    displayName: "COROS Nomad",
    productName: "Nomad",
    tagline: "Ready for Any Adventure",
    companion: "Your Nomad companion",
    connectHint: "",
    heroImage: nomadHero,
    heroAlt: "COROS Nomad",
    capacityLabel: "32 GB Nomad capacity fallback",
    fallbackBytes: NOMAD_BYTES,
    features: [
      { icon: "display", label: "Bright AMOLED Display" },
      { icon: "weight", label: "Rugged Trail Build" },
      { icon: "battery", label: "Multi-Day GPS Battery" },
    ],
  },
};

export function getWatchPresentation(
  watchStatus: WatchStatus | null
): WatchPresentation {
  if (!watchStatus?.connected) {
    return DISCONNECTED_PRESENTATION;
  }

  if (watchStatus.model) {
    return MODEL_PRESENTATION[watchStatus.model];
  }

  return CONNECTED_UNKNOWN_PRESENTATION;
}
