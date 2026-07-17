/**
 * Google Tasks client (separate API from Calendar — needs tasks.readonly and
 * the "Google Tasks API" enabled in the Cloud project).
 * Endpoints verified against developers.google.com/tasks/reference/rest (2026-07-17).
 */

import type { FetchLike } from "./api";

const BASE = "https://tasks.googleapis.com/tasks/v1";

export interface GTask {
  id: string;
  title?: string;
  /** RFC3339; Google Tasks only stores the DATE part meaningfully. */
  due?: string;
  status?: "needsAction" | "completed";
}

interface GTaskList {
  id: string;
  title?: string;
}

async function tFetch(token: string, path: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Tasks API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Every open task with a due date in the window, across all task lists. */
export async function listAllTasks(
  token: string,
  opts: { dueMin: string; dueMax: string },
  fetchImpl: FetchLike = fetch
): Promise<GTask[]> {
  const lists: GTaskList[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = (await tFetch(token, `/users/@me/lists?${params}`, fetchImpl)) as {
      items?: GTaskList[];
      nextPageToken?: string;
    };
    lists.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const all: GTask[] = [];
  for (const list of lists) {
    let taskPage: string | undefined;
    do {
      const params = new URLSearchParams({
        showCompleted: "false",
        dueMin: opts.dueMin,
        dueMax: opts.dueMax,
        maxResults: "100",
      });
      if (taskPage) params.set("pageToken", taskPage);
      const page = (await tFetch(
        token,
        `/lists/${encodeURIComponent(list.id)}/tasks?${params}`,
        fetchImpl
      )) as { items?: GTask[]; nextPageToken?: string };
      all.push(...(page.items ?? []));
      taskPage = page.nextPageToken;
    } while (taskPage);
  }
  return all;
}
