"""Pydantic schemas for the Tic Tac Toe Agent feature."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Player = Literal["X", "O"]
Cell = Optional[Player]
Status = Literal["in_progress", "won", "draw"]
Difficulty = Literal["easy", "medium", "hard"]


class Move(BaseModel):
    player: Player
    position: int = Field(ge=0, le=8)


class GameState(BaseModel):
    game_id: str
    board: list[Cell] = Field(default_factory=lambda: [None] * 9)
    current_player: Player = "X"
    status: Status = "in_progress"
    winner: Optional[Player] = None
    move_history: list[Move] = Field(default_factory=list)


class NewGameRequest(BaseModel):
    human_player: Player = "X"
    difficulty: Optional[Difficulty] = None


class MoveRequest(BaseModel):
    position: int = Field(ge=0, le=8)


class AgentMoveResponse(BaseModel):
    state: GameState
    chosen_move: Move
    reasoning: Optional[str] = None
