"""Minimax-based agent with depth-limited difficulty."""
from __future__ import annotations

import random
from typing import List

from ..schemas import Cell, GameState, Move, Player
from .engine import (
    apply_move,
    available_positions,
    compute_status,
    other,
)


def _minimax(
    board: List[Cell],
    to_move: Player,
    agent_player: Player,
    depth: int,
    max_depth: int,
) -> int:
    status, winner = compute_status(board)
    if status == "won":
        return (10 - depth) if winner == agent_player else (depth - 10)
    if status == "draw":
        return 0
    if depth >= max_depth:
        return 0

    scores: list[int] = []
    for pos in available_positions(board):
        next_board = list(board)
        next_board[pos] = to_move
        scores.append(
            _minimax(next_board, other(to_move), agent_player, depth + 1, max_depth)
        )
    return max(scores) if to_move == agent_player else min(scores)


class MinimaxAgent:
    DEPTHS = {"easy": 1, "medium": 3, "hard": 9}
    RANDOMNESS = {"easy": 0.6, "medium": 0.15, "hard": 0.0}

    def __init__(self, difficulty: str = "medium") -> None:
        self.difficulty = difficulty if difficulty in self.DEPTHS else "medium"

    def choose_move(self, state: GameState) -> Move:
        if state.status != "in_progress":
            raise ValueError("Game is not in progress")
        agent_player = state.current_player
        options = available_positions(state.board)
        if not options:
            raise ValueError("No moves available")

        if random.random() < self.RANDOMNESS[self.difficulty]:
            return Move(player=agent_player, position=random.choice(options))

        max_depth = self.DEPTHS[self.difficulty]
        best_score = -(10**9)
        best_positions: list[int] = []
        for pos in options:
            trial = apply_move(state, Move(player=agent_player, position=pos))
            score = _minimax(
                trial.board, other(agent_player), agent_player, depth=1, max_depth=max_depth
            )
            if score > best_score:
                best_score = score
                best_positions = [pos]
            elif score == best_score:
                best_positions.append(pos)

        return Move(player=agent_player, position=random.choice(best_positions))
