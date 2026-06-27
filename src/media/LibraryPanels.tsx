import type { ReactNode } from "react";
import { Loader2, Music, Trash2, Upload } from "lucide-react";
import type { LocalTrack, WatchStatus, WatchTrack } from "../../electron/types";
import { getWatchPresentation } from "../watchModels";
import {
  formatBytes,
  isLocalTrackOnWatch,
  sumBytes,
} from "./libraryUtils";

interface LibrarySyncLayoutProps {
  localPanel: ReactNode;
  watchPanel: ReactNode;
  pendingCount: number;
  localCount: number;
  watchConnected: boolean;
}

export function LibrarySyncLayout({
  localPanel,
  watchPanel,
  pendingCount,
  localCount,
  watchConnected,
}: LibrarySyncLayoutProps) {
  return (
    <div className="library-sync-grid">
      {localPanel}
      <LibraryConnector
        pendingCount={pendingCount}
        localCount={localCount}
        watchConnected={watchConnected}
      />
      {watchPanel}
    </div>
  );
}

function LibraryConnector({
  pendingCount,
  localCount,
  watchConnected,
}: {
  pendingCount: number;
  localCount: number;
  watchConnected: boolean;
}) {
  let label = watchConnected ? "Watch connected" : "Connect watch";
  if (watchConnected && pendingCount > 0) {
    label = `${pendingCount} to sync`;
  } else if (watchConnected && pendingCount === 0 && localCount > 0) {
    label = "All synced";
  }

  return (
    <div className="library-connector" aria-hidden="true">
      <span className="library-connector-line" />
      <span
        className={
          watchConnected && pendingCount === 0
            ? "library-connector-pill ready"
            : "library-connector-pill"
        }
      >
        {label}
      </span>
      <span className="library-connector-line" />
    </div>
  );
}

interface LocalLibraryPanelProps {
  downloads: LocalTrack[];
  watchTracks: WatchTrack[];
  watchConnected: boolean;
  busy: string | null;
  selectedIds: Set<string>;
  allSelected: boolean;
  pendingTransferCount: number;
  canTransferAll: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onTransfer: (id: string) => void;
  onTransferAll: () => void;
  onDeleteDownload: (track: LocalTrack) => void;
  onDeleteDownloads: (tracks: LocalTrack[]) => void;
}

