import assert from 'node:assert/strict'
import { sha256 } from '@tianwen/evolution/learning-intake'
import { runDevelopmentNativeJobRunner } from '../development-native-job-runner.mjs'

// Prospective checks for the actual native review vocabulary. Historical
// acceptance and Tasks are never rewritten or regraded by this entry.
const originalWrite = process.stdout.write
const baselineOutput = []
try {
  process.stdout.write = text => { baselineOutput.push(String(text)); return true }
  await import('./development-native-job-runner-engineering-entry.mjs')
} finally { process.stdout.write = originalWrite }
const baseline = JSON.parse(baselineOutput.join(''))
assert.equal(baseline.engineeringOnly, true)
assert.equal(baseline.originalAcceptanceUnchanged, true)
assert.equal(baseline.passed.length, 21)
const passed = [...baseline.passed], transcript = []
for (const [name, verdict, expected] of [
  ['native-review-not-met', 'not-met', 1],
  ['native-review-met', 'met', 0],
  ['native-review-inconclusive', 'inconclusive', 2],
  ['missing-review-null', null, 2],
  ['unknown-review-no-success', 'unknown', 2],
]) {
  const result = {summary:{taskId:'prospective-native-task',completionStatus:'completed',functionalStatus:'verified',reviewVerdict:verdict,permissionSetExact:true,functionalCandidateVerified:true}}
  const before = sha256(result), output = [], errors = [], exits = []
  let calls = 0
  const signal = new AbortController().signal
  const receipt = await runDevelopmentNativeJobRunner({job:{async run(actual){assert.equal(actual,signal);calls++;return result}},signal,
    stdout:text=>output.push(text),stderr:text=>errors.push(text),exit:code=>exits.push(code)})
  assert.equal(calls,1)
  assert.deepEqual(exits,[expected])
  assert.equal(receipt.exitCode,expected)
  assert.equal(receipt.result,result)
  assert.equal(sha256(result),before)
  assert.deepEqual(output,[JSON.stringify(result)+'\n'])
  assert.deepEqual(errors,[])
  passed.push(name)
  transcript.push({verdict,exitCode:receipt.exitCode,originalResultDigest:before})
}
console.log(JSON.stringify({passed,transcriptDigest:sha256(transcript)}))
