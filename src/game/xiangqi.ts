export type Side = 'red' | 'black';
export type PieceKind = 'general' | 'advisor' | 'elephant' | 'horse' | 'chariot' | 'cannon' | 'soldier';

export interface Position { x: number; y: number }

export interface Piece extends Position {
  id: string;
  side: Side;
  kind: PieceKind;
}

export interface GameState {
  pieces: Piece[];
  turn: Side;
  winner: Side | null;
}

const inBounds = ({ x, y }: Position) => x >= 0 && x <= 8 && y >= 0 && y <= 9;
const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

export const pieceLabels: Record<Side, Record<PieceKind, string>> = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', soldier: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' },
};

export function initialState(): GameState {
  const pieces: Piece[] = [];
  let sequence = 0;
  const add = (side: Side, kind: PieceKind, x: number, y: number) => {
    pieces.push({ id: `${side}-${kind}-${sequence++}`, side, kind, x, y });
  };

  const home: PieceKind[] = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];
  home.forEach((kind, x) => add('black', kind, x, 0));
  add('black', 'cannon', 1, 2); add('black', 'cannon', 7, 2);
  [0, 2, 4, 6, 8].forEach((x) => add('black', 'soldier', x, 3));

  home.forEach((kind, x) => add('red', kind, x, 9));
  add('red', 'cannon', 1, 7); add('red', 'cannon', 7, 7);
  [0, 2, 4, 6, 8].forEach((x) => add('red', 'soldier', x, 6));
  return { pieces, turn: 'red', winner: null };
}

export const pieceAt = (state: GameState, position: Position) => state.pieces.find((piece) => samePosition(piece, position));

function pathCount(state: GameState, from: Position, to: Position): number {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  let count = 0;
  while (x !== to.x || y !== to.y) {
    if (pieceAt(state, { x, y })) count += 1;
    x += dx;
    y += dy;
  }
  return count;
}

function insidePalace(side: Side, { x, y }: Position) {
  return x >= 3 && x <= 5 && (side === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
}

function basicMoveAllowed(state: GameState, piece: Piece, to: Position): boolean {
  if (!inBounds(to) || samePosition(piece, to)) return false;
  const target = pieceAt(state, to);
  if (target?.side === piece.side) return false;
  const dx = to.x - piece.x;
  const dy = to.y - piece.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  switch (piece.kind) {
    case 'general': {
      const opposingGeneral = target?.kind === 'general' && target.side !== piece.side;
      if (opposingGeneral && dx === 0 && pathCount(state, piece, to) === 0) return true;
      return insidePalace(piece.side, to) && ax + ay === 1;
    }
    case 'advisor':
      return insidePalace(piece.side, to) && ax === 1 && ay === 1;
    case 'elephant': {
      if (ax !== 2 || ay !== 2) return false;
      if (piece.side === 'red' ? to.y < 5 : to.y > 4) return false;
      return !pieceAt(state, { x: piece.x + dx / 2, y: piece.y + dy / 2 });
    }
    case 'horse': {
      if (!((ax === 1 && ay === 2) || (ax === 2 && ay === 1))) return false;
      const leg = ax === 2
        ? { x: piece.x + Math.sign(dx), y: piece.y }
        : { x: piece.x, y: piece.y + Math.sign(dy) };
      return !pieceAt(state, leg);
    }
    case 'chariot':
      return (dx === 0 || dy === 0) && pathCount(state, piece, to) === 0;
    case 'cannon':
      if (dx !== 0 && dy !== 0) return false;
      return target ? pathCount(state, piece, to) === 1 : pathCount(state, piece, to) === 0;
    case 'soldier': {
      const forward = piece.side === 'red' ? -1 : 1;
      const crossedRiver = piece.side === 'red' ? piece.y <= 4 : piece.y >= 5;
      if (dy === forward && dx === 0) return true;
      return crossedRiver && dy === 0 && ax === 1;
    }
  }
}

function moveUnchecked(state: GameState, pieceId: string, to: Position): GameState {
  const mover = state.pieces.find((piece) => piece.id === pieceId);
  if (!mover) return state;
  const pieces = state.pieces
    .filter((piece) => !samePosition(piece, to) || piece.id === pieceId)
    .map((piece) => piece.id === pieceId ? { ...piece, ...to } : piece);
  return { ...state, pieces };
}

export function isInCheck(state: GameState, side: Side): boolean {
  const general = state.pieces.find((piece) => piece.side === side && piece.kind === 'general');
  if (!general) return true;
  return state.pieces
    .filter((piece) => piece.side !== side)
    .some((piece) => basicMoveAllowed(state, piece, general));
}

export function isLegalMove(state: GameState, piece: Piece, to: Position): boolean {
  if (state.winner || piece.side !== state.turn || !basicMoveAllowed(state, piece, to)) return false;
  const next = moveUnchecked(state, piece.id, to);
  return !isInCheck(next, piece.side);
}

export function legalMoves(state: GameState, piece: Piece): Position[] {
  const moves: Position[] = [];
  for (let y = 0; y <= 9; y += 1) {
    for (let x = 0; x <= 8; x += 1) {
      if (isLegalMove(state, piece, { x, y })) moves.push({ x, y });
    }
  }
  return moves;
}

export interface MoveResult {
  state: GameState;
  captured: Piece | null;
  check: boolean;
  gameOver: boolean;
}

export function applyMove(state: GameState, pieceId: string, to: Position): MoveResult | null {
  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece || !isLegalMove(state, piece, to)) return null;
  const captured = pieceAt(state, to) ?? null;
  const nextTurn: Side = state.turn === 'red' ? 'black' : 'red';
  let next = moveUnchecked(state, piece.id, to);
  const capturedGeneral = captured?.kind === 'general';
  next = { ...next, turn: nextTurn, winner: capturedGeneral ? piece.side : null };

  const opponentHasMove = capturedGeneral || next.pieces
    .filter((item) => item.side === nextTurn)
    .some((item) => legalMoves(next, item).length > 0);
  if (!capturedGeneral && !opponentHasMove) next = { ...next, winner: piece.side };
  const check = !capturedGeneral && isInCheck(next, nextTurn);
  return { state: next, captured, check, gameOver: Boolean(next.winner) };
}
