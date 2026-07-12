import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Profile } from '@/db/types';
import { emitMutationCommitted } from '@/db/mutationEvents';

import { queryKeys } from './keys';

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  return db.getFirstAsync<Profile>('SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL', [
    userId,
  ]);
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.profile(userId) : ['profile', 'none'],
    queryFn: () => (userId ? getProfile(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'units'>>,
): Promise<void> {
  await enqueueMutation({
    table: 'profiles',
    op: 'upsert',
    rowId: userId,
    payload: { ...patch, id: userId },
  });
  emitMutationCommitted();
}

export function useUpdateProfile(userId: string | undefined, onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Profile, 'display_name' | 'units'>>) => {
      if (!userId) throw new Error('No user');
      return updateProfile(userId, patch);
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to update profile'),
  });
}
