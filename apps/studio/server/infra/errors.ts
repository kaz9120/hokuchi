// サーバの中で投げる失敗。http の層が、status をそのまま返す
export class StudioError extends Error {
  status: number
  current?: unknown
  constructor(status: number, message: string, current?: unknown) {
    super(message)
    this.status = status
    this.current = current
  }
}

export const notFound = (message: string) => new StudioError(404, message)
export const invalid = (message: string) => new StudioError(400, message)
/** 読んだ版と、いまのファイルが違う。画面は読み直してから直す */
export const conflict = (message = 'ほかで変更されています。画面を読み込み直してから直してください', current?: unknown) => new StudioError(409, message, current)
