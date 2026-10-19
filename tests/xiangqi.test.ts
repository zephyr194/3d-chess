import { describe, expect, it } from 'vitest';
import { applyMove, initialState, isLegalMove, legalMoves, pieceAt, type GameState, type Piece } from '../src/game/xiangqi';

describe('xiangqi rules', () => {
  const soldierPosition = (side: 'red' | 'black', x: number, y: number, extra: Piece[] = [], facing = false): GameState => ({
    pieces: [
      { id: 'red-general', side: 'red', kind: 'general', x: 4, y: 9 },
      { id: 'black-general', side: 'black', kind: 'general', x: facing ? 4 : 3, y: 0 },
      { id: 'mover', side, kind: 'soldier', x, y },
      ...extra,
    ], turn: side, winner: null,
  });

  it.each([
    ['red', 4, 3], ['black', 5, 6],
  ] as const)('allows a crossed %s soldier forward and both sideways destinations', (side, y, nextY) => {
    const state = soldierPosition(side, 4, y), mover = state.pieces.find((p) => p.id === 'mover')!;
    expect(legalMoves(state, mover)).toEqual(expect.arrayContaining([{ x: 3, y }, { x: 5, y }, { x: 4, y: nextY }]));
    expect(legalMoves(state, mover)).toHaveLength(3);
    expect(applyMove(state, mover.id, { x: 3, y })?.state.pieces.find((p) => p.id === mover.id)).toMatchObject({ x: 3, y });
  });

  it.each([['red', 5, 4], ['black', 4, 5]] as const)('unlocks %s sideways movement only after crossing the river', (side, y, crossedY) => {
    const state = soldierPosition(side, 4, y), mover = state.pieces.find((p) => p.id === 'mover')!;
    expect(legalMoves(state, mover)).toEqual([{ x: 4, y: crossedY }]);
    const crossed = soldierPosition(side, 4, crossedY), crossedMover = crossed.pieces.find((p) => p.id === 'mover')!;
    expect(isLegalMove(crossed, crossedMover, { x: 5, y: crossedY })).toBe(true);
    expect(isLegalMove(crossed, crossedMover, { x: 4, y })).toBe(false);
  });

  it.each([['red', 4], ['black', 5]] as const)('lets a crossed %s soldier capture sideways but blocks an ally', (side, y) => {
    const enemy: Piece = { id: 'enemy', side: side === 'red' ? 'black' : 'red', kind: 'chariot', x: 5, y },
      ally: Piece = { id: 'ally', side, kind: 'soldier', x: 3, y },
      state = soldierPosition(side, 4, y, [enemy, ally]), mover = state.pieces.find((p) => p.id === 'mover')!;
    expect(isLegalMove(state, mover, { x: 3, y })).toBe(false);
    const result = applyMove(state, mover.id, { x: 5, y });
    expect(result?.captured?.id).toBe('enemy');
    expect(result?.state.pieces.some((p) => p.id === 'enemy')).toBe(false);
  });

  it.each([['red', 0, 4], ['black', 8, 5]] as const)('keeps a crossed %s soldier inside the board edge', (side, x, y) => {
    const state = soldierPosition(side, x, y), mover = state.pieces.find((p) => p.id === 'mover')!;
    expect(legalMoves(state, mover)).toHaveLength(2);
    expect(isLegalMove(state, mover, { x: x === 0 ? -1 : 9, y })).toBe(false);
  });

  it.each([['red', 4, 3], ['black', 5, 6]] as const)('rejects crossed %s sideways moves exposing facing generals', (side, y, forwardY) => {
    const state = soldierPosition(side, 4, y, [], true), mover = state.pieces.find((p) => p.id === 'mover')!;
    expect(legalMoves(state, mover)).toEqual([{ x: 4, y: forwardY }]);
    expect(applyMove(state, mover.id, { x: 3, y })).toBeNull();
  });
  it('starts with 32 pieces and red to move', () => {
    const state = initialState();
    expect(state.pieces).toHaveLength(32);
    expect(state.turn).toBe('red');
  });

  it('lets a red soldier advance but not retreat', () => {
    const state = initialState();
    const soldier = pieceAt(state, { x: 0, y: 6 })!;
    expect(isLegalMove(state, soldier, { x: 0, y: 5 })).toBe(true);
    expect(isLegalMove(state, soldier, { x: 0, y: 7 })).toBe(false);
  });

  it('blocks a horse when its leg is occupied', () => {
    const state = initialState();
    const horse = pieceAt(state, { x: 1, y: 9 })!;
    expect(isLegalMove(state, horse, { x: 2, y: 7 })).toBe(true);
    expect(isLegalMove(state, horse, { x: 3, y: 8 })).toBe(false);
  });

  it('requires exactly one screen when a cannon captures', () => {
    const cannon: Piece = { id: 'red-cannon', side: 'red', kind: 'cannon', x: 4, y: 7 };
    const screen: Piece = { id: 'screen', side: 'red', kind: 'soldier', x: 4, y: 5 };
    const target: Piece = { id: 'target', side: 'black', kind: 'chariot', x: 4, y: 2 };
    const generals: Piece[] = [
      { id: 'red-general', side: 'red', kind: 'general', x: 4, y: 9 },
      { id: 'black-general', side: 'black', kind: 'general', x: 3, y: 0 },
    ];
    const state: GameState = { pieces: [cannon, screen, target, ...generals], turn: 'red', winner: null };
    expect(isLegalMove(state, cannon, target)).toBe(true);
  });

  it('moves a piece and changes the turn', () => {
    const state = initialState();
    const soldier = pieceAt(state, { x: 0, y: 6 })!;
    const result = applyMove(state, soldier.id, { x: 0, y: 5 });
    expect(result?.state.turn).toBe('black');
    expect(pieceAt(result!.state, { x: 0, y: 5 })?.kind).toBe('soldier');
  });

  it('returns legal opening moves', () => {
    const state = initialState();
    const cannon = pieceAt(state, { x: 1, y: 7 })!;
    expect(legalMoves(state, cannon).length).toBeGreaterThan(8);
  });
});