export function LocalLibraryPanel({
  downloads,
  watchTracks,
  watchConnected,
  busy,
  selectedIds,
  allSelected,
  pendingTransferCount,
  canTransferAll,
  onToggleSelect,
  onToggleSelectAll,
  onTransfer,
  onTransferAll,
  onDeleteDownload,
  onDeleteDownloads,
}: LocalLibraryPanelProps) {
  const someSelected = selectedIds.size > 0;
  const selectedTracks = downloads.filter((track) => selectedIds.has(track.id));
  const totalSize = sumBytes(downloads);

  function handleBulkDelete() {
    if (selectedTracks.length === 0) {
      return;
    }

    onDeleteDownloads(selectedTracks);
  }

  return (
    <section className="library-panel library-panel--local" aria-label="Local cache">
      <header className="library-panel-header">
        <div>
          <span className="library-panel-eyebrow">CorosLink</span>
          <h3>Local cache</h3>
        </div>
        <em>
          {downloads.length} track{downloads.length === 1 ? "" : "s"} ·{" "}
          {formatBytes(totalSize)}
        </em>
      </header>

      <div className="library-panel-actions">
        {someSelected ? (
          <button
            className="secondary-button danger-button"
            type="button"
            disabled={busy === "delete-local-bulk"}
            onClick={handleBulkDelete}
          >
            {busy === "delete-local-bulk" ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <Trash2 size={17} aria-hidden="true" />
            )}
            Delete selected ({selectedIds.size})
          </button>
        ) : canTransferAll ? (
          <button
            className="primary-button"
            type="button"
            disabled={busy?.startsWith("transfer") ?? false}
            onClick={onTransferAll}
          >
            {busy === "transfer-all" ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <Upload size={17} aria-hidden="true" />
            )}
            Transfer all ({pendingTransferCount})
          </button>
        ) : (
          <span className="library-panel-hint">
            {downloads.length === 0
              ? "Download tracks from YouTube or Spotify"
              : `${pendingTransferCount} not on watch`}
          </span>
        )}
      </div>

      {downloads.length > 0 ? (
        <div className="library-selection-bar">
          <label className="library-select-all">
            <input
              type="checkbox"
              aria-label="Select all local tracks"
              checked={allSelected}
              onChange={onToggleSelectAll}
            />
            Select all
          </label>
        </div>
      ) : null}

      <div className="library-track-stack">
        {downloads.length === 0 ? (
          <LibraryEmptyState title="No local tracks" />
        ) : (
          downloads.map((track) => {
            const onWatch = isLocalTrackOnWatch(
              track,
              watchTracks,
              watchConnected,
            );
            const selected = selectedIds.has(track.id);
            const fileName =
              track.filePath.split(/[/\\]/).pop() ?? track.title;

            return (
              <div
                key={track.id}
                className={selected ? "library-track-row is-selected" : "library-track-row"}
              >
                <input
                  type="checkbox"
                  className="library-track-select"
                  aria-label={`Select ${track.title}`}
                  checked={selected}
                  onChange={() => onToggleSelect(track.id)}
                />
                <span className="library-track-art library-track-art--local" aria-hidden="true" />
                <span className="library-track-meta">
                  <strong>{track.title}</strong>
                  <small>{fileName}</small>
                </span>
                <span className="library-track-size">{formatBytes(track.sizeBytes)}</span>
                <span
                  className={onWatch ? "badge ready library-track-status" : "badge library-track-status"}
                >
                  {onWatch ? "Synced" : "Not synced"}
                </span>
                <div className="library-track-actions">
                  <button
                    className="icon-button"
                    type="button"
                    title="Transfer to watch"
                    disabled={
                      !watchConnected ||
                      onWatch ||
                      busy === `transfer:${track.id}` ||
                      busy === "transfer-all"
                    }
                    onClick={() => onTransfer(track.id)}
                  >
                    {busy === `transfer:${track.id}` ? (
                      <Loader2 className="spin" size={17} aria-hidden="true" />
                    ) : (
                      <Upload size={17} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    title="Delete local track"
                    disabled={
                      busy === `delete-local:${track.id}` ||
                      busy === "delete-local-bulk"
                    }
                    onClick={() => onDeleteDownload(track)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

interface WatchLibraryPanelProps {
  watchStatus: WatchStatus | null;
  watchConnected: boolean;
  busy: string | null;
  selectedPaths: Set<string>;
  allSelected: boolean;
  onToggleSelect: (relativePath: string) => void;
  onToggleSelectAll: () => void;
  onDeleteWatchTrack: (track: WatchTrack) => void;
  onDeleteWatchTracks: (tracks: WatchTrack[]) => void;
}

export function WatchLibraryPanel({
  watchStatus,
  watchConnected,
  busy,
  selectedPaths,
  allSelected,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteWatchTrack,
  onDeleteWatchTracks,
}: WatchLibraryPanelProps) {
  const watchTracks = watchStatus?.tracks ?? [];
  const presentation = getWatchPresentation(watchStatus);
  const someSelected = selectedPaths.size > 0;
  const selectedTracks = watchTracks.filter((track) =>
    selectedPaths.has(track.relativePath),
  );
  const totalSize = sumBytes(watchTracks);
  const storageLabel =
    watchStatus?.usedBytes != null
      ? `${formatBytes(watchStatus.usedBytes)} used`
      : formatBytes(totalSize);

  function handleBulkDelete() {
    if (selectedTracks.length === 0) {
      return;
    }

    onDeleteWatchTracks(selectedTracks);
  }

  return (
    <section className="library-panel library-panel--watch" aria-label="On watch">
      <header className="library-panel-header">
        <div>
          <span className="library-panel-eyebrow">
            {presentation.displayName}
          </span>
          <h3>On watch</h3>
        </div>
        <em>
          {watchConnected
            ? `${watchTracks.length} track${watchTracks.length === 1 ? "" : "s"} · ${storageLabel}`
            : "Not connected"}
        </em>
      </header>

      <div className="library-panel-actions">
        {someSelected ? (
          <button
            className="secondary-button danger-button"
            type="button"
            disabled={busy === "delete-watch-bulk"}
            onClick={handleBulkDelete}
          >
            {busy === "delete-watch-bulk" ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <Trash2 size={17} aria-hidden="true" />
            )}
            Delete selected ({selectedPaths.size})
          </button>
        ) : (
          <span className="library-panel-hint">
            {!watchConnected
              ? presentation.connectHint || "Connect your watch via USB"
              : watchTracks.length === 0
                ? "No MP3 files on the watch"
                : "Select tracks to delete from watch"}
          </span>
        )}
      </div>

      {!watchConnected ? (
        <LibraryEmptyState title="Connect a COROS watch" />
      ) : watchTracks.length > 0 ? (
        <>
          <div className="library-selection-bar">
            <label className="library-select-all">
              <input
                type="checkbox"
                aria-label="Select all watch tracks"
                checked={allSelected}
                onChange={onToggleSelectAll}
              />
              Select all
            </label>
          </div>
          <div className="library-track-stack">
            {watchTracks.map((track) => {
              const selected = selectedPaths.has(track.relativePath);

              return (
                <div
                  key={track.relativePath}
                  className={
                    selected ? "library-track-row is-selected" : "library-track-row"
                  }
                >
                  <input
                    type="checkbox"
                    className="library-track-select"
                    aria-label={`Select ${track.name}`}
                    checked={selected}
                    onChange={() => onToggleSelect(track.relativePath)}
                  />
                  <span className="library-track-art library-track-art--watch" aria-hidden="true" />
                  <span className="library-track-meta">
                    <strong>{track.name}</strong>
                    <small>{track.relativePath}</small>
                  </span>
                  <span className="library-track-size">{formatBytes(track.sizeBytes)}</span>
                  <span className="badge ready library-track-status">On watch</span>
                  <div className="library-track-actions">
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Delete from watch"
                      disabled={
                        !watchConnected ||
                        busy === `delete-watch:${track.relativePath}` ||
                        busy === "delete-watch-bulk"
                      }
                      onClick={() => onDeleteWatchTrack(track)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <LibraryEmptyState title="No MP3 files on the watch" />
      )}
    </section>
  );
}

function LibraryEmptyState({ title }: { title: string }) {
  return (
    <div className="library-empty-state">
      <Music size={24} aria-hidden="true" />
      <strong>{title}</strong>
    </div>
  );
}
