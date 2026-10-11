/**
 * Full-bleed wall surface (design.md D3, D9, D11; specs/web-ui "Full-Bleed
 * Wall Rendering"; specs/wall-display "Named Wall Profiles", "Profile Changes
 * Reach Open Walls", "Always-On Operation"). `App.tsx` renders this outside
 * `AppShell`, so it owns the whole viewport — no header, navigation, or footer.
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
 */
import { Alert, Box, Button, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWallOrNull } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { wallsPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import type { WallProfile } from "../types.js";
import { wallErrorIsFatal, wallEventKindForProfile, wallViewState } from "../wall/live.js";
import { WallGrid } from "../wall/WallGrid.js";

export function WallView({ name }: { name: string }) {
  const { basePath } = useRouter();
  const { subscribe, transport } = useDataStore();

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
      <Box h="100dvh" w="100vw" p="md">
        <Alert color="red" title="Wall unavailable">
          {error}
        </Alert>
      </Box>
    );
  }

  const state = wallViewState({ profile, notFound, deleted });

  if (state === "ready" && profile !== null) {
    // A refetch failure must not blank an already-rendered wall: keep the
    // last-good composition (the clock needs no connection) and surface the
    // error over it, dismissibly (specs/wall-display "Always-On Operation").
    return (
      <Box h="100dvh" w="100vw" style={{ position: "relative" }}>
        {error !== null && (
          <Alert
            color="yellow"
            title="Could not refresh this wall"
            withCloseButton
            onClose={() => setError(null)}
            style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 10 }}
          >
            {error}
          </Alert>
        )}
        <WallGrid config={profile.config} />
      </Box>
    );
  }

  if (state === "unknown" || state === "deleted") {
    return (
      <Box h="100dvh" w="100vw" p="md" style={{ display: "grid", placeItems: "center" }}>
        <Paper withBorder p="xl" radius="md" maw={460}>
          <Stack gap="sm">
            <Title order={3}>{state === "deleted" ? "Wall deleted" : "Wall not found"}</Title>
            <Text c="dimmed" size="sm">
              {state === "deleted"
                ? `The "${name}" wall profile was deleted while this panel was open. Create a profile with this name to bring it back.`
                : `No wall profile named "${name}" exists. Create it in the wall editor, then open it at this address.`}
            </Text>
            <Link to={wallsPath(basePath)} style={{ textDecoration: "none" }}>
              <Button variant="light" size="sm">
                Open the wall editor
              </Button>
            </Link>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return (
    <Box h="100dvh" w="100vw" style={{ display: "grid", placeItems: "center" }}>
      <Loader size="sm" />
    </Box>
  );
}
