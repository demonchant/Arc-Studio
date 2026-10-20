/**
 * Hero image carousel with optional text overlay.
 *
 * Images are decorative illustrations used as background imagery.
 * They are NOT product screenshots, transaction evidence, or status displays.
 * The review image contains generated interface labels — those labels are part
 * of the artwork and do NOT represent actual product status or transactions.
 *
 * Accessibility:
 * - role="region" with aria-label
 * - aria-live polite announces slide changes to screen readers (sr-only, not visible)
 * - Keyboard: ArrowLeft / ArrowRight advance slides; Space toggles pause
 * - Auto-advance pauses on focus, on page hidden, or when prefers-reduced-motion
 * - 15-second auto-advance, timer resets on manual navigation
 * - Overlay CTAs are fully keyboard-focusable
 *
 * Layout:
 * - Height is set via min-height + max-height on the section element so the
 *   hero never collapses on narrow viewports. aspect-ratio is intentionally
 *   NOT used because it collapses height when the container width is small.
 * - On phones (~375 px wide) the hero is min-height 320 px.
 * - On tablets and desktops it grows to a max of 520 px via max-height.
 *   The exact responsive target is achieved with a CSS clamp in the inline style.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

interface Slide {
  src: string
  /** Accessible description read only by screen readers (sr-only). Must not describe generated labels as real status. */
  srDescription: string
  /** Short label used in live announcements and dot-indicator aria-labels. */
  announcementLabel: string
}

const SLIDES: Slide[] = [
  {
    src: '/images/collaboration.jpg',
    srDescription: 'Decorative illustration: two people collaborating on an open source contribution project',
    announcementLabel: 'Collaboration illustration',
  },
  {
    src: '/images/review.jpg',
    srDescription:
      'Decorative illustration depicting a code review scene. Any interface labels visible in this image are part of the artwork and do not represent actual application status, transaction data, or payment evidence.',
    announcementLabel: 'Review illustration',
  },
  {
    src: '/images/settlement.jpg',
    srDescription: 'Decorative illustration of a bounty settlement between a maintainer and a contributor',
    announcementLabel: 'Settlement illustration',
  },
]

const INTERVAL_MS = 15_000

export interface CarouselOverlay {
  headline: React.ReactNode
  subtext: React.ReactNode
  cta?: React.ReactNode
  ctaSecondary?: React.ReactNode
  meta?: React.ReactNode
}

interface CarouselProps {
  overlay?: CarouselOverlay
}

