#!/usr/bin/env node
/**
 * 天问隔离 CLI 执行回执的运维汇总工具。
 *
 * 合同：docs/operations/isolated-cli-receipt-summary-contract.md
 * 仅使用 Node 22 标准库：从 stdin 读取一个 JSON 对象，向 stdout 写一个 JSON 值。
 * 不读取其他文件、不启动子进程、不联网、不修改任何数据。
 *
 * 说明：这里只汇总回执字段，不是完整执行器结果判定、程序功能正确性
 * 或学习效果判定；不计测试通过，也不输出“任务成功”一类结论。
 */

const INVALID_RESULT = '{"error":"invalid-receipts"}';
const SCHEMA_VERSION = 'tianwen.isolated-cli-receipt-summary.v1';
const MAX_RECEIPTS = 64;
const MAX_NAME_LENGTH = 128;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const isExitCode = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;

/**
 * 校验单条回执，只检查合同使用的字段与类型。
 * 合法时返回规范化记录，否则返回 null。
 */
function validateReceipt(receipt) {
  if (!isPlainObject(receipt)) return null;

  const { name, boundaryVerified, removed, recoveredByName, state, output } = receipt;

  if (!isNonEmptyString(name) || name.length > MAX_NAME_LENGTH) return null;
  if (typeof boundaryVerified !== 'boolean') return null;
  if (typeof removed !== 'boolean') return null;
  if (typeof recoveredByName !== 'boolean') return null;

  // failure 可以缺省；一旦存在，必须是非空字符串。
  const failurePresent = hasOwn(receipt, 'failure');
  if (failurePresent && !isNonEmptyString(receipt.failure)) return null;

  // state 必需，可为 null；为对象时必须含 status、exitCode、oom。
  if (!hasOwn(receipt, 'state')) return null;
  if (state !== null) {
    if (!isPlainObject(state)) return null;
    if (!isNonEmptyString(state.status)) return null;
    if (!isExitCode(state.exitCode)) return null;
    if (typeof state.oom !== 'boolean') return null;
  }

  // output 必需，可为 null；为对象时必须含布尔 interrupted。
  if (!hasOwn(receipt, 'output')) return null;
  if (output !== null) {
    if (!isPlainObject(output)) return null;
    if (typeof output.interrupted !== 'boolean') return null;
  }

  return {
    name,
    boundaryVerified,
    removed,
    recoveredByName,
    failurePresent,
    state,
    output,
  };
}

/** 依合同次序收集单条回执需要注意的原因。 */
function collectReasons(receipt) {
  const reasons = [];

  if (!receipt.boundaryVerified) reasons.push('boundary-unverified');
  if (!receipt.removed) reasons.push('cleanup-unknown');
  if (receipt.failurePresent) reasons.push('setup-failure');

  if (receipt.output === null) reasons.push('output-missing');
  else if (receipt.output.interrupted) reasons.push('transport-interrupted');

  if (receipt.state === null) reasons.push('state-missing');
  else if (receipt.state.status !== 'exited') reasons.push('state-not-exited');

  if (receipt.state !== null && receipt.state.oom) reasons.push('oom-killed');

  return reasons;
}

/** 汇总已校验的回执；各项计数彼此独立，可以重叠。 */
function summarize(receipts) {
  const summary = {
    schemaVersion: SCHEMA_VERSION,
    total: receipts.length,
    boundaryVerified: 0,
    removed: 0,
    recoveredByName: 0,
    recordedExits: 0,
    nonzeroExits: 0,
    oomKilled: 0,
    transportInterrupted: 0,
    setupFailures: 0,
    missingOutputs: 0,
    attention: [],
  };

  for (const receipt of receipts) {
    if (receipt.boundaryVerified) summary.boundaryVerified += 1;
    if (receipt.removed) summary.removed += 1;
    if (receipt.recoveredByName) summary.recoveredByName += 1;
    if (receipt.failurePresent) summary.setupFailures += 1;

    if (receipt.output === null) summary.missingOutputs += 1;
    else if (receipt.output.interrupted) summary.transportInterrupted += 1;

    if (receipt.state !== null && receipt.state.status === 'exited') {
      summary.recordedExits += 1;
      if (receipt.state.exitCode !== 0) summary.nonzeroExits += 1;
    }
    if (receipt.state !== null && receipt.state.oom) summary.oomKilled += 1;

    const reasons = collectReasons(receipt);
    if (reasons.length > 0) summary.attention.push({ name: receipt.name, reasons });
  }

  // 按 name 的字符串代码单元顺序升序，与输入顺序无关。
  summary.attention.sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });

  return summary;
}

/** 校验顶层输入并生成汇总；无效输入返回 null。 */
function buildSummary(parsed) {
  if (!isPlainObject(parsed)) return null;
  if (!Array.isArray(parsed.receipts)) return null;
  if (parsed.receipts.length > MAX_RECEIPTS) return null;

  const seenNames = new Set();
  const receipts = [];

  for (const item of parsed.receipts) {
    const receipt = validateReceipt(item);
    if (receipt === null) return null;
    if (seenNames.has(receipt.name)) return null;
    seenNames.add(receipt.name);
    receipts.push(receipt);
  }

  return summarize(receipts);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function emitInvalid() {
  process.stdout.write(`${INVALID_RESULT}\n`);
  process.exitCode = 2;
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    emitInvalid();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    emitInvalid();
    return;
  }

  const summary = buildSummary(parsed);
  if (summary === null) {
    emitInvalid();
    return;
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch(() => {
  emitInvalid();
});
