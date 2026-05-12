import { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// DamageFlowchart — a step-by-step diagram of how damage gets calculated
// from attacker to defender. Numbers and formulas mirror what the
// DamageCalculator runs in /dev/damage-calculator (default "Roll last"
// pipeline) and what get_public_character_calculated_stats produces server-
// side; keep them in sync when the math evolves.
//
// The pipeline (post-migration 0069) loops per TARGET GROUP. An ability's
// Damage/Heal effects are bucketed by target ('Primary', 'SplashRadius', …)
// and each group resolves the FULL pipeline independently:
//
//   Per target group:
//     Hit roll        — single d100 vs. linear hit formula (acc − ev)
//     Block roll      — independent d100 vs. block_chance
//     Crit roll       — per-group d100; each group can crit or not crit
//     Per effect in the group:
//       Effect base   — power × coefficient × global_mult
//       Damage roll   — uniform [value · profFloor, value]  (RuneScape swing)
//       Crit applied  — × (1 + crit_damage / 100) when this group crit
//       Block applied — × BLOCK_MITIGATION when this group blocked
//       Mitigation    — × K / (K + armor or magic_resist)
//     Group subtotal — sum of effect values in this group
//
// Only the Primary group's subtotal hits the picked defender; splash-group
// subtotals are informational (they'd hit other characters in a real fight).
// The physical-vs-magical fork lives per group: each group's first effect
// decides which routing it uses.
// ─────────────────────────────────────────────────────────────────────────────

type FlowContent =
  | {
      kind: 'data'
      inputs: string[]
      formula: string
      output: string
    }
  | { kind: 'skipped'; note: string }

type FlowStep = {
  n: number
  title: string
  blurb: string
  body:
    | { kind: 'shared'; content: FlowContent }
    | { kind: 'forked'; physical: FlowContent; magical: FlowContent }
}

type FlowSection =
  | { kind: 'shared'; step: FlowStep }
  | {
      kind: 'per-effect'
      label: string
      blurb: string
      steps: FlowStep[]
    }

// Build the section list with monotonic step numbers so a reader can refer
// to "step 7" unambiguously even though the actual pipeline re-runs the
// per-effect block once per effect at runtime.
const SECTIONS: FlowSection[] = (() => {
  let n = 0
  const num = () => ++n

  const hitRoll: FlowStep = {
    n: num(),
    title: 'Hit roll',
    blurb:
      'Single d100 against the linear hit formula. accuracy from the attacker, evasion from the defender; the spell pair (spell_accuracy / spell_evasion) is the magical mirror. Every +1 stat shifts hit chance by 1%. On AVOID this group ends at 0 damage; the next target group still rolls independently.',
    body: {
      kind: 'forked',
      physical: {
        kind: 'data',
        inputs: [
          'Attacker.accuracy',
          'Defender.evasion',
          'BASE_HIT = 90%',
          'MIN_HIT = 5%',
          'MAX_HIT = 98%',
        ],
        formula:
          'hitChance = clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT)\nroll < hitChance → HIT\nroll ≥ hitChance → AVOID (0 damage to this group)',
        output: 'HIT · or AVOID (group ends at 0)',
      },
      magical: {
        kind: 'data',
        inputs: [
          'Attacker.spell_accuracy',
          'Defender.spell_evasion',
          'BASE_HIT = 90%',
          'MIN_HIT = 5%',
          'MAX_HIT = 98%',
        ],
        formula:
          'hitChance = clamp(BASE_HIT + spell_accuracy − spell_evasion, MIN_HIT, MAX_HIT)\nroll < hitChance → HIT\nroll ≥ hitChance → AVOID (0 damage to this group)',
        output: 'HIT · or AVOID (group ends at 0)',
      },
    },
  }

  const blockRoll: FlowStep = {
    n: num(),
    title: 'Block roll',
    blurb:
      "Independent d100 vs. block_chance (spell_block_chance for magical groups). Block is partial mitigation — on success the group's blocked flag is set and damage effects later get multiplied by BLOCK_MITIGATION. Heals ignore the flag.",
    body: {
      kind: 'forked',
      physical: {
        kind: 'data',
        inputs: ['Defender.block_chance', 'BLOCK_MITIGATION = 0.5'],
        formula:
          'roll < block_chance → blocked = true (each damage effect × BLOCK_MITIGATION)\nroll ≥ block_chance → no block',
        output: 'group blocked flag',
      },
      magical: {
        kind: 'data',
        inputs: ['Defender.spell_block_chance', 'BLOCK_MITIGATION = 0.5'],
        formula:
          'roll < spell_block_chance → blocked = true (each damage effect × BLOCK_MITIGATION)\nroll ≥ spell_block_chance → no block',
        output: 'group blocked flag',
      },
    },
  }

  const critRoll: FlowStep = {
    n: num(),
    title: 'Crit roll',
    blurb:
      "Per-group d100. Each group rolls its own crit independently — splash can crit when primary doesn't, and vice versa. Crit stat picked from the group's first effect: heal_crit for heal effects, spell_crit for magical, crit_chance for physical.",
    body: {
      kind: 'forked',
      physical: {
        kind: 'data',
        inputs: ['Attacker.crit_chance', 'Attacker.crit_damage'],
        formula:
          'roll < crit_chance → isCrit = true\ncritFactor = 1 + crit_damage / 100',
        output: 'group isCrit flag · group critFactor',
      },
      magical: {
        kind: 'data',
        inputs: [
          'Attacker.spell_crit  (or heal_crit for heals)',
          'Attacker.crit_damage',
        ],
        formula:
          'roll < spell_crit → isCrit = true\ncritFactor = 1 + crit_damage / 100',
        output: 'group isCrit flag · group critFactor',
      },
    },
  }

  const effBase: FlowStep = {
    n: num(),
    title: 'Effect base',
    blurb:
      "Each Damage / Heal effect in the group carries its own school and its own power_coefficient. Power stat: heal effects use healing_power; non-physical schools use spell_power; physical uses attack_power. The calculator's global Power Coefficient slider multiplies on top.",
    body: {
      kind: 'forked',
      physical: {
        kind: 'data',
        inputs: [
          'Attacker.attack_power',
          'effect.coefficient',
          'effect.school = "physical"',
          'Global multiplier',
        ],
        formula:
          'effCoef = effect.coefficient × global_mult\nvalue = attack_power × effCoef',
        output: 'effect base value',
      },
      magical: {
        kind: 'data',
        inputs: [
          'Attacker.spell_power  (or healing_power for heals)',
          'effect.coefficient',
          'effect.school  (≠ "physical")',
          'Global multiplier',
        ],
        formula:
          'effCoef = effect.coefficient × global_mult\nvalue = spell_power × effCoef',
        output: 'effect base value',
      },
    },
  }

  const effDamageRoll: FlowStep = {
    n: num(),
    title: 'Damage roll',
    blurb:
      "Uniform on [value · profFloor, value]. Pure RuneScape-flavoured swing — at level 1 profFloor = 0 so the roll is uniform on [0, value] (max-stat attackers still occasionally whiff). Proficiency lifts the floor: at level 99 profFloor = FLOOR_CAP (0.3) so the roll is uniform on [0.3·value, value]. Heals skip this — they stay deterministic.",
    body: {
      kind: 'shared',
      content: {
        kind: 'data',
        inputs: [
          'Attacker.weapon_proficiency.level',
          'FLOOR_CAP = 0.3',
          'MAX_SKILL_LEVEL = 99',
        ],
        formula:
          'profFloor = (level / MAX_SKILL_LEVEL) × FLOOR_CAP\nvalue = round(uniform(value · profFloor, value))',
        output: 'rolled effect value',
      },
    },
  }

  const effCritApplied: FlowStep = {
    n: num(),
    title: 'Crit applied',
    blurb:
      "If the GROUP's isCrit flag is set, multiply this effect by the group's critFactor. Otherwise the step is a no-op.",
    body: {
      kind: 'shared',
      content: {
        kind: 'data',
        inputs: ['group isCrit', 'group critFactor'],
        formula: 'if isCrit:  value = value × critFactor',
        output: 'crit-adjusted effect value',
      },
    },
  }

  const effBlockApplied: FlowStep = {
    n: num(),
    title: 'Block applied',
    blurb:
      "If the GROUP's blocked flag is set, multiply each damage effect by BLOCK_MITIGATION. Heal effects ignore the flag.",
    body: {
      kind: 'shared',
      content: {
        kind: 'data',
        inputs: ['group blocked flag', 'BLOCK_MITIGATION = 0.5'],
        formula:
          'if blocked and not isHeal:  value = value × BLOCK_MITIGATION',
        output: 'block-adjusted effect value',
      },
    },
  }

  const effMitigation: FlowStep = {
    n: num(),
    title: 'Mitigation',
    blurb:
      "Per-effect soak, routed by THIS effect's school: physical-school effects are reduced by armor, all other schools by magic_resist. Heal effects skip mitigation. Curve uses K = 100 so a stat at parity with K halves the effect.",
    body: {
      kind: 'forked',
      physical: {
        kind: 'data',
        inputs: ['Defender.armor', 'MITIGATION_K = 100'],
        formula:
          'mult = K / (K + armor)\nvalue = value × mult',
        output: 'mitigated effect value',
      },
      magical: {
        kind: 'data',
        inputs: ['Defender.magic_resist', 'MITIGATION_K = 100'],
        formula:
          'mult = K / (K + magic_resist)\nvalue = value × mult',
        output: 'mitigated effect value',
      },
    },
  }

  const subtotal: FlowStep = {
    n: num(),
    title: 'Group subtotal',
    blurb:
      "Sum across the effects resolved for this group. Only the Primary group's subtotal flows into the defender's HP at the Apply step. Splash-group subtotals are informational — they'd hit other characters in a real fight.",
    body: {
      kind: 'shared',
      content: {
        kind: 'data',
        inputs: ['per-effect values for this group'],
        formula: 'subtotal = Σ effect.value\nif group is Primary: primaryValue = subtotal',
        output: 'group subtotal · primaryValue (Primary only)',
      },
    },
  }

  const apply: FlowStep = {
    n: num(),
    title: 'Apply',
    blurb:
      "Subtract the Primary group's subtotal from the defender's current health. Heal totals add to current health instead. Splash-group damage falls outside this step (it'd hit other characters).",
    body: {
      kind: 'shared',
      content: {
        kind: 'data',
        inputs: ['Defender.health.current', 'primaryValue'],
        formula:
          'Defender.health.current = clamp(0, max, current − primaryValue)',
        output: 'updated HP — defender dies if it hits 0',
      },
    },
  }

  return [
    {
      kind: 'per-effect',
      label: 'Per target group',
      blurb:
        "These steps re-run for each target group ('Primary', 'SplashRadius', …) the ability declares. Within a group, the per-effect steps (Effect base → Damage roll → Crit applied → Block applied → Mitigation) re-run once per Damage / Heal effect. The group's first effect picks which physical/magical fork applies to its hit/crit/block routing.",
      steps: [
        hitRoll,
        blockRoll,
        critRoll,
        effBase,
        effDamageRoll,
        effCritApplied,
        effBlockApplied,
        effMitigation,
        subtotal,
      ],
    },
    { kind: 'shared', step: apply },
  ]
})()

export function DamageFlowchartSection() {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Damage Flowchart</h2>
        <p>
          The full pipeline a single attack walks through, in the order the
          Damage Calculator runs them (default "Roll last" mode). The whole
          pipeline lives inside a <strong>per-target-group</strong> loop:
          for each target group (<code>Primary</code>,{' '}
          <code>SplashRadius</code>, …) the steps run independently — its
          own hit roll, its own block roll, its own crit roll, then a
          per-effect chain (base / damage roll / crit / block / mit) for
          each <code>Damage</code> / <code>Heal</code> effect in that
          group. Only the Primary group's subtotal hits the picked
          defender at <strong>Apply</strong>. Keep this in sync with{' '}
          <code>/dev/damage-calculator</code> and{' '}
          <code>get_public_character_calculated_stats</code> when the
          formulas evolve.
        </p>
      </header>

      <div className="flowchart">
        <FlowEndpoint role="attacker" />
        <FlowArrow />
        {SECTIONS.map((section, i) => (
          <FlowSectionBlock
            key={i}
            section={section}
            arrow={i < SECTIONS.length - 1}
          />
        ))}
        <FlowArrow />
        <FlowEndpoint role="defender" />
      </div>
    </section>
  )
}

