/** 学びの案を、規範のファイルに足す 1 行にする。Claude が付けた先頭の「- 」「(同)」「(日付「題」)」は落とす (見出しは studio が付ける) */
export function cleanLearning(text: string): string {
  return text
    .trim()
    .replace(/^[-*]\s*/, '')
    .replace(/^\((?:同|\d{4}-\d{2}(?:-\d{2})?「[^」]*」)\)\s*/, '')
    .replace(/\s*\n\s*/g, ' ')
}
