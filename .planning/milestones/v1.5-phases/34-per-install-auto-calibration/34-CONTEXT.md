# Phase 34: Per-Install Auto-Calibration - Context

## Goal

Turn the Phase 33 measure-only shadow outcomes into a bounded, reproducible per-install calibration file without mutating the curated mode map or mixing runtime epochs.

## Decisions

- Use the existing shadow-log schema as the only evidence source; count accepted routes as the activation floor and keep rejected/no_signal counts in the evidence envelope.
- Use a Beta posterior centered on the shipped thresholds, then apply explicit 70/30 damping and a maximum 0.05 per-boundary hysteresis before clamping to valid threshold ranges.
- Persist `{manifest_fingerprint, mode_map_version, corpus_hash}` with the derived thresholds. A mismatched fingerprint or mode-map version falls back to mode-map defaults.
- Write the calibration file atomically and preserve the previous thresholds as the rollback baseline. Invalid or insufficient evidence never replaces the active file.
- Adding/removing capabilities already changes the fingerprint and cache key from Phase 30; Phase 34 consumes that epoch rather than adding another watcher path.

## Deferred

- No new external dependency, network classifier, or UI surface.
- No per-project calibration; that remains Phase 35.
