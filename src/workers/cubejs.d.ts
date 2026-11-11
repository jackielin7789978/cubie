// cubejs 沒有附型別，這裡只宣告專案用到的部分
declare module 'cubejs' {
  export default class Cube {
    /** 建立解法用的查表（約數秒），整個程式只需要呼叫一次 */
    static initSolver(): void;
    /** 從 54 字元的 facelet 字串（U R F D L B 順序）建立方塊 */
    static fromString(facelets: string): Cube;
    /** 套用記號，例如 "R U' F2" */
    move(notation: string): this;
    asString(): string;
    isSolved(): boolean;
    /** 回傳解法記號，以空白分隔，例如 "R U2 F'" */
    solve(maxDepth?: number): string;
  }
}
