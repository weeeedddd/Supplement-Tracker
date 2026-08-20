import { getWorkoutSessions, type WorkoutSession } from './fitness';
import { authedGet, authedPost } from './guild';
import {
  MUSCLE_LOAD_STORAGE_KEY,
  calculateMuscleLoads,
  sanitizeMuscleLoadEntries,
  type MuscleId,
} from './muscleLoad';
import { loadUserProfile } from './profile';
import { S, dateKey } from './storage';

const DAY = 86_400_000;

export interface SocialWeeklyStats {
  activeDays: number;
  workouts: number;
  volumeKg: number;
  completedQuests: number;
}

export interface SocialLift {
  exerciseKey: string;
  name: string;
  weightKg: number;
  reps: number;
}

export interface SocialProfileView {
  uid: string;
  username: string;
  online: boolean;
  lastSeen: number;
  characterPath: string;
  activePlan: string;
  activity: { kind: string; label: string; at: number };
  streak: number;
  weekly: SocialWeeklyStats;
  topLifts: SocialLift[];
  muscleLoads: Partial<Record<MuscleId, number>>;
  achievement: string;
  gender: '' | 'male' | 'female';
  me: boolean;
}

export interface FriendRequestView {
  id: number;
  uid: string;
  username: string;
  created: number;
}

export interface SocialBuffView {
  id: number;
  kind: 'aura' | 'focus';
  created: number;
  from: { uid: string; username: string };
  seen: boolean;
}

export interface FriendsView {
  friends: SocialProfileView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  buffs: SocialBuffView[];
}

export interface PublicSocialSnapshot {
  characterPath: string;
  activePlan: string;
  activityKind: 'active' | 'workout' | 'rest' | 'quest';
  activityLabel: string;
  activityAt: number;
  streak: number;
  weekly: SocialWeeklyStats;
  topLifts: SocialLift[];
  muscleLoads: Partial<Record<MuscleId, number>>;
  achievement: string;
  gender: '' | 'male' | 'female';
}

function normalizedExerciseKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '').slice(0, 72);
}

export function buildPublicSocialSnapshot(
  sessions: WorkoutSession[] = getWorkoutSessions(),
  now = Date.now(),
): PublicSocialSnapshot {
  const profile = loadUserProfile();
  const since = now - 7 * DAY;
  const recent = sessions.filter(session => session.completedAt >= since && session.completedAt <= now);
  const activeDays = new Set(recent.map(session => dateKey(new Date(session.completedAt)))).size;
  const bestLifts = new Map<string, SocialLift>();
  recent.forEach(session => session.exercises?.forEach(exercise => {
    if (!(exercise.weightKg > 0)) return;
    const key = normalizedExerciseKey(exercise.name);
    if (!key) return;
    const current = bestLifts.get(key);
    if (!current || exercise.weightKg > current.weightKg
      || (exercise.weightKg === current.weightKg && exercise.reps > current.reps)) {
      bestLifts.set(key, {
        exerciseKey: key,
        name: exercise.name.slice(0, 80),
        weightKg: Math.round(exercise.weightKg * 10) / 10,
        reps: Math.max(0, Math.round(exercise.reps)),
      });
    }
  }));
  const latest = sessions[0];
  const hasRecentWorkout = Boolean(latest && latest.completedAt >= now - DAY);
  const loads = calculateMuscleLoads(sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY)), now);
  const streak = Math.max(0, Math.round(S.get<{ count?: number }>('streak')?.count || 0));
  const achievements = S.get<string[]>('achievements') || [];
  const equippedAchievement = S.get<string>('title_equipped') || achievements[achievements.length - 1] || '';
  const characterPath = profile?.mode === 'inspiration' ? profile.inspirationProfile || '' : '';
  const activePlan = latest?.name || S.get<{ sourceLabel?: string }>('initial_plan')?.sourceLabel || '';
  const latestStamp = latest?.completedAt || now;
  return {
    characterPath,
    activePlan: activePlan.slice(0, 120),
    activityKind: hasRecentWorkout ? (characterPath ? 'quest' : 'workout') : 'rest',
    activityLabel: hasRecentWorkout
      ? `${latest?.name || 'Workout'} completed`
      : 'Rest day',
    activityAt: latestStamp,
    streak,
    weekly: {
      activeDays,
      workouts: recent.length,
      volumeKg: Math.round(recent.reduce((sum, session) => sum + (session.totalVolumeKg || 0), 0)),
      completedQuests: recent.filter(session => Boolean(session.inspirationProfile || session.adaptationLevel)).length,
    },
    topLifts: [...bestLifts.values()].sort((a, b) => b.weightKg - a.weightKg).slice(0, 8),
    muscleLoads: loads,
    achievement: equippedAchievement.slice(0, 180),
    gender: profile?.gender === 'f' ? 'female' : profile?.gender === 'm' ? 'male' : '',
  };
}

export async function publishSocialPresence(): Promise<SocialProfileView> {
  const response = await authedPost<{ ok: boolean; profile: SocialProfileView }>(
    '/api/v1/social/profile',
    buildPublicSocialSnapshot(),
  );
  return response.profile;
}

export function fetchFriends(): Promise<FriendsView> {
  return authedGet('/api/v1/friends');
}

export function inviteFriend(identifier: string): Promise<{ ok: boolean; accepted: boolean }> {
  return authedPost('/api/v1/friends/invite', { identifier: identifier.trim() });
}

export function respondToFriend(friendshipId: number, action: 'accept' | 'decline'): Promise<{ ok: boolean }> {
  return authedPost('/api/v1/friends/respond', { friendshipId, action });
}

export function removeFriend(uid: string): Promise<{ ok: boolean }> {
  return authedPost('/api/v1/friends/remove', { uid });
}

export function sendFriendBuff(uid: string, kind: 'aura' | 'focus'): Promise<{ ok: boolean; availableAt: number }> {
  return authedPost('/api/v1/friends/buff', { uid, kind });
}

export interface CoopComparison {
  shared: Array<{ exerciseKey: string; name: string; mine: number; theirs: number; delta: number }>;
  weeklyVolume: { mine: number; theirs: number };
  workouts: { mine: number; theirs: number };
}

export function compareWithFriend(friend: SocialProfileView): CoopComparison {
  const mine = buildPublicSocialSnapshot();
  const ownLifts = new Map(mine.topLifts.map(lift => [lift.exerciseKey, lift]));
  const shared = friend.topLifts.flatMap(lift => {
    const own = ownLifts.get(lift.exerciseKey);
    return own ? [{
      exerciseKey: lift.exerciseKey,
      name: lift.name,
      mine: own.weightKg,
      theirs: lift.weightKg,
      delta: Math.round((own.weightKg - lift.weightKg) * 10) / 10,
    }] : [];
  }).sort((a, b) => Math.max(b.mine, b.theirs) - Math.max(a.mine, a.theirs));
  return {
    shared,
    weeklyVolume: { mine: mine.weekly.volumeKg, theirs: friend.weekly.volumeKg || 0 },
    workouts: { mine: mine.weekly.workouts, theirs: friend.weekly.workouts || 0 },
  };
}
