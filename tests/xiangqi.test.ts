import { describe, expect, it } from 'vitest';
import { applyMove, initialState, isLegalMove, legalMoves, pieceAt, type GameState, type Piece } from '../src/game/xiangqi';

describe('xiangqi rules', () => {
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
