import { prepareIsolatedJsonCli, validateIsolatedJsonContainer, isolatedPythonPolicy,
  type IsolatedPythonCliConfig, type IsolatedPythonIdentity, type PreparedIsolatedPythonCli } from './isolated-python-cli.js'

export type IsolatedNodeCliConfig = IsolatedPythonCliConfig
export const isolatedNodePolicy = isolatedPythonPolicy
export function prepareIsolatedNodeCli(config: IsolatedNodeCliConfig, signal: AbortSignal, language: 'javascript' | 'typescript'): Promise<PreparedIsolatedPythonCli> {
  return prepareIsolatedJsonCli(config, signal, language)
}
export function validateIsolatedNodeContainer(value: unknown, identity: IsolatedPythonIdentity, language: 'javascript' | 'typescript'): void {
  validateIsolatedJsonContainer(value, identity, language)
}
