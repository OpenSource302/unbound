import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NostrEvent, UserProfile } from '@unbound/core';
import {
  RelayPool,
  buildPost,
  signEvent,
  generateSecretKey,
  getPublicKey,
  rankHotPosts,
  homeTimeline,
  latestTimeline,
  countEngagement,
  computeAlgoHash,
  KIND,
  buildUsernameEvent,
  buildProfileEvent,
  buildProfilesIndex,
  validateUsername,
  validatePasscode,
  normalizeUsername,
  createUnsignedEvent,
} from '@unbound/core';
import {
  saveAccount,
  loadAccount,
  getSessionUsername,
  clearSession,
  hasLocalAccount,
} from './key-store';
import {
  IconExplore,
  IconHome,
  IconFollow,
  IconLike,
  IconLogo,
  IconMute,
  IconProfile,
  IconRepost,
  UnboundLogo,
} from './icons';

const LOCAL_RELAY = 'ws://127.0.0.1:7777';
const DEFAULT_RELAYS = [LOCAL_RELAY, 'wss://relay.damus.io', 'wss://nos.lol'];

type Page = 'home' | 'explore' | 'profile';
type AuthMode = 'signup' | 'signin';

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function profileFor(pubkey: string, profiles: Map<string, UserProfile>): UserProfile {
  return (
    profiles.get(pubkey) ?? {
      pubkey,
      username: pubkey.slice(0, 8),
      displayName: pubkey.slice(0, 8),
    }
  );
}

