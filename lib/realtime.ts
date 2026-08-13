import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

export type RealtimeSyncCallback = (table: string, eventType: string, payload: any) => void;

/**
 * Subscribes to Supabase Realtime changes on comics, reading_progress, and collections tables.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToLibraryRealtime(onSync: RealtimeSyncCallback): () => void {
  let channel: RealtimeChannel | null = null;

  try {
    const supabase = getSupabaseClient();
    const channelName = `realtime_library_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comics' },
        (payload) => {
          console.log('[Realtime] comics table event:', payload.eventType, payload);
          onSync('comics', payload.eventType, payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reading_progress' },
        (payload) => {
          console.log('[Realtime] reading_progress table event:', payload.eventType, payload);
          onSync('reading_progress', payload.eventType, payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collections' },
        (payload) => {
          console.log('[Realtime] collections table event:', payload.eventType, payload);
          onSync('collections', payload.eventType, payload);
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status [${channelName}]:`, status);
      });
  } catch (err) {
    console.warn('[Realtime] Failed to initialize subscription:', err);
  }

  return () => {
    if (channel) {
      try {
        const supabase = getSupabaseClient();
        supabase.removeChannel(channel);
        console.log('[Realtime] Channel removed successfully');
      } catch (err) {
        console.warn('[Realtime] Failed to remove channel:', err);
      }
    }
  };
}
