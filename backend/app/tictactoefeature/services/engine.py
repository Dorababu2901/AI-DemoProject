"""Game engine: board state, win/draw detection, and move validation."""
from __future__ import annotations

from typing import List

from ..schemas import Cell, GameState, Move, Player, Status

WIN_LINES: tuple[tuple[int, int, int], ...] = (
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
)


def new_board() -> List[Cell]:
    return [None] * 9


def detect_winner(board: List[Cell]) -> Player | None:
    for a, b, c in WIN_LINES:
        if board[a] is not None and board[a] == board[b] == board[c]:
            return board[a]
    return None


def is_draw(board: List[Cell]) -> bool:
    return detect_winner(board) is None and all(c is not None for c in board)


def compute_status(board: List[Cell]) -> tuple[Status, Player | None]:
    winner = detect_winner(board)
    if winner is not None:
        return "won", winner
    if is_draw(board):
        return "draw", None
    return "in_progress", None


def other(player: Player) -> Player:
    return "O" if player == "X" else "X"


def is_valid_move(state: GameState, position: int) -> bool:
    if state.status != "in_progress":
        return False
    if not (0 <= position <= 8):
        return False
    return state.board[position] is None


def apply_move(state: GameState, move: Move) -> GameState:
    if not is_valid_move(state, move.position):
        raise ValueError("Invalid move")
    if move.player != state.current_player:
        raise ValueError(f"Not {move.player}'s turn")

    new_board_list = list(state.board)
    new_board_list[move.position] = move.player
    status, winner = compute_status(new_board_list)
    next_player = state.current_player if status != "in_progress" else other(move.player)

    return state.model_copy(
        update={
            "board": new_board_list,
            "current_player": next_player,
            "status": status,
            "winner": winner,
            "move_history": [*state.move_history, move],
        }
    )


def available_positions(board: List[Cell]) -> list[int]:
    return [i for i, c in enumerate(board) if c is None]
