// Currently-playing track, falling back to recently-played.
import type { Env } from '../index';
import { getSpotifyAccessToken } from '../auth';

export interface SpotifyTrack {
  track: string;
  artist: string;
}
export interface SpotifyData {
  playing: SpotifyTrack | null;
  recent: SpotifyTrack[];
}
export interface SpotifyResult extends SpotifyData {
  ok: boolean;
}

function artists(item: any): string {
  return (item?.artists ?? []).map((a: any) => a.name).join(', ');
}

export async function fetchSpotify(env: Env): Promise<SpotifyResult> {
  try {
    const token = await getSpotifyAccessToken(env);
    const auth = { Authorization: `Bearer ${token}` };

    const now = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: auth,
    });

    if (now.status === 200) {
      const data = (await now.json()) as any;
      if (data?.item) {
        return {
          ok: true,
          playing: { track: data.item.name, artist: artists(data.item) },
          recent: [],
        };
      }
    }

    // 204 (nothing playing) or no item -> recently played.
    const recentRes = await fetch(
      'https://api.spotify.com/v1/me/player/recently-played?limit=4',
      { headers: auth }
    );
    if (!recentRes.ok) return { ok: false, playing: null, recent: [] };

    const recentData = (await recentRes.json()) as any;
    const recent: SpotifyTrack[] = (recentData.items ?? []).map((i: any) => ({
      track: i.track?.name ?? '',
      artist: artists(i.track),
    }));

    return { ok: true, playing: null, recent };
  } catch {
    return { ok: false, playing: null, recent: [] };
  }
}
