"use client";

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type FeedVideo = {
  videoId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
};

export function FeedApp() {
  const { data: session, status } = useSession();
  const [videos, setVideos] = useState<FeedVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feed");
      if (res.status === 401) {
        setVideos([]);
        setError("Session expired. Sign in again.");
        return;
      }
      const data = (await res.json()) as {
        videos?: FeedVideo[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load feed");
        setVideos([]);
        return;
      }
      setVideos(data.videos ?? []);
    } catch {
      setError("Network error");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && !session?.error) {
      setLoading(true);
      void loadFeed();
    }
    if (status === "unauthenticated") {
      setVideos(null);
      setError(null);
      setLoading(false);
    }
  }, [status, session?.error, loadFeed]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Subscriptions only
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Sign in with Google to see the latest videos from your YouTube
            subscriptions. Thumbnails and titles only — tap to open in YouTube.
          </p>
        </div>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Continue with Google
        </button>
      </div>
    );
  }

  if (session?.error === "RefreshAccessTokenError") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24">
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Your session could not be refreshed. Please sign in again.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm dark:border-zinc-600"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Subscriptions
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadFeed()}
            disabled={loading}
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline disabled:opacity-50 dark:hover:text-zinc-300"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-6">
        {error && (
          <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {status === "authenticated" && videos === null && !error && (
          <p className="text-center text-sm text-zinc-500">Loading feed…</p>
        )}
        {!loading && videos && videos.length === 0 && !error && (
          <p className="text-center text-sm text-zinc-500">
            No videos found. Add subscriptions on YouTube, then refresh.
          </p>
        )}
        {videos && videos.length > 0 && (
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.videoId}>
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
                  className="group block overflow-hidden rounded-lg border border-zinc-200/90 bg-white shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-900">
                    <Image
                      src={v.thumbnailUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="px-3 py-3">
                    <p className="mb-1 line-clamp-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {v.channelTitle}
                    </p>
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-900 group-hover:underline dark:text-zinc-100">
                      {v.title}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
