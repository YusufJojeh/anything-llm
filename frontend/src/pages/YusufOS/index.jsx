import React from "react";
import {
  YusufOSProvider,
  useYusufOS,
} from "@/features/yusufOS/state/YusufOSProvider";
import OSShell from "@/features/yusufOS/components/OSShell";
import { CommandSessionProvider } from "@/features/yusufOS/state/CommandSession";
import { registerYusufOSTranslations } from "@/features/yusufOS/i18n";

/**
 * Root of the `/os` experience.
 *
 * Deliberately *not* wrapped in AnythingLLM's `PrivateRoute`. Yusuf OS is
 * authenticated by its own control plane — localhost plus the control token —
 * and the Gate B contract is explicit that AnythingLLM's single-user auth is
 * not valid authority here. Reaching this route without a session shows the
 * unlock screen and nothing else; no projection is fetched until the server
 * has verified the token.
 *
 * `/` and every existing AnythingLLM route are untouched.
 */
registerYusufOSTranslations();

/**
 * The command transcript is scoped to one unlocked session: locking (or
 * losing the session) remounts the provider, so nothing from before the lock
 * reappears after the next unlock.
 */
function SessionScopedCommands({ children }) {
  const { session } = useYusufOS();
  return (
    <CommandSessionProvider key={session}>{children}</CommandSessionProvider>
  );
}

export default function YusufOSRoot() {
  return (
    <YusufOSProvider>
      {/* One command session for the whole /os tab: the transcript and the
          last approval survive navigating to a task or approval and back. */}
      <SessionScopedCommands>
        <OSShell />
      </SessionScopedCommands>
    </YusufOSProvider>
  );
}
