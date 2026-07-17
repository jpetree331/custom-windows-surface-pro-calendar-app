/**
 * Google Identity Services (GIS) token-model OAuth — fully client-side.
 * Only a public client id is needed (no server, no client secret); the access
 * token lives in memory/sessionStorage on Jo's device. Gate B default:
 * `calendar.events` scope = import events/birthdays AND create events with
 * attendees (the "share to a contact" flow). Narrow to
 * calendar.events.readonly for strict import-only.
 */

// Scope names verified against developers.google.com/workspace/calendar/api/auth (2026-07-08).
// - calendar.events: read/create events on calendars we know by id
// - calendar.readonly: LIST her calendars, so appointments on secondary
//   calendars import too (calendar.events alone can't enumerate them)
// - tasks.readonly: import Google Tasks as To-Do items
// - drive.appdata: hidden per-app Drive folder for cloud backup (only sees
//   files this app created)
export const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/drive.appdata",
].join(" ");

const GIS_SRC = "https://accounts.google.com/gsi/client";
const TOKEN_KEY = "jotter.gtoken";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
          }): { requestAccessToken(opts?: { prompt?: string }) : void };
        };
      };
    };
  }
}

export function googleClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

/** Cached token if it has >60s of life left. */
export function cachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw) as { token: string; exp: number };
    return exp - Date.now() > 60_000 ? token : null;
  } catch {
    return null;
  }
}

/** Get an access token, prompting the user on first use. */
export async function getAccessToken(): Promise<string> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new Error(
      "Google is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local (see docs/google-setup.md)."
    );
  }
  const cached = cachedToken();
  if (cached) return cached;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(`Google auth failed: ${resp.error ?? "no token"}`));
          return;
        }
        try {
          sessionStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({ token: resp.access_token, exp: Date.now() + resp.expires_in * 1000 })
          );
        } catch {
          // sessionStorage unavailable — token stays usable for this call chain
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}
