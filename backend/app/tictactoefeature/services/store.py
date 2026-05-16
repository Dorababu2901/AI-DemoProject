"""In-memory game store + agent factory."""
from __future__ import annotations

import uuid
from threading import Lock
from typing import Dict, Optional

from ..schemas import GameState, Player
from .agent import MinimaxAgent
from .engine import new_board, other

_DEFAULT_DIFFICULTY = "medium"

_games: Dict[str, GameState] = {}
_difficulties: Dict[str, str] = {}
_human: Dict[str, Player] = {}
_lock = Lock()


def create_game(human_player: Player, difficulty: Optional[str]) -> GameState:
    diff = difficulty or _DEFAULT_DIFFICULTY
    game_id = uuid.uuid4().hex[:12]
    state = GameState(
        game_id=game_id,
        board=new_board(),
        current_player="X",
        status="in_progress",
        winner=None,
        move_history=[],
    )
    with _lock:
        _games[game_id] = state
        _difficulties[game_id] = diff
        _human[game_id] = human_player
    return state


def get_game(game_id: str) -> GameState:
    with _lock:
        state = _games.get(game_id)
    if state is None:
        raise KeyError(game_id)
    return state


def save_game(state: GameState) -> None:
    with _lock:
        _games[state.game_id] = state


def reset_game(game_id: str) -> GameState:
    with _lock:
        if game_id not in _games:
            raise KeyError(game_id)
        fresh = GameState(
            game_id=game_id,
            board=new_board(),
            current_player="X",
            status="in_progress",
            winner=None,
            move_history=[],
        )
        _games[game_id] = fresh
    return fresh


def get_agent_player(game_id: str) -> Player:
    with _lock:
        human = _human.get(game_id, "X")
    return other(human)


def get_difficulty(game_id: str) -> str:
    with _lock:
        return _difficulties.get(game_id, _DEFAULT_DIFFICULTY)


def build_agent(game_id: str) -> MinimaxAgent:
    return MinimaxAgent(difficulty=get_difficulty(game_id))
