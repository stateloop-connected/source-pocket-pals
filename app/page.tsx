'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Flower2,
  RotateCw,
  Shuffle,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
  X,
  Box,
  Hand,
  CheckCheck,
} from 'lucide-react';
import {
  CREATURES,
  RARITIES,
  STORAGE_KEY,
  emptyCollection,
  readCollection,
  rollDrop,
  awardDrops,
  type Collection,
  type Creature,
  type Drop,
} from './gumball/collection';
import { Sprite } from './gumball/Sprite';
type Phase = 'idle' | 'winding' | 'travel' | 'opening';
type Filter = 'all' | 'owned' | 'shiny';
export default function Home() {
  const [collection, setCollection] = useState<Collection>(emptyCollection),
    [phase, setPhase] = useState<Phase>('idle'),
    [ready, setReady] = useState(false),
    [machineReady, setMachineReady] = useState(false),
    [fallback, setFallback] = useState(false),
    [artReady, setArtReady] = useState(false),
    [artError, setArtError] = useState(false);
  const [batch, setBatch] = useState<1 | 3>(1),
    [results, setResults] = useState<Drop[]>([]),
    [active, setActive] = useState(0),
    [muted, setMuted] = useState(true),
    [storageError, setStorageError] = useState(false),
    [filter, setFilter] = useState<Filter>('all'),
    [rarityFilter, setRarityFilter] = useState('all'),
    [peek, setPeek] = useState<{ pal: Creature; shiny: boolean } | null>(null),
    [message, setMessage] = useState(''),
    [petPulse, setPetPulse] = useState(0),
    [flight, setFlight] = useState<CSSProperties>({});
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    reveal = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const machine = useRef<ReturnType<
      typeof import('./gumball/machine-scene').createMachineScene
    > | null>(null),
    data = useRef(collection),
    phaseRef = useRef<Phase>('idle'),
    locked = useRef(false),
    storageFailed = useRef(false),
    reduced = useRef(false),
    mutedRef = useRef(true),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    audio = useRef<AudioContext | null>(null),
    mounted = useRef(true);
  const api = useRef<{
    spin: (count?: 1 | 3) => Promise<unknown>;
    snapshot: () => unknown;
    pet: () => void;
  }>({ spin: async () => {}, snapshot: () => ({}), pet: () => {} });
  const busy = phase !== 'idle',
    current = results[active],
    pal = CREATURES.find((c) => c.id === current?.creatureId),
    unique = Object.keys(collection.counts).length,
    total = Object.values(collection.counts).reduce((a, b) => a + b, 0),
    shinyTotal = Object.values(collection.shinies).reduce((a, b) => a + b, 0),
    shinyUnique = Object.keys(collection.shinies).filter(
      (k) => collection.shinies[k] > 0,
    ).length;
  const setStage = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(
      setTimeout(() => {
        if (mounted.current) fn();
      }, ms),
    );
  };
  const persist = (next: Collection) => {
    data.current = next;
    setCollection(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      storageFailed.current = true;
      setStorageError(true);
    }
  };
  const latest = () => {
    if (storageFailed.current) return data.current;
    try {
      return readCollection(localStorage.getItem(STORAGE_KEY));
    } catch {
      storageFailed.current = true;
      setStorageError(true);
      return data.current;
    }
  };
  const withLock = async (fn: () => void) => {
    if (locked.current) return;
    locked.current = true;
    try {
      if (navigator.locks)
        await navigator.locks.request('pocket-pals-collection', fn);
      else fn();
    } finally {
      locked.current = false;
    }
  };
  const tone = (notes: number[], spacing = 0.09) => {
    if (mutedRef.current) return;
    try {
      const ctx = audio.current || (audio.current = new AudioContext());
      void ctx.resume();
      notes.forEach((hz, i) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain(),
          t = ctx.currentTime + i * spacing;
        o.type = 'sine';
        o.frequency.value = hz;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.007);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.24);
      });
    } catch {}
  };
  const snapshot = () => ({
    phase: phaseRef.current,
    ready: ready && artReady && (machineReady || fallback),
    total: Object.values(data.current.counts).reduce((a, b) => a + b, 0),
    unique: Object.keys(data.current.counts).length,
    shinyTotal: Object.values(data.current.shinies).reduce((a, b) => a + b, 0),
    counts: data.current.counts,
    shinies: data.current.shinies,
    recent: data.current.recent.slice(-3).map((d) => ({
      ...d,
      name: CREATURES.find((c) => c.id === d.creatureId)?.name,
      rarity: CREATURES.find((c) => c.id === d.creatureId)?.rarity,
    })),
  });
  const spin = async (count: 1 | 3 = batch) => {
    if (![1, 3].includes(count)) throw Error('Choose one or three capsules.');
    if (
      !ready ||
      !artReady ||
      (!machineReady && !fallback) ||
      phaseRef.current !== 'idle' ||
      locked.current
    )
      throw Error('The machine is still turning.');
    await withLock(() => {
      if (!mounted.current) return;
      const random = new Uint32Array(count * 3);
      crypto.getRandomValues(random);
      const drops = Array.from({ length: count }, (_, i) =>
        rollDrop(
          random[i * 3] / 4294967296,
          random[i * 3 + 1] / 4294967296,
          random[i * 3 + 2] / 4294967296,
          crypto.randomUUID(),
        ),
      );
      const awarded = awardDrops(latest(), drops);
      persist(awarded.collection);
      setResults(awarded.awarded);
      setActive(0);
      setPetPulse(0);
      setBatch(count);
      setStage('winding');
      machine.current?.spin();
      setMessage(`Turning for ${count} capsule${count === 1 ? '' : 's'}.`);
      tone([220, 277, 330], 0.11);
      const finish = () => {
        setStage('idle');
        machine.current?.finish();
        const first = awarded.awarded[0],
          c = CREATURES.find((c) => c.id === first.creatureId)!;
        setMessage(
          `${count === 3 ? 'Three pals' : c.name} automatically collected. ${first.shiny ? 'A shiny discovery!' : ''}`,
        );
        tone(
          first.shiny
            ? [523, 659, 784, 1047, 1319]
            : c.rarity === 'legendary'
              ? [392, 523, 659, 784, 1047]
              : [523, 659, 784],
          0.1,
        );
      };
      if (reduced.current) {
        later(finish, 220);
        return;
      }
      later(() => {
        if (stage.current && host.current && reveal.current) {
          const a = stage.current.getBoundingClientRect(),
            b = host.current.getBoundingClientRect(),
            c = reveal.current.getBoundingClientRect(),
            out = machine.current?.getOutlet() || {
              x: b.width / 2,
              y: b.height * 0.8,
            };
          const x = b.left - a.left + out.x - 48,
            y = b.top - a.top + out.y - 48,
            ex = c.left - a.left + c.width / 2 - 48,
            ey = c.top - a.top + c.height / 2 - 48;
          setFlight({
            '--sx': `${x}px`,
            '--sy': `${y}px`,
            '--dy': `${y + 35}px`,
            '--mx': `${(x + ex) / 2}px`,
            '--my': `${Math.min(y, ey) - 55}px`,
            '--ex': `${ex}px`,
            '--ey': `${ey}px`,
          } as CSSProperties);
        }
        setStage('travel');
        tone([350, 196], 0.08);
      }, 900);
      later(() => {
        setStage('opening');
        tone([660, 880], 0.08);
      }, 1800);
      later(finish, 2550);
    });
    return snapshot();
  };
  const pet = () => {
    if (!pal || busy) return;
    setPetPulse((v) => v + 1);
    tone([440 + pal.index * 9, 660 + pal.index * 9], 0.07);
    setMessage(`${pal.name} says hello!`);
  };
  api.current = { spin, snapshot, pet };
  useEffect(() => {
    mounted.current = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    const onMotion = () => {
      reduced.current = media.matches;
    };
    media.addEventListener('change', onMotion);
    const stored = latest();
    persist(stored);
    setResults(stored.recent.slice(-1));
    setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = readCollection(e.newValue);
        data.current = next;
        setCollection(next);
      }
    };
    window.addEventListener('storage', sync);
    Promise.all(
      ['pals.png', 'capsule.png'].map(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = `./pixel/${file}`;
          }),
      ),
    )
      .then(() => {
        if (mounted.current) setArtReady(true);
      })
      .catch(() => {
        if (mounted.current) setArtError(true);
      });
    import('./gumball/machine-scene')
      .then(({ createMachineScene }) => {
        if (!mounted.current || !host.current) return;
        try {
          machine.current = createMachineScene(
            host.current,
            () => {
              void api.current.spin().catch(() => {});
            },
            () => setMachineReady(true),
          );
        } catch {
          setFallback(true);
        }
      })
      .catch(() => {
        if (mounted.current) setFallback(true);
      });
    const lifecycle = new AbortController();
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (ctx?.registerTool) {
      const reg = (tool: object) => {
        try {
          void Promise.resolve(
            ctx.registerTool(tool, { signal: lifecycle.signal }),
          ).catch(() => {});
        } catch {}
      };
      reg({
        name: 'get_collection',
        description:
          'Read automatically saved pals, shiny counts, and machine readiness.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw Error('Pass an empty object.');
          return api.current.snapshot();
        },
      });
      reg({
        name: 'spin_machine',
        description:
          'Turn for one or three random capsules. All rewards are saved automatically, including duplicates and shinies.',
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'integer', enum: [1, 3] } },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const d = input as { count?: 1 | 3 };
          if (
            !d ||
            typeof d !== 'object' ||
            Array.isArray(d) ||
            Object.keys(d).some((k) => k !== 'count') ||
            (d.count !== undefined && ![1, 3].includes(d.count))
          )
            throw Error('Use count 1 or 3.');
          return api.current.spin(d.count);
        },
      });
      reg({
        name: 'shuffle_machine',
        description:
          'Shuffle the physical capsules without drawing or changing the collection.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw Error('Pass an empty object.');
          machine.current?.shake();
          return api.current.snapshot();
        },
      });
    }
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      machine.current?.dispose();
      machine.current = null;
      lifecycle.abort();
      media.removeEventListener('change', onMotion);
      window.removeEventListener('storage', sync);
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    if (peek) dialog.current?.showModal();
  }, [peek]);
  const visible = CREATURES.filter(
    (c) =>
      (filter === 'all' ||
        (filter === 'owned'
          ? collection.counts[c.id]
          : collection.shinies[c.id])) &&
      (rarityFilter === 'all' || c.rarity === rarityFilter),
  );
  const theme = pal
    ? `rarity-${pal.rarity} family-${pal.family.toLowerCase()} ${current?.shiny ? 'is-shiny' : ''}`
    : '';
  return (
    <main className="pocket-app">
      <header className="site-header">
        <a className="wordmark" href="#" aria-label="Pocket Pals home">
          <Flower2 size={27} />
          <span>
            pocket pals<span>.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#collection" className="collection-link">
            <Box size={16} />
            Collection{' '}
            <b>
              {unique}
              <i>/36</i>
            </b>
          </a>
          <button
            className="sound-button"
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            aria-pressed={!muted}
            onClick={() => {
              const v = !muted;
              mutedRef.current = v;
              setMuted(v);
              if (!v) tone([523, 659]);
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <a
            className="github-link"
            href="https://github.com/shadiazzeh11/pocket-pals"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <section className="playroom" aria-label="Interactive capsule machine">
        <div className="room-heading">
          <span className="tiny-kicker">THE CAPSULE CLUB · VOL. 02</span>
          <h1>A little spin. A rare little friend.</h1>
        </div>
        <div ref={stage} className={`game-stage phase-${phase}`}>
          <div className="machine-side">
            <div className="machine-topline">
              <span>THE WONDER MACHINE</span>
              <span className="machine-status">
                {busy ? 'MAKING A LITTLE MAGIC' : 'READY TO PLAY'}
              </span>
            </div>
            <div ref={host} className="machine-canvas">
              {fallback && (
                <button
                  className="fallback-machine"
                  onClick={() => void spin().catch(() => {})}
                  disabled={busy}
                >
                  <img src="./pixel/machine.png" alt="Red capsule machine" />
                </button>
              )}
              {!machineReady && !fallback && (
                <span className="scene-loading">Polishing the glass…</span>
              )}
            </div>
            <div className="machine-utilities">
              <span>
                <Hand size={14} />
                Drag to turn · tap the globe
              </span>
              <div>
                <button
                  aria-label="Shuffle capsules"
                  disabled={busy}
                  onClick={() => {
                    machine.current?.shake();
                    tone([330, 440], 0.05);
                  }}
                >
                  <Shuffle size={15} />
                </button>
                <button
                  aria-label="Reset machine view"
                  onClick={() => machine.current?.reset()}
                >
                  <RotateCw size={15} />
                </button>
              </div>
            </div>
            <div className="machine-action">
              <div className="batch-picker" aria-label="Capsules per turn">
                {([1, 3] as const).map((n) => (
                  <button
                    key={n}
                    disabled={busy}
                    aria-pressed={batch === n}
                    onClick={() => setBatch(n)}
                  >
                    {n === 1 ? 'One pal' : 'Three pals'}
                    <span>×{n}</span>
                  </button>
                ))}
              </div>
              <button
                className="turn-button"
                disabled={
                  busy || !ready || !artReady || (!machineReady && !fallback)
                }
                onClick={() => void spin().catch(() => {})}
              >
                <RotateCw size={19} className={busy ? 'turning-icon' : ''} />
                {artError
                  ? 'Artwork unavailable'
                  : !artReady
                    ? 'Warming up…'
                    : busy
                      ? 'Here comes the good stuff…'
                      : 'Turn the handle'}
                <ChevronRight size={18} />
              </button>
              <span className="auto-note">
                <CheckCheck size={13} />
                Every pal is kept. No extra clicks.
              </span>
              {artError && (
                <button
                  className="text-button"
                  onClick={() => location.reload()}
                >
                  Reload artwork
                </button>
              )}
            </div>
          </div>
          {phase === 'travel' &&
            results.map((d, i) => (
              <img
                key={d.id}
                className={`flying-capsule ${d.shiny ? 'shiny-capsule' : ''}`}
                style={{ ...flight, '--capsule-i': i } as CSSProperties}
                src="./pixel/capsule.png"
                alt=""
              />
            ))}
          <aside className={`surprise-side ${theme}`}>
            <div className="surprise-topline">
              <span>YOUR LATEST DISCOVERY</span>
              <Sparkles size={19} />
            </div>
            <div className="reveal-card">
              <div className="card-stamp">
                {current ? String(pal!.index + 1).padStart(2, '0') : '??'}
                <span>/ 36</span>
              </div>
              <div ref={reveal} className="reveal-art">
                {phase === 'opening' && (
                  <div className="opening-capsule" aria-hidden="true">
                    <img
                      className="capsule-half upper"
                      src="./pixel/capsule.png"
                      alt=""
                    />
                    <img
                      className="capsule-half lower"
                      src="./pixel/capsule.png"
                      alt=""
                    />
                  </div>
                )}
                {pal && (phase === 'idle' || phase === 'opening') ? (
                  <button
                    className={`pal-playground ${phase === 'opening' ? 'arriving' : ''}`}
                    onClick={pet}
                    disabled={busy}
                    aria-label={`Say hello to ${current.shiny ? 'shiny ' : ''}${pal.name}`}
                    onPointerMove={(e) => {
                      if (reduced.current) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty(
                        '--look-x',
                        `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`,
                      );
                    }}
                    onPointerLeave={(e) =>
                      e.currentTarget.style.setProperty('--look-x', '0deg')
                    }
                  >
                    <span className="pal-aura" />
                    <span
                      key={`${current.id}-${petPulse}`}
                      onAnimationEnd={(e) => {
                        if (e.animationName !== 'pal-idle')
                          e.currentTarget.classList.remove(
                            `reaction-${petPulse % 3}`,
                          );
                      }}
                      className={`pal-puppet ${petPulse ? `reaction-${petPulse % 3}` : ''}`}
                    >
                      <Sprite creature={pal} shiny={current.shiny} />
                    </span>
                    <span className="pixel-spark one">✦</span>
                    <span className="pixel-spark two">✧</span>
                    {current.shiny && (
                      <>
                        <span className="shiny-orbit" />
                        <span className="shiny-orbit second" />
                      </>
                    )}
                    {petPulse > 0 && (
                      <span key={petPulse} className="pet-heart">
                        ♥
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="waiting-pal">
                    <span>{busy ? '✧' : '?'}</span>
                    <p>
                      {busy
                        ? 'Something lovely is on its way.'
                        : 'Your next favorite is in there.'}
                    </p>
                  </div>
                )}
              </div>
              <div className="reveal-info">
                {pal && (phase === 'idle' || phase === 'opening') ? (
                  <>
                    <div className="discovery-tags">
                      <span className="rarity-pill">
                        {pal.rarity === 'legendary' && (
                          <Star size={11} fill="currentColor" />
                        )}
                        {RARITIES.find((r) => r.id === pal.rarity)!.label}
                      </span>
                      {current.shiny && (
                        <span className="shiny-pill">
                          <Sparkles size={11} />
                          SHINY
                        </span>
                      )}
                      {current.isNew && <span className="new-pill">NEW</span>}
                    </div>
                    <h2>{pal.name}</h2>
                    <p>
                      {pal.family} pal<span>·</span>
                      {current.shiny
                        ? 'An alternate-color little wonder.'
                        : 'Tap your pal. They like the attention.'}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="discovery-badge">36 PALS · 72 LOOKS</span>
                    <h2>{busy ? 'Who could it be?' : 'Meet your next pal.'}</h2>
                    <p>Some are rare. A few really shine.</p>
                  </>
                )}
              </div>
              <div className="card-bottom">
                {current && (phase === 'idle' || phase === 'opening') ? (
                  <span className="collected-confirmation">
                    <Check size={14} />
                    {results.length === 3
                      ? 'All three added to your collection'
                      : 'Automatically added to your collection'}
                  </span>
                ) : (
                  <span className="little-message">
                    Always free. Always a surprise.
                  </span>
                )}
              </div>
            </div>
            {results.length === 3 &&
              (phase === 'idle' || phase === 'opening') && (
                <div
                  className="batch-results"
                  aria-label="Three capsule results"
                >
                  {results.map((d, i) => {
                    const c = CREATURES.find((p) => p.id === d.creatureId)!;
                    return (
                      <button
                        key={d.id}
                        aria-pressed={i === active}
                        onClick={() => {
                          setActive(i);
                          setPetPulse(0);
                        }}
                        className={`rarity-${c.rarity} ${d.shiny ? 'is-shiny' : ''}`}
                      >
                        <Sprite creature={c} shiny={d.shiny} />
                        <span>
                          {c.name}
                          {d.shiny ? ' ✦' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            <span className="under-card">
              {current?.shiny
                ? 'a little sparkle. a lot of personality.'
                : 'excellent company. pocket-sized.'}
            </span>
          </aside>
        </div>
        <details className="odds-panel">
          <summary>
            <Sparkles size={14} />A little luck, explained{' '}
            <span>See the odds</span>
          </summary>
          <div className="odds-content">
            {RARITIES.map((r) => (
              <span key={r.id} className={`rarity-${r.id}`}>
                <i />
                {r.label}
                <b>{r.chance}%</b>
              </span>
            ))}
            <span className="shiny-odds">
              ✦ Shiny variant<b>1 in 16</b>
            </span>
          </div>
          <p>
            Rarity is rolled first, then a pal within that tier. The shiny roll
            is independent. Duplicates count too.
          </p>
        </details>
      </section>
      <section
        className="collection-section"
        id="collection"
        aria-label="Your creature collection"
      >
        <div className="collection-heading">
          <div>
            <span className="tiny-kicker">
              GOOD COMPANY. GROWING COLLECTION.
            </span>
            <h2>
              Your little universe<span>.</span>
            </h2>
          </div>
          <div className="collection-stats">
            <span>
              <strong>
                {String(unique).padStart(2, '0')}
                <i>/36</i>
              </strong>
              pals discovered
            </span>
            <span className="shiny-stat">
              <strong>✦ {shinyUnique}</strong>shiny forms
            </span>
          </div>
        </div>
        <div className="collection-toolbar">
          <div className="collection-tabs">
            {(['all', 'owned', 'shiny'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
              >
                {f === 'all'
                  ? 'All pals'
                  : f === 'owned'
                    ? 'In my pocket'
                    : '✦ Shinies'}
                {f === 'owned' && <span>{unique}</span>}
              </button>
            ))}
          </div>
          <label className="rarity-select">
            <span className="sr-only">Filter by rarity</span>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
            >
              <option value="all">Every rarity</option>
              {RARITIES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!visible.length ? (
          <div className="collection-empty">
            <Sparkles size={27} />
            <p>
              {filter === 'shiny'
                ? 'Your first sparkle is out there.'
                : 'A new friendship is a spin away.'}
            </p>
            <a href="#">
              Back to the machine <ArrowUpRight size={14} />
            </a>
          </div>
        ) : (
          <div className="collection-grid">
            {visible.map((c) => {
              const n = collection.counts[c.id] || 0,
                shinies = collection.shinies[c.id] || 0,
                showShiny = filter === 'shiny' || (n > 0 && n === shinies);
              return (
                <button
                  key={c.id}
                  className={`pal-tile rarity-${c.rarity} family-${c.family.toLowerCase()} ${n ? 'owned' : 'undiscovered'} ${showShiny ? 'is-shiny' : ''}`}
                  disabled={!n}
                  onClick={() => setPeek({ pal: c, shiny: showShiny })}
                  aria-label={
                    n
                      ? `${c.name}, ${c.rarity}, ${n} collected, ${shinies} shiny. View pal.`
                      : `Undiscovered ${c.rarity} pal ${c.index + 1}`
                  }
                >
                  <span className="tile-number">
                    {String(c.index + 1).padStart(2, '0')}
                  </span>
                  {n > 0 && <span className="tile-count">×{n}</span>}
                  <Sprite creature={c} shiny={showShiny} />
                  {!n && <span className="unknown-mark">?</span>}
                  <strong>{n ? c.name : '???'}</strong>
                  <span className="tile-rarity">
                    <i />
                    {c.rarity}
                  </span>
                  {shinies > 0 && (
                    <span className="tile-shiny">✦ {shinies}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="collection-footer">
          <span>
            {total} pals collected <i>·</i> {shinyTotal} shiny finds
          </span>
          <span>
            {storageError
              ? 'Saving unavailable · this session only'
              : 'Saved automatically in this browser'}
            <CheckCheck size={13} />
          </span>
        </div>
      </section>
      <footer className="site-footer">
        <span>pocket pals.</span>
        <span>NO COINS. JUST CURIOSITY.</span>
        <div>
          <a href="./credits.html">Credits</a>
          <a
            href="https://github.com/shadiazzeh11/pocket-pals"
            target="_blank"
            rel="noreferrer"
          >
            Made to be played <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      <dialog
        ref={dialog}
        className="pal-dialog"
        aria-labelledby="pal-detail-title"
        onCancel={() => setPeek(null)}
        onClose={() => setPeek(null)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        {peek && (
          <div
            className={`dialog-content rarity-${peek.pal.rarity} family-${peek.pal.family.toLowerCase()} ${peek.shiny ? 'is-shiny' : ''}`}
          >
            <button
              className="close-dialog"
              onClick={() => dialog.current?.close()}
              aria-label="Close creature details"
            >
              <X size={20} />
            </button>
            <span className="rarity-pill">{peek.pal.rarity}</span>
            <button
              className="dialog-pet"
              aria-label={`Pet ${peek.pal.name}`}
              onClick={(e) => {
                const button = e.currentTarget;
                button.classList.remove('hopping');
                requestAnimationFrame(() => button.classList.add('hopping'));
                tone([550, 825], 0.08);
              }}
            >
              <Sprite creature={peek.pal} shiny={peek.shiny} />
            </button>
            <h2 id="pal-detail-title">
              {peek.pal.name}
              {peek.shiny && <Sparkles size={21} />}
            </h2>
            <p>
              {peek.pal.family} · No.{' '}
              {String(peek.pal.index + 1).padStart(2, '0')}
            </p>
            <div className="variant-switch">
              <button
                disabled={
                  collection.counts[peek.pal.id] ===
                  (collection.shinies[peek.pal.id] || 0)
                }
                aria-pressed={!peek.shiny}
                onClick={() => setPeek({ ...peek, shiny: false })}
              >
                Original{' '}
                <b>
                  {collection.counts[peek.pal.id] -
                    (collection.shinies[peek.pal.id] || 0)}
                </b>
              </button>
              <button
                disabled={!collection.shinies[peek.pal.id]}
                aria-pressed={peek.shiny}
                onClick={() => setPeek({ ...peek, shiny: true })}
              >
                ✦ Shiny <b>{collection.shinies[peek.pal.id] || 0}</b>
              </button>
            </div>
            <span className="dialog-note">Tap for a little hello.</span>
          </div>
        )}
      </dialog>
    </main>
  );
}