export function Carousel({ overlay }: CarouselProps) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [pageHidden, setPageHidden] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveRef = useRef<HTMLDivElement>(null)

  // Keep auto-advance in sync with reduced-motion OS setting changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && timerRef.current) clearTimeout(timerRef.current)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Pause when page is hidden (tab switch, minimize)
  useEffect(() => {
    const handler = () => setPageHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const shouldAdvance = !paused && !pageHidden && !hasFocus && !reducedMotion

  const goTo = useCallback((idx: number) => {
    const next = ((idx % SLIDES.length) + SLIDES.length) % SLIDES.length
    setCurrent(next)
    // Announce slide change to screen readers via sr-only live region
    if (liveRef.current) {
      liveRef.current.textContent = ''
      setTimeout(() => {
        if (liveRef.current) {
          liveRef.current.textContent =
            `Slide ${next + 1} of ${SLIDES.length}: ${SLIDES[next].announcementLabel}`
        }
      }, 50)
    }
  }, [])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  // 15-second auto-advance — resets on any manual navigation
  useEffect(() => {
    if (!shouldAdvance) return
    timerRef.current = setTimeout(() => {
      setCurrent((c) => (c + 1) % SLIDES.length)
    }, INTERVAL_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current, shouldAdvance])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    },
    [next, prev],
  )

  return (
    <section
      aria-label="Decorative illustration carousel with hero content"
      className="relative overflow-hidden rounded-2xl"
      style={{
        border: '1px solid var(--border)',
        /*
         * Responsive height strategy:
         * - min-height keeps the hero usable on narrow phones (320px floor)
         * - max-height caps growth on wide desktops (520px ceiling)
         * - height 100% fills the container between those bounds
         * - aspect-ratio is deliberately NOT used here because it collapses
         *   the element to ~150px on a 375px-wide phone, which is not enough
         *   to display overlay text and CTA buttons.
         */
        minHeight: 320,
        maxHeight: 520,
        height: 'clamp(320px, 42vw, 520px)',
      }}
      onKeyDown={handleKeyDown}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      tabIndex={0}
    >
      {/* Screen-reader-only live region — announces slide changes, never visible */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Slide track — horizontal translate strip */}
      <div
        className="flex h-full"
        style={{
          width: `${SLIDES.length * 100}%`,
          transform: `translateX(-${(current * 100) / SLIDES.length}%)`,
          transition: reducedMotion ? 'none' : 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
        aria-live="off"
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.src}
            className="relative h-full shrink-0"
            style={{ width: `${100 / SLIDES.length}%` }}
            aria-hidden={i !== current}
          >
            <img
              src={s.src}
              /*
               * alt carries the sr-description for screen readers.
               * For the review image this explicitly notes that visible labels
               * are artwork, not product status.
               */
              alt={s.srDescription}
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>

      {/*
       * Dark gradient overlay — always rendered.
       * Stronger when hero text is shown so copy stays readable on all three images.
       */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: overlay
            ? 'linear-gradient(to top, rgba(5,14,30,0.92) 0%, rgba(5,14,30,0.68) 45%, rgba(5,14,30,0.42) 100%)'
            : 'linear-gradient(to top, rgba(10,22,40,0.80) 0%, transparent 55%)',
        }}
        aria-hidden="true"
      />

      {/* Hero text overlay — rendered only when overlay prop is supplied */}
      {overlay && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pb-14 pt-6 text-center sm:px-8"
          style={{ pointerEvents: 'none' }}
        >
          {overlay.meta && (
            <div className="mb-3" style={{ pointerEvents: 'auto' }}>
              {overlay.meta}
            </div>
          )}

          <div className="mb-2" style={{ pointerEvents: 'auto' }}>
            {overlay.headline}
          </div>

          <div className="mx-auto max-w-xs sm:max-w-sm" style={{ pointerEvents: 'auto' }}>
            {overlay.subtext}
          </div>

          {(overlay.cta ?? overlay.ctaSecondary) && (
            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-3"
              style={{ pointerEvents: 'auto' }}
            >
              {overlay.cta}
              {overlay.ctaSecondary}
            </div>
          )}
        </div>
      )}

      {/* Controls row — fixed to the bottom edge */}
      <div className="absolute bottom-3 left-0 right-0 z-20 flex items-center justify-end gap-2 px-4">
        {/* Pause / play */}
        <button
          onClick={() => setPaused((p) => !p)}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-100"
          style={{ background: 'rgba(10,22,40,0.70)', color: 'var(--ink-2)', opacity: 0.85 }}
          aria-label={paused ? 'Resume slideshow' : 'Pause slideshow'}
          type="button"
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>

        {/* Previous slide */}
        <button
          onClick={prev}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-100"
          style={{ background: 'rgba(10,22,40,0.70)', color: 'var(--ink-2)', opacity: 0.85 }}
          aria-label="Previous slide"
          type="button"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Slide indicators">
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              role="tab"
              aria-selected={i === current}
              aria-label={`Go to slide ${i + 1}: ${s.announcementLabel}`}
              onClick={() => goTo(i)}
              className="h-1.5 rounded-full"
              style={{
                width: i === current ? 20 : 6,
                background: i === current ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                transition: reducedMotion ? 'none' : 'width 0.3s ease, background 0.3s ease',
              }}
              type="button"
            />
          ))}
        </div>

        {/* Next slide */}
        <button
          onClick={next}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-100"
          style={{ background: 'rgba(10,22,40,0.70)', color: 'var(--ink-2)', opacity: 0.85 }}
          aria-label="Next slide"
          type="button"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/*
       * NOTE: visible caption text has been intentionally removed.
       * Captions were decorative and added visual clutter to the hero.
       * Screen reader users still receive slide announcements via the
       * sr-only live region above and the img alt text on each slide.
       * The review image alt explicitly notes that any visible labels
       * in the artwork are not product status or transaction evidence.
       */}
    </section>
  )
}
