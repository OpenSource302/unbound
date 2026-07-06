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

const DEFAULT_RELAYS = ['ws://127.0.0.1:7777', 'wss://relay.damus.io', 'wss://nos.lol'];

type Page = 'home' | 'explore' | 'profile';
type AuthMode = 'signup' | 'signin';

const IconHome = () => (
  <svg viewBox="0 0 24 24"><path d="M12 9.5L7.5 14h9L12 9.5zM12 2L1 12h3v9h7v-6h2v6h7v-9h3L12 2z" /></svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24"><path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904l4.96 4.96 1.06-1.06-4.96-4.96A6.456 6.456 0 0010.25 3.75zm-5 6.5c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5-5-2.24-5-5z" /></svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24"><path d="M5.651 19h12.698c-.337-2.374-2.017-4.36-4.45-5.1A6.5 6.5 0 0012 11.5a6.5 6.5 0 00-5.199 2.4c-2.433.74-4.113 2.726-4.45 5.1zM12 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z" /></svg>
);
const IconLike = () => (
  <svg viewBox="0 0 24 24"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" /></svg>
);
const IconRepost = () => (
  <svg viewBox="0 0 24 24"><path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.784 1.75 1.75 1.75H13V20H7.75A3.25 3.25 0 014.5 16.75V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25A3.25 3.25 0 0119.5 7.25v8.37l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L17 15.62V7.25c0-.97-.784-1.75-1.75-1.75z" /></svg>
);
const IconLogo = () => (
  <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);

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
        <IconLogo />
      </div>
      <div className="auth-form-col">
        <div className="auth-box">
          <h1><IconLogo /></h1>
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
  const [feedTab, setFeedTab] = useState<'for-you' | 'following'>('for-you');
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [content, setContent] = useState('');
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
  const homePosts = useMemo(() => homeTimeline(ctx), [ctx]);

  const feedPosts = useMemo(() => {
    if (page === 'explore' || feedTab === 'for-you') {
      const byId = new Map(events.map((e) => [e.id, e]));
      return hotPosts.map((r) => byId.get(r.eventId)).filter((e): e is NostrEvent => !!e);
    }
    return homePosts;
  }, [page, feedTab, hotPosts, homePosts, events]);

  const publishRegistration = useCallback(
    async (key: Uint8Array, pub: string, user: string, name: string) => {
      const usernameEvt = await signEvent(buildUsernameEvent(pub, user), key);
      const profileEvt = await signEvent(buildProfileEvent(pub, user, name || user), key);
      pool.publish(usernameEvt);
      pool.publish(profileEvt);
      setEvents((prev) => [...prev, usernameEvt, profileEvt]);
      setRegistered(true);
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
    if (!secretKey || !pubkey || !content.trim()) return;
    const signed = await signEvent(buildPost(content.trim(), pubkey), secretKey);
    pool.publish(signed);
    setEvents((prev) => [...prev, signed]);
    setContent('');
  }, [secretKey, pubkey, content, pool]);

  const likePost = useCallback(
    async (postId: string, author: string) => {
      if (!secretKey || !pubkey) return;
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
      const signed = await signEvent(unsigned, secretKey);
      pool.publish(signed);
      setEvents((prev) => [...prev, signed]);
    },
    [secretKey, pubkey, pool],
  );

  const repostPost = useCallback(
    async (postId: string, author: string) => {
      if (!secretKey || !pubkey) return;
      const unsigned = createUnsignedEvent({
        kind: KIND.REPOST,
        pubkey,
        content: '',
        tags: [
          ['e', postId],
          ['p', author],
        ],
      });
      const signed = await signEvent(unsigned, secretKey);
      pool.publish(signed);
      setEvents((prev) => [...prev, signed]);
    },
    [secretKey, pubkey, pool],
  );

  const followUser = useCallback(
    async (target: string) => {
      if (!secretKey || !pubkey || target === pubkey) return;
      const unsigned = createUnsignedEvent({
        kind: KIND.FOLLOW,
        pubkey,
        content: '',
        tags: [['p', target]],
      });
      const signed = await signEvent(unsigned, secretKey);
      pool.publish(signed);
      setEvents((prev) => [...prev, signed]);
    },
    [secretKey, pubkey, pool],
  );

  const muteUser = useCallback(
    async (target: string) => {
      if (!secretKey || !pubkey) return;
      const unsigned = createUnsignedEvent({
        kind: KIND.MUTE,
        pubkey,
        content: '',
        tags: [['p', target]],
      });
      const signed = await signEvent(unsigned, secretKey);
      pool.publish(signed);
      setEvents((prev) => [...prev, signed]);
    },
    [secretKey, pubkey, pool],
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
    const iLiked = events.some(
      (e) =>
        e.kind === KIND.REACTION &&
        e.pubkey === pubkey &&
        e.tags.find((t) => t[0] === 'e')?.[1] === post.id,
    );
    const iReposted = events.some(
      (e) =>
        e.kind === KIND.REPOST &&
        e.pubkey === pubkey &&
        e.tags.find((t) => t[0] === 'e')?.[1] === post.id,
    );

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
          <div className="tweet-actions">
            <button
              className={`tweet-action ${iReposted ? 'reposted' : ''}`}
              onClick={() => repostPost(post.id, post.pubkey)}
            >
              <IconRepost /> {eng.reposts || ''}
            </button>
            <button
              className={`tweet-action ${iLiked ? 'liked' : ''}`}
              onClick={() => likePost(post.id, post.pubkey)}
            >
              <IconLike /> {eng.likes || ''}
            </button>
            {post.pubkey !== pubkey && !follows.has(post.pubkey) && (
              <button className="tweet-action" onClick={() => followUser(post.pubkey)}>
                Follow
              </button>
            )}
            {post.pubkey !== pubkey && (
              <button className="tweet-action" onClick={() => muteUser(post.pubkey)} title="Hide from your feed only">
                Mute
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand"><IconLogo /></div>
        <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <IconHome /><span className="nav-label">Home</span>
        </button>
        <button className={`nav-item ${page === 'explore' ? 'active' : ''}`} onClick={() => setPage('explore')}>
          <IconSearch /><span className="nav-label">Explore</span>
        </button>
        <button className={`nav-item ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>
          <IconUser /><span className="nav-label">Profile</span>
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
                className={`top-tab ${feedTab === 'for-you' ? 'active' : ''}`}
                onClick={() => setFeedTab('for-you')}
              >
                For you
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
                placeholder="What's happening?"
                maxLength={280}
                rows={3}
              />
            </div>
            <div className="compose-actions">
              <button className="tweet-btn" onClick={publishPost} disabled={!content.trim()}>
                Post
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
                  : 'No posts yet. Be the first — the community decides what\'s hot.'}
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