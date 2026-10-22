import {
  pieceAt,
  pieceLabels,
  isInCheck,
  type GameState,
  type Position,
} from "../game/xiangqi";
type Snapshot = {
  state: GameState;
  selectedId: string | null;
  moves: Position[];
  locked: boolean;
  last: { from: Position; to: Position } | null;
};
export function createTacticalBoard(
  read: () => Snapshot,
  choose: (p: Position) => void,
  preview: (p: Position | null) => void,
) {
  const panel = document.querySelector<HTMLElement>("#tactical-panel")!,
    toggle = document.querySelector<HTMLButtonElement>("#tactical-toggle")!,
    board = document.querySelector<HTMLElement>("#tactical-board")!,
    caption = document.querySelector<HTMLElement>("#tactical-caption")!;
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 8 9");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const e = document.createElementNS(ns, "line");
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 }))
      e.setAttribute(k, String(v));
    svg.append(e);
  };
  for (let y = 0; y < 10; y++) line(0, y, 8, y);
  for (let x = 0; x < 9; x++) {
    line(x, 0, x, x === 0 || x === 8 ? 9 : 4);
    if (x > 0 && x < 8) line(x, 5, x, 9);
  }
  for (const y of [0, 7]) {
    line(3, y, 5, y + 2);
    line(5, y, 3, y + 2);
  }
  board.append(svg);
  const river = document.createElement("span");
  river.className = "tactical-river";
  river.textContent = "楚 河　　汉 界";
  board.append(river);
  const cells = Array.from({ length: 90 }, (_, i) => {
    const at = { x: i % 9, y: Math.floor(i / 9) },
      b = document.createElement("button");
    b.type = "button";
    b.className = "tactical-cell";
    b.style.left = `${(at.x / 8) * 100}%`;
    b.style.top = `${(at.y / 9) * 100}%`;
    b.dataset.x = String(at.x);
    b.dataset.y = String(at.y);
    b.tabIndex = i === 81 ? 0 : -1;
    let timer = 0,
      held = false;
    b.addEventListener("pointerdown", (e) => {
      held = false;
      if (e.pointerType === "touch")
        timer = window.setTimeout(() => {
          if (read().moves.some((p) => p.x === at.x && p.y === at.y)) {
            held = true;
            preview(at);
          }
        }, 450);
    });
    b.addEventListener("pointerup", () => clearTimeout(timer));
    b.addEventListener("pointerleave", () => clearTimeout(timer));
    b.addEventListener("pointercancel", () => {
      clearTimeout(timer);
      held = false;
      preview(null);
    });
    b.addEventListener("click", () => {
      if (held) {
        held = false;
        return;
      }
      choose(at);
    });
    b.addEventListener("pointerenter", () => preview(at));
    b.addEventListener("focus", () => preview(at));
    b.addEventListener("blur", () => preview(null));
    b.addEventListener("keydown", (e) => {
      if (!e.key.startsWith("Arrow")) return;
      e.preventDefault();
      const x = Math.max(
          0,
          Math.min(
            8,
            at.x +
              (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0),
          ),
        ),
        y = Math.max(
          0,
          Math.min(
            9,
            at.y + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0),
          ),
        );
      cells.forEach((c) => (c.tabIndex = -1));
      cells[y * 9 + x].tabIndex = 0;
      cells[y * 9 + x].focus();
    });
    board.append(b);
    return b;
  });
  board.addEventListener("pointerleave", () => preview(null));
  const open = (show: boolean) => {
    panel.hidden = !show;
    toggle.setAttribute("aria-expanded", String(show));
    toggle.textContent = show ? "收起棋局 · M" : "看棋局 · M";
    if (!show) {
      preview(null);
      toggle.focus();
    }
  };
  toggle.addEventListener("click", () => open(panel.hidden));
  document.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.key.toLowerCase() === "m") {
      e.preventDefault();
      open(panel.hidden);
    }
    if (e.key === "Escape" && !panel.hidden) open(false);
  });
  return {
    render() {
      const { state, selectedId, moves, locked, last } = read(),
        selected = state.pieces.find((p) => p.id === selectedId),
        crossedSoldier = selected?.kind === "soldier" && (selected.side === "red" ? selected.y <= 4 : selected.y >= 5),
        check = isInCheck(state, state.turn),
        same = (p: Position | undefined, x: number, y: number) =>
          p?.x === x && p?.y === y;
      board.setAttribute("aria-busy", String(locked));
      cells.forEach((b, i) => {
        const x = i % 9,
          y = Math.floor(i / 9),
          piece = pieceAt(state, { x, y }),
          legal = moves.some((p) => p.x === x && p.y === y);
        b.textContent = piece ? pieceLabels[piece.side][piece.kind] : "";
        b.className = [
          "tactical-cell",
          piece?.side ?? "empty",
          piece?.id === selectedId ? "selected" : "",
          legal ? "legal" : "",
          legal && piece ? "capture" : "",
          same(last?.from, x, y) || same(last?.to, x, y) ? "last-move" : "",
          check && piece?.kind === "general" && piece.side === state.turn
            ? "in-check"
            : "",
        ].join(" ");
        b.dataset.pieceId = piece?.id ?? "";
        b.setAttribute(
          "aria-label",
          `从左第${x + 1}路第${y + 1}排，${piece ? `${piece.side === "red" ? "红" : "黑"}方${pieceLabels[piece.side][piece.kind]}` : "空位"}${legal ? "，可落子" : ""}`,
        );
        b.setAttribute("aria-pressed", String(piece?.id === selectedId));
        b.setAttribute("aria-disabled", String(locked));
      });
      caption.textContent = locked
        ? "正在行军…"
        : state.winner
          ? "本局结束"
          : check
            ? "将军！请应对"
            : selectedId
              ? crossedSoldier ? "已过河，可前进或横移 · 须保护主帅" : "点亮处可落子 · 悬停/长按看道路"
              : "点击选子 · 方向键移动焦点";
    },
  };
}
