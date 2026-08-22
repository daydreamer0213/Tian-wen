import {
  inspectEvolutionChampion,
} from './ledger.js'
import type { ChampionPointer } from './ledger.js'

export { LedgerIntegrityError } from './ledger.js'

export interface EvolutionLedgerInspection {
  readonly champion: ChampionPointer | null
}

export function inspectEvolutionLedger(
  root: string,
): EvolutionLedgerInspection {
  return { champion: inspectEvolutionChampion(root) ?? null }
}
