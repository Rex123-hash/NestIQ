import { useEffect, useRef } from 'react'

// A soft brand-purple halo that trails just behind the real cursor.
//
// Deliberate choice: the NATIVE cursor stays visible and pixel-accurate, so clicking
// never feels imprecise. This element is purely decorative motion layered on top, and
// it is `pointer-events: none` so it can never intercept a click.
//
// It self-disables on touch devices (no hover to speak of) and whenever the user has
// asked for reduced motion, in which case nothing is rendered and no listeners run.

const INTERACTIVE =
  'a,button,label,select,summary,[role="button"],input,textarea,[contenteditable="true"]'

// Eased follow: low enough to read as fluid, high enough to never feel detached.
const FOLLOW = 0.19
const SCALE_EASE = 0.16

export default function CursorHalo() {
  const ref = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const fine = window.matchMedia('(pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || reduced.matches) return

    const el = ref.current
    if (!el) return

    let raf = 0
    let started = false
    let targetX = 0
    let targetY = 0
    let x = 0
    let y = 0
    let scale = 1
    let hovering = false
    let pressed = false

    const targetScale = () => (pressed ? 0.82 : hovering ? 1.9 : 1)

    const onMove = (event) => {
      targetX = event.clientX
      targetY = event.clientY
      if (!started) {
        // Jump to the pointer on first sight so it never flies in from 0,0.
        x = targetX
        y = targetY
        started = true
      }
      // Re-show on ANY movement, not just the first. Relying on mouseenter alone
      // left the halo stuck invisible after a window blur or a leave event.
      if (el.style.opacity !== '1') el.style.opacity = '1'
      const node = event.target
      hovering = !!(node && node.closest && node.closest(INTERACTIVE))
    }

    const hide = () => {
      el.style.opacity = '0'
    }
    const show = () => {
      if (started) el.style.opacity = '1'
    }
    const onDown = () => {
      pressed = true
    }
    const onUp = () => {
      pressed = false
    }

    const tick = () => {
      x += (targetX - x) * FOLLOW
      y += (targetY - y) * FOLLOW
      scale += (targetScale() - scale) * SCALE_EASE
      el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onDown, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    document.addEventListener('mouseleave', hide)
    document.addEventListener('mouseenter', show)
    window.addEventListener('blur', hide)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      document.removeEventListener('mouseleave', hide)
      document.removeEventListener('mouseenter', show)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return <div ref={ref} aria-hidden="true" className="cursor-halo" />
}
