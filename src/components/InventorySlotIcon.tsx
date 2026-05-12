import { ReactNode } from 'react'

// Minimal SVG paths for each inventory slot. 24×24 viewBox, currentColor
// stroke. Tinted by region group in the renderer below — armor slots get
// a muted blue, weapon slots the accent red, jewelry slots gold, and the
// InventoryOnly bucket reads grey since it's not equipped at all.
const INVENTORY_SLOT_ICONS: Record<string, ReactNode> = {
  Head: (
    <>
      <path d="M5 14c0-5 3-8 7-8s7 3 7 8v3H5z" />
      <path d="M9 17v2" />
      <path d="M15 17v2" />
      <path d="M10 11h4" />
    </>
  ),
  Neck: (
    <>
      <path d="M6 4c1 4 4 8 6 8s5-4 6-8" />
      <circle cx="12" cy="16" r="3" />
    </>
  ),
  Chest: (
    <>
      <path d="M4 6l4-2v3a4 4 0 0 0 8 0V4l4 2v14H4z" />
      <path d="M9 11v6" />
      <path d="M15 11v6" />
    </>
  ),
  Back: (
    <>
      <path d="M6 4c2 1 4 1 6 1s4 0 6-1l-1 16-5-2-5 2z" />
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  Waist: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="1" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M12 11v2" />
    </>
  ),
  Legs: (
    <>
      <path d="M7 3h10v6l-1 11h-3l-1-8-1 8H8L7 9z" />
      <path d="M7 9h10" />
    </>
  ),
  Feet: (
    <>
      <path d="M5 14h7l4 3v3H5z" />
      <path d="M5 14V5h4v9" />
    </>
  ),
  Hands: (
    <>
      <path d="M7 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M10 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M13 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16 11V7a1.5 1.5 0 0 1 3 0v9a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5v-2" />
    </>
  ),
  Finger: (
    <>
      <circle cx="12" cy="14" r="5" />
      <path d="M9 9l1-4h4l1 4" />
    </>
  ),
  MainHand: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4L9 15" />
      <path d="M9 15l-2 2 3 3 2-2" />
      <path d="M5 19l2 2" />
    </>
  ),
  OffHand: (
    <>
      <path d="M5 4l7-2 7 2v8c0 5-3 8-7 10-4-2-7-5-7-10z" />
      <path d="M12 6v12" />
      <path d="M7 11h10" />
    </>
  ),
  TwoHand: (
    <>
      <path d="M3 21L21 3" />
      <path d="M15 3h6v6" />
      <path d="M16 8l-2-2" />
      <path d="M19 5l-2-2" />
      <path d="M5 21l-2-2 4-4" />
    </>
  ),
  InventoryOnly: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    </>
  ),
}

// Region → color. Armor pieces share a muted blue (a faintly-cool
// "gear" tone); jewelry slots (Neck, Finger) get the gold accent;
// weapons get the warm accent red; the inventory bucket is dim since
// nothing equips there.
function colorForSlot(id: string, region: string): string {
  if (id === 'Neck' || id === 'Finger') return '#c8a04a'
  if (region === 'weapon') return 'var(--accent)'
  if (region === 'inventory') return 'var(--text-dim)'
  return '#7aa8d6'
}

export function InventorySlotIcon({
  id,
  region,
}: {
  id: string
  region: string | null | undefined
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inventory-slot-icon"
      style={{ color: colorForSlot(id, region ?? '') }}
      aria-hidden="true"
    >
      {INVENTORY_SLOT_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