// Tuning knobs referenced throughout the pipeline. Values are hard-coded
// here to match the constants of the same name in DamageCalculator.tsx —
// keep both in sync when the math evolves.
type DamageConstant = {
  name: string
  value: string
  meaning: string
  // The "why this value, not another" reasoning. One or two sentences,
  // shown under the meaning in a dimmer style. Keep it about the design
  // intent and the tradeoff (so the reader understands the alternative).
  rationale: string
}

const DAMAGE_CONSTANTS: DamageConstant[] = [
  {
    name: 'BASE_HIT',
    value: '90%',
    meaning:
      'Naked-vs-naked baseline hit chance. hitChance = clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT) — every +1 stat moves hit chance by 1% relative to the opposing stat.',
    rationale:
      "90% means an unstatted attacker still connects most of the time, which keeps the pipeline forgiving for casual play. Lower (e.g. 80%) punishes low-investment builds; higher (e.g. 95%) makes evasion's marginal value feel weak.",
  },
  {
    name: 'MAX_HIT',
    value: '98%',
    meaning:
      '"Always some chance to miss" residual. Even an accuracy-stacker against a no-evasion target can occasionally whiff.',
    rationale:
      'A 2% residual keeps every attack a real roll instead of a foregone conclusion, and preserves evasion\'s marginal value at the top end (extra evasion still buys you down to MAX_HIT). 99% is closer to PoE; 100% removes the residual entirely but flattens the math at the top; 95% is the D&D "nat-1 always misses" floor.',
  },
  {
    name: 'MIN_HIT',
    value: '5%',
    meaning:
      '"Always some chance to hit" floor. An accuracy-starved attacker against an evasion-stacker still lands one in twenty.',
    rationale:
      'Mirrors MAX_HIT on the opposite side and matches D&D\'s "nat-20 always hits" convention. Without a floor, an evasion-stacker becomes mathematically untouchable by low-accuracy attackers — bad for combat tension.',
  },
  {
    name: 'BLOCK_MITIGATION',
    value: '0.5',
    meaning:
      'Damage multiplier on a successful BLOCK roll. Block is partial mitigation, not full evasion. The block roll fires independently from the hit roll — its effective rate matches block_chance directly.',
    rationale:
      "0.5 makes block its own thing without overlapping evasion (which is full-prevention). Halving leaves the attacker still doing meaningful damage while rewarding the defender's investment. Alternatives: 0.0 (PoE-style full block), 0.75 (gentler block, closer to a damage-reduction stat).",
  },
  {
    name: 'MITIGATION_K',
    value: '100',
    meaning:
      'Armor / magic-resist soft-cap. mult = K / (K + stat); at parity (stat = K) damage is reduced by 50%. Higher K = slower diminishing returns.',
    rationale:
      'Hit-size-independent: armor 100 halves a 5-damage poke and a 5000-damage boss hit equally. Simpler than PoE\'s armor-vs-hit-size curve — players don\'t have to think about "stack mitigation for big hits, stack avoidance for small ones." Cost: less tactical depth in defensive layering.',
  },
  {
    name: 'MAX_SKILL_LEVEL',
    value: '99',
    meaning:
      'Top of the proficiency scale. Drives the damage-roll skill floor (profFloor).',
    rationale:
      'RuneScape convention — 99 is the player-facing "mastered" cap. Could be 100 or 50 with no functional difference; the value is recognisable to anyone who\'s touched OSRS / RS3.',
  },
  {
    name: 'FLOOR_CAP',
    value: '0.3',
    meaning:
      "At max proficiency, the uniform damage roll's lower bound = value × FLOOR_CAP. Level 1 → uniform [0, value] (pure swing); level 99 → uniform [0.3·value, value] (still swingy, never whiffs).",
    rationale:
      'RuneScape\'s "level lifts the minimum, max stays max" feel. At 0.3, level-99 master rolls expected ~65% of max; level-1 novice rolls expected 50% of max. Tighten (0.5) for a flatter top-end (more reliable but less swingy); loosen (0.0) for pure swing where skill never reduces variance.',
  },
]

