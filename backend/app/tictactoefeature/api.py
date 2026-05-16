"""Public FastAPI router for the Tic Tac Toe Agent feature."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser

from .schemas import (
    AgentMoveResponse,
    GameState,
    Move,
    MoveRequest,
    NewGameRequest,
)
from .services import store
from .services.engine import apply_move

router = APIRouter(prefix="/tictactoe", tags=["tictactoe"])


def _get_or_404(game_id: str) -> GameState:
    try:
        return store.get_game(game_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Game not found"
        ) from exc


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "feature": "tictactoe-agent"}


@router.post("/game/new", response_model=GameState)
def new_game(payload: NewGameRequest, _user: CurrentUser) -> GameState:
    return store.create_game(payload.human_player, payload.difficulty)


@router.get("/game/{game_id}", response_model=GameState)
def get_game(game_id: str, _user: CurrentUser) -> GameState:
    return _get_or_404(game_id)


@router.post("/game/{game_id}/move", response_model=GameState)
def make_move(game_id: str, payload: MoveRequest, _user: CurrentUser) -> GameState:
    state = _get_or_404(game_id)
    move = Move(player=state.current_player, position=payload.position)
    try:
        new_state = apply_move(state, move)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    store.save_game(new_state)
    return new_state


@router.post("/game/{game_id}/agent-move", response_model=AgentMoveResponse)
def agent_move(game_id: str, _user: CurrentUser) -> AgentMoveResponse:
    state = _get_or_404(game_id)
    if state.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Game already finished"
        )

    agent_player = store.get_agent_player(game_id)
    if state.current_player != agent_player:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"It's {state.current_player}'s turn, not the agent's",
        )

    agent = store.build_agent(game_id)
    chosen = agent.choose_move(state)
    new_state = apply_move(state, chosen)
    store.save_game(new_state)
    return AgentMoveResponse(
        state=new_state,
        chosen_move=chosen,
        reasoning=f"minimax/{store.get_difficulty(game_id)}",
    )


@router.post("/game/{game_id}/reset", response_model=GameState)
def reset_game(game_id: str, _user: CurrentUser) -> GameState:
    try:
        return store.reset_game(game_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Game not found"
        ) from exc


def initialize() -> None:
    return None
