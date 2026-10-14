/**
 * Full-bleed wall surface (design.md D13; specs/web-ui "Full-Bleed Wall
 * Rendering"; specs/wall-display "Named Wall Profiles", "Profile Changes
 * Reach Open Walls", "Always-On Operation"). `App.tsx` renders this outside the
 * app shell, so it owns the whole viewport — no header, navigation, or footer.
 *
 * Fetches the profile by name, then rides the shared data-layer stream: this
 * component opens no `EventSource` of its own (the pure decision helpers live
 * in `wall/live.ts`). On a `wall` event naming this profile it re-fetches for
 * `created`/`updated` and switches to the deleted state for `deleted`, so an
 * edit saved in the editor appears on the open wall without a reload. On a
 * network drop the store marks the transport degraded, falls back to polling,
 * and re-reads its snapshot when the stream reopens — no reload — and this
 * view re-reads its own profile on that restore, since a `wall` event may have
 * been missed while disconnected. The clock widget is client-derived, so it is
 * unaffected either way.
 *
 * A profile that has never existed (a 404, distinct from a transport failure)
 * and one deleted while open both render an explanation with a route to the
 * editor, never a blank panel. A failed refetch of an already-loaded profile
 * likewise never blanks the wall: the last-good composition keeps rendering
 * and the error is shown as a dismissible banner over it.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
 */
import { ChevronLeft, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWallOrNull } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { backToWallPath, wallsPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import type { WallProfile } from "../types.js";
import { Button, Card, IconButton, Spinner, Stack } from "../ui/index.js";
import { wallErrorIsFatal, wallEventKindForProfile, wallViewState } from "../wall/live.js";
import { WallGrid } from "../wall/WallGrid.js";
import { WALL_CARD_GLYPH_SIZE, wallAffordanceStyle } from "../wall/widgets/card-vocab.js";

export function WallView({ name }: { name: string }) {
  const { basePath, origin } = useRouter();
  const { subscribe, transport } = useDataStore();
  // Where this wall was opened from, when that was another wall (design.md D11;
  // specs/wall-display "Wall Navigation"): a wall reached from a link offers a way
  // back, a deep link offers none.
  const backTo = backToWallPath(origin, basePath);

  const [profile, setProfile] = useState<WallProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await fetchWallOrNull(name);
      setError(null);
      if (loaded === null) {
        setProfile(null);
        setNotFound(true);
      } else {
        setProfile(loaded);
        setNotFound(false);
        setDeleted(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this wall");
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      const kind = wallEventKindForProfile(event, name);
      if (kind === "created" || kind === "updated") {
        void load();
      } else if (kind === "deleted") {
        setProfile(null);
        setNotFound(false);
        setError(null);
        setDeleted(true);
      }
    });
  }, [subscribe, name, load]);

  // Inherit the store's reconnect-then-resnapshot (design.md D11): a drop marks
  // the transport degraded, and on restore it returns to "live". Re-read this
  // wall's profile then, since a `wall` event may have been missed while
  // disconnected. The wall opens no stream of its own — this is the only
  // recovery step it adds on top of the shared store's own re-snapshot.
  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous === "degraded" && transport === "live") void load();
  }, [transport, load]);

  if (error !== null && wallErrorIsFatal(profile)) {
    return (
      <div className="h-dvh w-screen p-4">
        <div role="alert" className="rounded-tile border border-danger/40 bg-danger/10 p-4">
          <p className="font-semibold text-ink">Wall unavailable</p>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  const state = wallViewState({ profile, notFound, deleted });

  if (state === "ready" && profile !== null) {
    // A refetch failure must not blank an already-rendered wall: keep the
    // last-good composition (the clock needs no connection) and surface the
    // error over it, dismissibly (specs/wall-display "Always-On Operation").
    return (
      <div className="relative h-dvh w-screen">
        {error !== null && (
          <div
            role="alert"
            className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 rounded-tile border border-stale/40 bg-stale/10 p-3"
          >
            <div>
              <p className="font-semibold text-ink">Could not refresh this wall</p>
              <p className="text-sm text-muted">{error}</p>
            </div>
            <IconButton label="Dismiss" size="sm" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        <WallGrid config={profile.config} />
        {backTo !== null && (
          // The on-screen way back for a wall opened from a link (design.md D11;
          // specs/wall-display "Wall Navigation"): a touch-sized Hearth
          // affordance over the composition, so the hierarchy is walkable by
          // touch and not only by the browser's own back. It sits at the foot of
          // the panel, clear of the readouts a wall places along its top edge and
          // of the refetch banner above.
          <Link
            to={backTo}
            style={{
              ...wallAffordanceStyle(),
              position: "absolute",
              bottom: "var(--hearth-space-4)",
              left: "var(--hearth-space-4)",
              zIndex: 20,
              textDecoration: "none",
            }}
          >
            <ChevronLeft size={WALL_CARD_GLYPH_SIZE} aria-hidden />
            Back
          </Link>
        )}
      </div>
    );
  }

  if (state === "unknown" || state === "deleted") {
    return (
      <div className="grid h-dvh w-screen place-items-center p-4">
        <Card className="max-w-[460px] p-6">
          <Stack gap={2}>
            <h2 className="font-display text-xl font-bold text-ink">
              {state === "deleted" ? "Wall deleted" : "Wall not found"}
            </h2>
            <p className="text-sm text-muted">
              {state === "deleted"
                ? `The "${name}" wall profile was deleted while this panel was open. Create a profile with this name to bring it back.`
                : `No wall profile named "${name}" exists. Create it in the wall editor, then open it at this address.`}
            </p>
            {backTo !== null && (
              // A link to a profile that does not exist lands here, so the
              // explanation itself offers the way back to the wall the link was
              // followed from (design.md D11; specs/wall-display "A broken link
              // is explained").
              <Button asChild variant="soft" size="sm" className="self-start">
                <Link to={backTo}>Back to the previous wall</Link>
              </Button>
            )}
            <Button asChild variant="soft" size="sm" className="self-start">
              <Link to={wallsPath(basePath)}>Open the wall editor</Link>
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid h-dvh w-screen place-items-center">
      <Spinner />
    </div>
  );
}