export function DamageConstantsLegend() {
  return (
    <div className="dmg-constants">
      <div className="dmg-constants-label">Tuning constants</div>
      <dl className="dmg-constants-list">
        {DAMAGE_CONSTANTS.map((c) => (
          <div key={c.name} className="dmg-constants-row">
            <dt>
              <code>{c.name}</code>
              <span className="dmg-constants-value">= {c.value}</span>
            </dt>
            <dd>
              <div className="dmg-constants-meaning">{c.meaning}</div>
              <div className="dmg-constants-rationale">
                <span className="dmg-constants-rationale-label">Why:</span>{' '}
                {c.rationale}
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// Damage Information section — sibling to the Flowchart and Calculator
// dev tabs. Holds the reference material a designer reaches for when
// tuning combat: the named tuning constants and the pipeline-level
// design decisions. Stacked vertically (constants first, design notes
// below) so the reader sees the math then the philosophy.
export function DamageInformationSection() {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Damage Information</h2>
        <p>
          Reference material for the damage pipeline — the named tuning
          constants used by the formulas (<code>BASE_HIT</code>,{' '}
          <code>MITIGATION_K</code>, …) and the pipeline-level design
          decisions (per-group resolution, linear hit formula, …). The{' '}
          <strong>Damage Flowchart</strong> tab walks the math step-by-
          step; the <strong>Damage Calculator</strong> tab runs concrete
          attacks against a picked attacker / defender pair.
        </p>
      </header>

      <DamageConstantsLegend />

      <DesignNotesPanel />
    </section>
  )
}

// Pipeline-level design decisions that don't reduce to a single tuning
// constant — per-group resolution, the linear hit formula, the uniform
// damage roll, etc. Each entry is the "what the pipeline does" + "why
// the pipeline does it that way" pair, organised so a designer scanning
// the page can pick up the model's philosophy at a glance.
type DesignNote = {
  title: string
  what: string
  why: string
}

const DESIGN_NOTES: DesignNote[] = [
  {
    title: 'Per-target-group resolution',
    what:
      "An ability's Damage / Heal effects are bucketed by `target` ('Primary', 'SplashRadius', …). Each group runs the FULL pipeline independently — its own hit roll, its own block roll, its own crit roll, then per-effect resolution.",
    why:
      "Mirrors PoE's per-target hit resolution: a splash hit can miss when the primary lands, and crit can land on splash without the primary critting. Without this, splash damage becomes a deterministic add-on to the primary outcome — strategically less interesting and breaks the symmetry between primary and splash targets (who in a real fight are different characters with different stats).",
  },
  {
    title: 'Linear hit formula (vs. opposed-ratio / polynomial)',
    what:
      'hitChance = clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT). Every +1 stat moves hit chance by 1% relative to the opposing stat.',
    why:
      "Stats live at ability-mod magnitudes (typical −2..+5). The linear formula reads naturally in the steps panel — a player can mental-math 'I have +3 accuracy, they have +1 evasion → 92% hit'. PoE-style polynomial formulas only show their elegant curve at large stat magnitudes (hundreds), which isn't the design's stat scale. Keeping the formula linear keeps the math legible.",
  },
  {
    title: 'Independent block roll (vs. attack-table band)',
    what:
      'Block is rolled separately AFTER the hit roll succeeds. Result: a `blocked` flag that halves damage at the block-applied step.',
    why:
      "Block's effective rate equals block_chance directly — no overlap eating into it. The previous four-band model had block compete with miss / dodge / parry for the d100's slice (e.g. a defender with 30% miss + 30% dodge + 30% block actually only blocked 10% because earlier bands consumed the roll). Independent block lets defenders stack avoidance + mitigation cleanly.",
  },
  {
    title: 'Uniform damage roll with skill floor (vs. Gaussian)',
    what:
      'damage = uniform(value · profFloor, value). profFloor scales 0 → FLOOR_CAP across proficiency 1 → 99. Heals skip the roll entirely (deterministic).',
    why:
      "RuneScape-flavoured swing — pure uniform at level 1 (any roll possible), uniform [0.3·max, max] at level 99 (still swingy, never whiffs). Skill raises the floor instead of tightening the curve. Cleaner than the previous Gaussian (no σ tuning, no edge clamping artefacts) and the swing feels right for the small-magnitude stat model where one big-roll-vs-one-small-roll matters mechanically.",
  },
  {
    title: 'Symmetric defense model (physical / magical parity)',
    what:
      "Every physical defense gate has a magical twin: accuracy / spell_accuracy, evasion / spell_evasion, block_chance / spell_block_chance. magic_resist mirrors armor as the mitigation layer. Crit and damage roll mechanics are school-agnostic.",
    why:
      "Closes the old gap where magical attacks had ONLY mitigation (magic_resist) and no defender-driven avoidance. Gives spell defense the same tactical depth as physical defense and lets WIS own the magical defense identity (spell_evasion + magic_resist) the way DEX owns physical (accuracy + evasion). Designers can build evasive vs. resistant caster archetypes the same way they build evasive vs. armored fighters.",
  },
  {
    title: 'Per-group crit roll (vs. cast-wide)',
    what:
      "Each target group rolls its own crit. Primary can crit while splash doesn't, and vice versa. The crit stat is picked from the group's first effect (heal_crit / spell_crit / crit_chance).",
    why:
      "PoE convention — crit is per-hit-per-target, not per-cast. Splash hits resolve as independent events; their crit outcomes don't have to mirror the primary's. Combined with per-group attack-table rolls, this means a single cast against five targets has up to five independent hit/crit outcomes, which feels more chaotic and rewarding than 'one die for the whole cast'.",
  },
  {
    title: 'Heals skip the damage roll',
    what:
      'Heal effects bypass the uniform damage roll (and the Gaussian one before it). Healing is deterministic given the inputs.',
    why:
      "Most RPGs (D&D, PoE) make heals deterministic so healer-class identity doesn't depend on luck. Predictable healing is a healer's brand: a tank can plan around the incoming heal. Removes the 'lucky big heal' moment, but the tradeoff is worth it for build legibility. Easy to revisit if a future ability really wants random heals.",
  },
]

export function DesignNotesPanel() {
  return (
    <div className="dmg-design-notes">
      <div className="dmg-design-notes-label">Design decisions</div>
      <dl className="dmg-design-notes-list">
        {DESIGN_NOTES.map((n) => (
          <div key={n.title} className="dmg-design-note">
            <dt>{n.title}</dt>
            <dd>
              <div className="dmg-design-note-what">
                <span className="dmg-design-note-marker">What:</span>{' '}
                {n.what}
              </div>
              <div className="dmg-design-note-why">
                <span className="dmg-design-note-marker">Why:</span>{' '}
                {n.why}
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FlowEndpoint({ role }: { role: 'attacker' | 'defender' }) {
  const isAttacker = role === 'attacker'
  return (
    <div className={`flowchart-endpoint flowchart-endpoint-${role}`}>
      <div className="flowchart-endpoint-label">
        {isAttacker ? 'Attacker' : 'Defender'}
      </div>
      <div className="flowchart-endpoint-blurb">
        {isAttacker
          ? 'Source character. Picks an action or spell to use.'
          : 'Target character. Final HP, mitigation stats, and defensive evasions apply here.'}
      </div>
    </div>
  )
}

function FlowSectionBlock({
  section,
  arrow,
}: {
  section: FlowSection
  arrow: boolean
}) {
  if (section.kind === 'shared') {
    return (
      <>
        <FlowStepBlock step={section.step} />
        {arrow && <FlowArrow />}
      </>
    )
  }
  return (
    <>
      <div className="flowchart-effect-block">
        <div className="flowchart-effect-block-head">
          <span className="flowchart-effect-block-badge">loop</span>
          <span className="flowchart-effect-block-label">{section.label}</span>
        </div>
        <p className="flowchart-effect-block-blurb">{section.blurb}</p>
        {section.steps.map((step, i) => (
          <div key={step.n} className="flowchart-effect-step">
            <FlowStepBlock step={step} />
            {i < section.steps.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>
      {arrow && <FlowArrow />}
    </>
  )
}

function FlowStepBlock({ step }: { step: FlowStep }) {
  const isForked = step.body.kind === 'forked'
  return (
    <article className={`flowchart-step${isForked ? ' flowchart-step-forked' : ''}`}>
      <div className="flowchart-step-head">
        <span className="flowchart-step-num">{step.n}</span>
        <span className="flowchart-step-title">{step.title}</span>
      </div>
      <p className="flowchart-step-blurb">{step.blurb}</p>

      {step.body.kind === 'shared' ? (
        <FlowStepContentBlock content={step.body.content} />
      ) : (
        <div className="flowchart-fork">
          <div className="flowchart-fork-col flowchart-fork-physical">
            <div className="flowchart-fork-col-label">Physical</div>
            <FlowStepContentBlock content={step.body.physical} />
          </div>
          <div className="flowchart-fork-col flowchart-fork-magical">
            <div className="flowchart-fork-col-label">Magical</div>
            <FlowStepContentBlock content={step.body.magical} />
          </div>
        </div>
      )}
    </article>
  )
}

function FlowStepContentBlock({ content }: { content: FlowContent }) {
  if (content.kind === 'skipped') {
    return <div className="flowchart-skipped">{content.note}</div>
  }
  return (
    <>
      <FlowField label="Inputs" multiline={false}>
        {content.inputs.map((tag, i) => (
          <span key={i} className="flowchart-tag">
            {tag}
          </span>
        ))}
      </FlowField>
      <FlowField label="Formula" multiline>
        <pre className="flowchart-formula">{content.formula}</pre>
      </FlowField>
      <FlowField label="Output" multiline={false}>
        <span className="flowchart-output">{content.output}</span>
      </FlowField>
    </>
  )
}

function FlowField({
  label,
  multiline,
  children,
}: {
  label: string
  multiline: boolean
  children: ReactNode
}) {
  return (
    <div className={`flowchart-field${multiline ? ' flowchart-field-multiline' : ''}`}>
      <div className="flowchart-field-label">{label}</div>
      <div className="flowchart-field-body">{children}</div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="flowchart-arrow" aria-hidden="true">
      ↓
    </div>
  )
}
