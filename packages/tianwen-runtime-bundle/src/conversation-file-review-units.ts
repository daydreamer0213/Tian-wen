/** Preserve every file character in chunks of at most 384 Unicode code points. */
export function splitConversationFileReviewText(raw: string): readonly string[] {
  if (raw.length === 0) {
    return [''];
  }
  const units = Array.from(raw);
  const chunks: string[] = [];
  const chunkSize = 384;
  for (let start = 0; start < units.length; start += chunkSize) {
    chunks.push(units.slice(start, start + chunkSize).join(''));
  }
  return chunks;
}
