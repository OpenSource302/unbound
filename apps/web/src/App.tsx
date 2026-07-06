import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NostrEvent } from '@unbound/core';
import {
  RelayPool,
  buildPost,
  signEvent,
  generateSecretKey,
  getPublicKey,
  bytesToHex,
  hexToBytes,
  rankPosts,
  computeAlgoHash,
  KIND,
  currentEpoch,
  parseEngagementReceipts,
  computeEpochPayout,
} from '@unbound/core';

const DEFAULT_RELAYS = [
  'ws://127.0.0.1:7777',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

type Tab = 'feed' | 'trending' | 'payouts' | 'settings';

function loadKey(): Uint8Array | null {
  const stored = localStorage.getItem('UNBOUND_nsec');
  if (!stored) return null;
  try {
    return hexToBytes(stored);
  } catch {
    return null;
  }
}

function saveKey(key: Uint8Array): void {
  localStorage.setItem('UNBOUND_nsec', bytesToHex(key));
}

export default function App() {
  const [tab, setTab] = useState<Tab>('feed');
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(loadKey);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [content, setContent] = useState('');
  const [relays, setRelays] = useState(DEFAULT_RELAYS);
  const [relayInput, setRelayInput] = useState('');
  const [connected, setConnected] = useState(false);

  const pubkey = useMemo(
    () => (secretKey ? getPublicKey(secretKey) : null),
    [secretKey],
  );

  const pool = useMemo(() => new RelayPool(relays), [relays]);

  useEffect(() => {
    pool.connect();
    setConnected(true);

    const subId = 'unbound-feed';
    pool.onMessage((msg) => {
      if (msg[0] === 'EVENT') {
        const event = msg[2] as NostrEvent;
        setEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event];
        });
      }
    });

    pool.subscribe(subId, {
      kinds: [1, 3, 5, 6, 7, KIND.TRUST, KIND.STAKE, KIND.ENGAGEMENT, KIND.PAYOUT_ROOT],
      limit: 500,
    });

    return () => pool.close(subId);
  }, [pool]);

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
      if (e.kind === 5) {
        const p = e.tags.find((t) => t[0] === 'p')?.[1];
        if (p) set.add(p);
      }
    }
    return set;
  }, [events]);

  const stakes = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (e.kind === KIND.STAKE) {
        const amt = parseInt(e.tags.find((t) => t[0] === 'amt')?.[1] ?? '0', 10);
        map.set(e.pubkey, (map.get(e.pubkey) ?? 0) + amt);
      }
    }
    return map;
  }, [events]);

  const ranked = useMemo(() => {
    if (!pubkey) return [];
    return rankPosts({
      viewer: pubkey,
      events,
      follows,
      mutes,
      blocks: new Set(),
      stakes,
    });
  }, [events, follows, mutes, pubkey, stakes]);

  const feedPosts = useMemo(() => {
    const byId = new Map(events.map((e) => [e.id, e]));
    return ranked
      .map((r) => byId.get(r.eventId))
      .filter((e): e is NostrEvent => !!e);
  }, [ranked, events]);

  const payoutPreview = useMemo(() => {
    const receipts = parseEngagementReceipts(events);
    const epoch = currentEpoch();
    const epochReceipts = receipts.filter((r) => r.epoch === epoch);
    if (epochReceipts.length === 0) return null;
    return computeEpochPayout({
      grossSats: 1_000_000,
      receipts: epochReceipts,
      relayWork: [],
      gatewaySpend: new Map([['gateway', 150_000]]),
      devRecipients: [{ pubkey: 'dev', weight: 1 }],
      poolPubkey: 'unbound-pool-main',
      epoch,
    });
  }, [events]);

  const login = useCallback(() => {
    const key = generateSecretKey();
    saveKey(key);
    setSecretKey(key);
  }, []);

  const importKey = useCallback((hex: string) => {
    try {
      const key = hexToBytes(hex.trim());
      saveKey(key);
      setSecretKey(key);
    } catch {
      alert('Invalid hex key');
    }
  }, []);

  const publishPost = useCallback(async () => {
    if (!secretKey || !pubkey || !content.trim()) return;
    const unsigned = buildPost(content.trim(), pubkey);
    const signed = await signEvent(unsigned, secretKey);
    pool.publish(signed);
    setEvents((prev) => [...prev, signed]);
    setContent('');
  }, [secretKey, pubkey, content, pool]);

  const addRelay = useCallback(() => {
    if (relayInput && !relays.includes(relayInput)) {
      setRelays((r) => [...r, relayInput]);
      setRelayInput('');
    }
  }, [relayInput, relays]);

  if (!secretKey || !pubkey) {
    return (
      <div className="main" style={{ maxWidth: 420, marginTop: '10vh' }}>
        <div className="logo">Unbound</div>
        <p className="tagline">Open Twitter. No censorship. Creators with stake.</p>
        <div className="card">
          <p>Your identity is a cryptographic keypair. No company can ban you. Creators earn from real engagement.</p>
          <button className="btn" onClick={login} style={{ width: '100%', marginTop: '1rem' }}>
            Generate New Identity
          </button>
          <div style={{ marginTop: '1rem' }}>
            <input
              type="password"
              placeholder="Or paste nsec hex..."
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') importKey((e.target as HTMLInputElement).value);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Unbound</div>
        <p className="tagline">no censorship · creators with stake</p>
        <nav className="nav">
          {(['feed', 'trending', 'payouts', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="identity">
          <div style={{ color: 'var(--accent)', marginBottom: 4 }}>YOUR PUBKEY</div>
          {pubkey.slice(0, 16)}...{pubkey.slice(-8)}
        </div>
      </aside>

      <main className="main">
        {tab === 'feed' && (
          <>
            <div className="compose">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's happening?"
                maxLength={500}
              />
              <button className="btn" onClick={publishPost} disabled={!content.trim()}>
                Post
              </button>
            </div>
            {feedPosts.length === 0 ? (
              <div className="empty">Your feed is empty. Post something — you own this space.</div>
            ) : (
              feedPosts.map((post) => (
                <article key={post.id} className="card">
                  <div className="author">{post.pubkey.slice(0, 12)}...</div>
                  <div className="content">{post.content}</div>
                  <div className="meta">
                    {new Date(post.created_at * 1000).toLocaleString()} · score{' '}
                    {ranked.find((r) => r.eventId === post.id)?.score.toFixed(1)}
                  </div>
                </article>
              ))
            )}
          </>
        )}

        {tab === 'trending' && (
          <div className="card">
            <h3>Trending (local UnboundRank)</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Algo: {computeAlgoHash().slice(0, 12)}... — computed on your device, not by a server.
            </p>
            {ranked.slice(0, 20).map((r) => (
              <div key={r.eventId} className="stat">
                <span>{r.eventId.slice(0, 12)}...</span>
                <span className="value">{r.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'payouts' && (
          <div className="card">
            <h3>Revenue Pool (Epoch {currentEpoch()})</h3>
            {!payoutPreview ? (
              <p className="empty">No engagement receipts this epoch yet.</p>
            ) : (
              <>
                <div className="stat">
                  <span>Rule hash</span>
                  <span className="value">{payoutPreview.ruleHash.slice(0, 12)}...</span>
                </div>
                <div className="stat">
                  <span>Creator root</span>
                  <span className="value">{payoutPreview.creatorRoot.slice(0, 12)}...</span>
                </div>
                <div className="stat">
                  <span>Relay root</span>
                  <span className="value">{payoutPreview.relayRoot.slice(0, 12)}...</span>
                </div>
                {[...payoutPreview.creatorPayouts.entries()].map(([pk, amt]) => (
                  <div key={pk} className="stat">
                    <span>{pk.slice(0, 12)}...</span>
                    <span className="value">{amt.toLocaleString()} sats</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="card">
            <h3>Relays</h3>
            {relays.map((r) => (
              <div key={r} className="stat">
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>{r}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={relayInput}
                onChange={(e) => setRelayInput(e.target.value)}
                placeholder="ws://..."
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                }}
              />
              <button className="btn btn-secondary" onClick={addRelay}>
                Add
              </button>
            </div>
          </div>
        )}
      </main>

      <aside className="panel">
        <h3>Network</h3>
        <div className="stat">
          <span>Relays</span>
          <span className="value">{relays.length}</span>
        </div>
        <div className="stat">
          <span>Events</span>
          <span className="value">{events.length}</span>
        </div>
        <div className="stat">
          <span>Status</span>
          <span className="value">{connected ? 'live' : '...'}</span>
        </div>
        <h3 style={{ marginTop: '2rem' }}>Pool Split</h3>
        <div className="stat"><span>Creators</span><span className="value">50%</span></div>
        <div className="stat"><span>Relays</span><span className="value">30%</span></div>
        <div className="stat"><span>Gateway</span><span className="value">15%</span></div>
        <div className="stat"><span>Dev fund</span><span className="value">5%</span></div>
      </aside>
    </div>
  );
}