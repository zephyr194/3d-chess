import { pieceLabels, type PieceKind, type Side } from "../game/xiangqi";

export type BattleEvent =
  | { kind: "engage" | "capture"; side: Side; actor: PieceKind; target: PieceKind }
  | { kind: "check" | "victory"; side: Side };

export function createBattleBanner(element: HTMLElement) {
  const label = element.querySelector<HTMLElement>("[data-banner-label]")!,
    title = element.querySelector<HTMLElement>("[data-banner-title]")!,
    detail = element.querySelector<HTMLElement>("[data-banner-detail]")!;
  let timer: number | undefined;
  let struck = false;
  const clear = () => {
    window.clearTimeout(timer);
    timer = undefined;
    struck = false;
    element.hidden = true;
    element.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    element.classList.remove("show", "impact");
    title.textContent = detail.textContent = label.textContent = "";
  };
  return {
    clear,
    impact() {
      if (element.hidden || struck || element.dataset.event !== "engage") return false;
      struck = true;
      element.classList.add("impact");
      return true;
    },
    show(event: BattleEvent) {
      clear();
      const side = event.side === "red" ? "红方" : "黑方";
      element.dataset.event = event.kind;
      element.dataset.side = event.side;
      switch (event.kind) {
        case "engage":
        case "capture": {
          const actor = pieceLabels[event.side][event.actor],
            opponent = event.side === "red" ? "black" : "red",
            target = pieceLabels[opponent][event.target];
          label.textContent = event.kind === "engage" ? "交锋" : "破阵";
          title.textContent = `${actor}${event.kind === "engage" ? "出击" : "破阵"}`;
          detail.textContent = `${side}${actor}${event.kind === "engage" ? "迎战" : "击破"}${opponent === "red" ? "红方" : "黑方"}${target}`;
          break;
        }
        case "check":
          label.textContent = "将军";
          title.textContent = `${side}将军`;
          detail.textContent = "对方主帅受将，须立即应对";
          break;
        case "victory":
          label.textContent = "凯旋";
          title.textContent = `${side}获胜`;
          detail.textContent = "此局已定，山河待弈";
          break;
      }
      element.hidden = false;
      element.classList.add("show");
      if (event.kind !== "engage") timer = window.setTimeout(clear, event.kind === "victory" ? 3200 : 2200);
    },
  };
}