function AuthScreen({
  onAuthed,
}: {
  onAuthed: (key: Uint8Array, username: string, displayName: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    const uErr = validateUsername(username);
    if (uErr) return setError(uErr);
    const pErr = validatePasscode(passcode);
    if (pErr) return setError(pErr);

    setLoading(true);
    try {
      const u = normalizeUsername(username);

      if (mode === 'signup') {
        if (passcode !== confirm) throw new Error('Passcodes do not match');
        if (hasLocalAccount(u)) throw new Error(`@${u} already exists on this device`);

        const secretKey = generateSecretKey();
        await saveAccount(u, secretKey, passcode);
        onAuthed(secretKey, u, displayName.trim() || u);
      } else {
        const secretKey = await loadAccount(u, passcode);
        await saveAccount(u, secretKey, passcode);
        onAuthed(secretKey, u, u);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <UnboundLogo size={120} />
      </div>
      <div className="auth-form-col">
        <div className="auth-box">
          <h1 className="auth-wordmark">
            <UnboundLogo size={36} />
            <span>Unbound</span>
          </h1>
          <h2>{mode === 'signup' ? 'Create your account' : 'Sign in to Unbound'}</h2>
          {error && <div className="auth-error">{error}</div>}
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourname"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Passcode</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Your passcode (keys stay encrypted locally)"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
          {mode === 'signup' && (
            <>
              <div className="field">
                <label>Confirm passcode</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>Display name (optional)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you appear on Unbound"
                />
              </div>
            </>
          )}
          <button className="auth-primary" onClick={submit} disabled={loading}>
            {loading ? '...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p className="auth-switch">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}>
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          <p style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Your username is public on the network. Your passcode encrypts your cryptographic key on this device —
            no company holds your password. Nobody can censor your account; only you control your keys.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [username, setUsername] = useState<string | null>(getSessionUsername());
  const [page, setPage] = useState<Page>('home');
  const [feedTab, setFeedTab] = useState<'latest' | 'for-you' | 'following'>('latest');
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [busyActions, setBusyActions] = useState<Set<string>>(() => new Set());
  const [registered, setRegistered] = useState(false);

  const pubkey = useMemo(
    () => (secretKey ? getPublicKey(secretKey) : null),
    [secretKey],
  );

  const pool = useMemo(() => new RelayPool(DEFAULT_RELAYS), []);

  useEffect(() => {
    pool.connect();
    const subId = 'unbound-main';
    pool.onMessage((msg) => {
      if (msg[0] === 'EVENT') {
        const event = msg[2] as NostrEvent;
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [...prev, event]));
      }
    });
    pool.subscribe(subId, {
      kinds: [0, 1, 3, 5, 6, 7, KIND.USERNAME],
      limit: 1000,
    });
    return () => pool.close(subId);
  }, [pool]);

  const profiles = useMemo(() => buildProfilesIndex(events), [events]);

  const follows = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.kind === 3 && e.pubkey === pubkey) {
        const p = e.tags.find((t) => t[0] === 'p')?.[1];
        if (p) set.add(p);
      }
    }
    return set;
  }, [events, pubkey]);

  const mutes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.kind === 5 && e.pubkey === pubkey) {
        const p = e.tags.find((t) => t[0] === 'p')?.[1];
        if (p) set.add(p);
      }
    }
    return set;
  }, [events, pubkey]);

  const ctx = useMemo(
    () => ({
      viewer: pubkey ?? '',
      events,
      follows,
      mutes,
      blocks: new Set<string>(),
    }),
    [pubkey, events, follows, mutes],
  );

  const engagement = useMemo(() => countEngagement(events), [events]);
  const hotPosts = useMemo(() => rankHotPosts(ctx), [ctx]);
  const latestPosts = useMemo(() => latestTimeline(ctx), [ctx]);
  const homePosts = useMemo(() => homeTimeline(ctx), [ctx]);

  const feedPosts = useMemo(() => {
    if (page === 'explore') {
      return latestPosts;
    }
    if (feedTab === 'for-you') {
      const byId = new Map(events.map((e) => [e.id, e]));
      return hotPosts.map((r) => byId.get(r.eventId)).filter((e): e is NostrEvent => !!e);
    }
    if (feedTab === 'following') {
      return homePosts;
    }
    return latestPosts;
  }, [page, feedTab, hotPosts, latestPosts, homePosts, events]);

  const publishRegistration = useCallback(
    async (key: Uint8Array, pub: string, user: string, name: string) => {
      const usernameEvt = await signEvent(buildUsernameEvent(pub, user), key);
      const profileEvt = await signEvent(buildProfileEvent(pub, user, name || user), key);
      const userResult = await pool.publish(usernameEvt, { relays: [LOCAL_RELAY] });
      const profileResult = await pool.publish(profileEvt, { relays: [LOCAL_RELAY] });
      setEvents((prev) => [...prev, usernameEvt, profileEvt]);
      setRegistered(userResult.ok || profileResult.ok);
    },
    [pool],
  );

  const onAuthed = useCallback(
    async (key: Uint8Array, user: string, name: string) => {
      const pub = getPublicKey(key);
      setSecretKey(key);
      setUsername(user);
      await publishRegistration(key, pub, user, name);
    },
    [publishRegistration],
  );

  const publishPost = useCallback(async () => {
    if (!secretKey || !pubkey || !content.trim() || posting) return;
    setPosting(true);
    setPostError('');
    try {
      const signed = await signEvent(buildPost(content.trim(), pubkey), secretKey);
      const result = await pool.publish(signed, { relays: [LOCAL_RELAY] });
      if (!result.ok) {
        throw new Error(result.reason || 'Relay did not accept your post');
      }
      setEvents((prev) => [signed, ...prev.filter((e) => e.id !== signed.id)]);
      setContent('');
      setFeedTab('latest');
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not publish post');
    } finally {
      setPosting(false);
    }
  }, [secretKey, pubkey, content, pool, posting]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<NostrEvent | null>) => {
      if (busyActions.has(key)) return;
      setBusyActions((prev) => new Set(prev).add(key));
      try {
        const signed = await fn();
        if (!signed) return;
        const result = await pool.publish(signed, { relays: [LOCAL_RELAY] });
        if (!result.ok) return;
        setEvents((prev) => (prev.some((e) => e.id === signed.id) ? prev : [...prev, signed]));
      } finally {
        setBusyActions((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [busyActions, pool],
  );

  const hasLiked = useCallback(
    (postId: string) =>
      events.some(
        (e) =>
          e.kind === KIND.REACTION &&
          e.pubkey === pubkey &&
          e.tags.find((t) => t[0] === 'e')?.[1] === postId,
      ),
    [events, pubkey],
  );

  const hasReposted = useCallback(
    (postId: string) =>
      events.some(
        (e) =>
          e.kind === KIND.REPOST &&
          e.pubkey === pubkey &&
          e.tags.find((t) => t[0] === 'e')?.[1] === postId,
      ),
    [events, pubkey],
  );

  const likePost = useCallback(
    async (postId: string, author: string) => {
      if (!secretKey || !pubkey || hasLiked(postId)) return;
      await runAction(`like:${postId}`, async () => {
        const unsigned = createUnsignedEvent({
          kind: KIND.REACTION,
          pubkey,
          content: '+',
          tags: [
            ['e', postId],
            ['p', author],
            ['k', 'like'],
          ],
        });
        return signEvent(unsigned, secretKey);
      });
    },
    [secretKey, pubkey, hasLiked, runAction],
  );

  const repostPost = useCallback(
    async (postId: string, author: string) => {
      if (!secretKey || !pubkey || hasReposted(postId)) return;
      await runAction(`repost:${postId}`, async () => {
        const unsigned = createUnsignedEvent({
          kind: KIND.REPOST,
          pubkey,
          content: '',
          tags: [
            ['e', postId],
            ['p', author],
          ],
        });
        return signEvent(unsigned, secretKey);
      });
    },
    [secretKey, pubkey, hasReposted, runAction],
  );

  const followUser = useCallback(
    async (target: string) => {
      if (!secretKey || !pubkey || target === pubkey || follows.has(target)) return;
      await runAction(`follow:${target}`, async () => {
        const unsigned = createUnsignedEvent({
          kind: KIND.FOLLOW,
          pubkey,
          content: '',
          tags: [['p', target]],
        });
        return signEvent(unsigned, secretKey);
      });
    },
    [secretKey, pubkey, follows, runAction],
  );

  const muteUser = useCallback(
    async (target: string) => {
      if (!secretKey || !pubkey || mutes.has(target)) return;
      await runAction(`mute:${target}`, async () => {
        const unsigned = createUnsignedEvent({
          kind: KIND.MUTE,
          pubkey,
          content: '',
          tags: [['p', target]],
        });
        return signEvent(unsigned, secretKey);
      });
    },
    [secretKey, pubkey, mutes, runAction],
  );

  const signOut = () => {
    clearSession();
    setSecretKey(null);
    setUsername(null);
    setRegistered(false);
  };

  if (!secretKey || !pubkey || !username) {
    return <AuthScreen onAuthed={onAuthed} />;
  }

  const me = profileFor(pubkey, profiles);

  const renderTweet = (post: NostrEvent) => {
    const author = profileFor(post.pubkey, profiles);
    const eng = engagement.get(post.id) ?? { likes: 0, reposts: 0 };
    const iLiked = hasLiked(post.id);
    const iReposted = hasReposted(post.id);
    const iFollow = follows.has(post.pubkey);
    const iMuted = mutes.has(post.pubkey);
    const isOwn = post.pubkey === pubkey;
    const likeBusy = busyActions.has(`like:${post.id}`);
    const repostBusy = busyActions.has(`repost:${post.id}`);
    const followBusy = busyActions.has(`follow:${post.pubkey}`);
    const muteBusy = busyActions.has(`mute:${post.pubkey}`);

    return (
      <article key={post.id} className="tweet">
        <div className="avatar">{author.displayName[0]?.toUpperCase() ?? '?'}</div>
        <div className="tweet-body">
          <div className="tweet-header">
            <span className="tweet-name">{author.displayName}</span>
            <span className="tweet-handle">@{author.username}</span>
            <span className="tweet-handle">·</span>
            <span className="tweet-time">{timeAgo(post.created_at)}</span>
          </div>
          <div className="tweet-text">{post.content}</div>
          <div className={`tweet-actions${isOwn ? ' own-post' : ''}`}>
            <button
              type="button"
              className={`tweet-action action-repost${iReposted ? ' reposted' : ''}`}
              onClick={() => void repostPost(post.id, post.pubkey)}
              disabled={iReposted || repostBusy}
              aria-label={iReposted ? 'Reposted' : 'Repost'}
              title={iReposted ? 'You reposted this' : 'Repost'}
            >
              <IconRepost />
              {eng.reposts > 0 && <span className="action-count">{eng.reposts}</span>}
            </button>
            <button
              type="button"
              className={`tweet-action action-like${iLiked ? ' liked' : ''}`}
              onClick={() => void likePost(post.id, post.pubkey)}
              disabled={iLiked || likeBusy}
              aria-label={iLiked ? 'Liked' : 'Like'}
              title={iLiked ? 'You liked this' : 'Like'}
            >
              <IconLike />
              {eng.likes > 0 && <span className="action-count">{eng.likes}</span>}
            </button>
            {!isOwn && (
              <>
                <button
                  type="button"
                  className={`tweet-action action-follow${iFollow ? ' following' : ''}`}
                  onClick={() => void followUser(post.pubkey)}
                  disabled={iFollow || followBusy}
                  aria-label={iFollow ? 'Following' : 'Follow user'}
                  title={iFollow ? 'Following' : 'Follow'}
                >
                  <IconFollow />
                </button>
                <button
                  type="button"
                  className={`tweet-action action-mute${iMuted ? ' muted' : ''}`}
                  onClick={() => void muteUser(post.pubkey)}
                  disabled={iMuted || muteBusy}
                  aria-label={iMuted ? 'Muted' : 'Mute user'}
                  title={iMuted ? 'Muted — hidden from your feed' : 'Mute — hide from your feed only'}
                >
                  <IconMute />
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand">
          <IconLogo size={28} />
          <span className="brand-text">Unbound</span>
        </div>
        <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <IconHome /><span className="nav-label">Home</span>
        </button>
        <button className={`nav-item ${page === 'explore' ? 'active' : ''}`} onClick={() => setPage('explore')}>
          <IconExplore /><span className="nav-label">Explore</span>
        </button>
        <button className={`nav-item ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>
          <IconProfile /><span className="nav-label">Profile</span>
        </button>
        <button className="post-btn" onClick={() => setPage('home')}>
          <span className="post-btn-text">Post</span>
        </button>
        <div className="me-box" onClick={signOut} title="Sign out">
          <div className="avatar">{me.displayName[0]?.toUpperCase()}</div>
          <div>
            <div className="display-name">{me.displayName}</div>
            <div className="handle">@{me.username}</div>
          </div>
        </div>
      </aside>

      <main className="main-col">
        {page === 'home' && (
          <>
            <div className="top-tabs">
              <button
                className={`top-tab ${feedTab === 'latest' ? 'active' : ''}`}
                onClick={() => setFeedTab('latest')}
              >
                Latest
              </button>
              <button
                className={`top-tab ${feedTab === 'for-you' ? 'active' : ''}`}
                onClick={() => setFeedTab('for-you')}
              >
                Hot
              </button>
              <button
                className={`top-tab ${feedTab === 'following' ? 'active' : ''}`}
                onClick={() => setFeedTab('following')}
              >
                Following
              </button>
            </div>
            <div className="compose">
              <div className="avatar lg">{me.displayName[0]?.toUpperCase()}</div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void publishPost();
                  }
                }}
                placeholder="Share something with the network..."
                maxLength={280}
                rows={3}
              />
            </div>
            <div className="compose-actions">
              {postError && <div className="compose-error">{postError}</div>}
              <button
                className="tweet-btn"
                onClick={() => void publishPost()}
                disabled={!content.trim() || posting}
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
            {feedTab === 'for-you' && (
              <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                Trending by community engagement — most likes and reposts rise to the top. No corporate algorithm.
              </p>
            )}
            {feedPosts.length === 0 ? (
              <div className="empty-state">
                {feedTab === 'following'
                  ? 'Follow people to see their posts here.'
                  : feedTab === 'for-you'
                    ? 'No posts yet. Be the first — the community decides what\'s hot.'
                    : 'No posts yet. Write something above to get started.'}
              </div>
            ) : (
              feedPosts.map(renderTweet)
            )}
          </>
        )}

        {page === 'explore' && (
          <>
            <div className="top-tabs">
              <button className="top-tab active">Explore</button>
            </div>
            {hotPosts.length === 0 ? (
              <div className="empty-state">Nothing trending yet. Like and repost posts you love.</div>
            ) : (
              hotPosts
                .map((r) => events.find((e) => e.id === r.eventId))
                .filter((e): e is NostrEvent => !!e)
                .map(renderTweet)
            )}
          </>
        )}

        {page === 'profile' && (
          <>
            <div className="top-tabs">
              <button className="top-tab active">Profile</button>
            </div>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div className="avatar lg" style={{ width: 80, height: 80, fontSize: 32 }}>
                  {me.displayName[0]?.toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800 }}>{me.displayName}</h2>
                  <p className="handle">@{me.username}</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                    Key-backed account · {registered ? 'registered on network' : 'syncing...'}
                  </p>
                </div>
              </div>
            </div>
            {events
              .filter((e) => e.kind === KIND.POST && e.pubkey === pubkey)
              .sort((a, b) => b.created_at - a.created_at)
              .map(renderTweet)}
          </>
        )}
      </main>

      <aside className="right-rail">
        <input className="search-box" placeholder="Search Unbound" disabled />
        <div className="trends-card">
          <div className="trends-header">What's happening</div>
          {hotPosts.slice(0, 8).map((r) => {
            const post = events.find((e) => e.id === r.eventId);
            if (!post) return null;
            const author = profileFor(post.pubkey, profiles);
            const eng = engagement.get(post.id);
            return (
              <div key={r.eventId} className="trend-row" onClick={() => { setPage('home'); setFeedTab('for-you'); }}>
                <div className="trend-meta">Trending · Community</div>
                <div className="trend-title">@{author.username}</div>
                <div className="trend-count">
                  {post.content.slice(0, 60)}{post.content.length > 60 ? '…' : ''}
                </div>
                <div className="trend-count">
                  {(eng?.likes ?? 0)} likes · {(eng?.reposts ?? 0)} reposts
                </div>
              </div>
            );
          })}
          {hotPosts.length === 0 && (
            <div className="trend-row">
              <div className="trend-meta">Unbound</div>
              <div className="trend-title">Like & repost to set trends</div>
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Rank algo: {computeAlgoHash()} — likes + 2× reposts. Mutes are personal. No one can remove your posts.
        </p>
      </aside>
    </div>
  );
}