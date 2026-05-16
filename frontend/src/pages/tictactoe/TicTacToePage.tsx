import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type Player = "X" | "O";
type Cell = Player | null;
type GameStatus = "in_progress" | "won" | "draw";
type Difficulty = "easy" | "medium" | "hard";

interface Move {
  player: Player;
  position: number;
}
interface GameState {
  game_id: string;
  board: Cell[];
  current_player: Player;
  status: GameStatus;
  winner: Player | null;
  move_history: Move[];
}
interface AgentMoveResponse {
  state: GameState;
  chosen_move: Move;
  reasoning?: string | null;
}

const BASE = "/api/v1/tictactoe";

export default function TicTacToePage() {
  const [state, setState] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [humanPlayer] = useState<Player>("X");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentBusy = useRef(false);

  const startNewGame = useCallback(async () => {
    setError(null);
    try {
      const s = await api.post<GameState>(`${BASE}/game/new`, {
        human_player: humanPlayer,
        difficulty,
      });
      setState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [humanPlayer, difficulty]);

  const handleCellClick = useCallback(
    async (position: number) => {
      if (!state || state.status !== "in_progress") return;
      if (state.current_player !== humanPlayer) return;
      if (state.board[position] !== null) return;
      setError(null);
      try {
        const after = await api.post<GameState>(
          `${BASE}/game/${state.game_id}/move`,
          { position },
        );
        setState(after);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [state, humanPlayer],
  );

  const handleReset = useCallback(async () => {
    if (!state) return;
    setError(null);
    try {
      const s = await api.post<GameState>(`${BASE}/game/${state.game_id}/reset`);
      setState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [state]);

  // Trigger agent move when it's not the human's turn.
  useEffect(() => {
    if (!state || state.status !== "in_progress") return;
    if (state.current_player === humanPlayer) return;
    if (agentBusy.current) return;
    agentBusy.current = true;
    setThinking(true);
    const id = window.setTimeout(async () => {
      try {
        const resp = await api.post<AgentMoveResponse>(
          `${BASE}/game/${state.game_id}/agent-move`,
        );
        setState(resp.state);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setThinking(false);
        agentBusy.current = false;
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [state, humanPlayer]);

  const disabled =
    !state ||
    state.status !== "in_progress" ||
    state.current_player !== humanPlayer ||
    thinking;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Chat
        </Link>
        <h1 className="text-base font-semibold">Tic Tac Toe Agent</h1>
        <span className="text-xs text-slate-400">minimax-powered</span>
      </header>

      <main className="max-w-md mx-auto p-6">
        <div className="bg-white rounded-2xl shadow p-6 space-y-5">
          <p className="text-center text-xs text-slate-500">
            You are <span className="font-bold text-indigo-600">{humanPlayer}</span> · Agent is{" "}
            <span className="font-bold text-rose-600">
              {humanPlayer === "X" ? "O" : "X"}
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-3 justify-center">
            <label className="text-sm text-slate-700">
              Difficulty:&nbsp;
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <button
              type="button"
              onClick={startNewGame}
              className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700"
            >
              New game
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!state}
              className="px-3 py-1.5 text-sm rounded bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 w-72 h-72 mx-auto">
            {(state?.board ?? Array(9).fill(null)).map((cell: Cell, i: number) => {
              const filled = cell !== null;
              const clickable = !disabled && !filled;
              const color =
                cell === "X"
                  ? "text-indigo-600"
                  : cell === "O"
                    ? "text-rose-600"
                    : "text-slate-300";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => clickable && handleCellClick(i)}
                  disabled={!clickable}
                  className={[
                    "rounded-lg border border-slate-200 bg-white shadow-sm",
                    "flex items-center justify-center text-5xl font-bold select-none",
                    clickable ? "hover:bg-slate-50 cursor-pointer" : "cursor-default",
                    color,
                  ].join(" ")}
                >
                  {cell ?? ""}
                </button>
              );
            })}
          </div>

          {!state ? (
            <div className="text-center text-sm text-slate-500">
              Click "New game" to start.
            </div>
          ) : state.status === "won" ? (
            <div
              className={`rounded px-3 py-2 text-sm font-medium text-center ${
                state.winner === humanPlayer
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {state.winner === humanPlayer ? "🎉 You win!" : "🤖 Agent wins!"} (
              {state.winner})
            </div>
          ) : state.status === "draw" ? (
            <div className="rounded px-3 py-2 text-sm font-medium text-center bg-amber-100 text-amber-800">
              It's a draw.
            </div>
          ) : (
            <div className="rounded px-3 py-2 text-sm font-medium text-center bg-slate-100 text-slate-700">
              {thinking
                ? "Agent is thinking…"
                : state.current_player === humanPlayer
                  ? `Your turn (${humanPlayer})`
                  : `Agent's turn (${state.current_player})`}
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {state && state.move_history.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500">
                Move history ({state.move_history.length})
              </summary>
              <ol className="mt-2 text-slate-600 space-y-0.5 list-decimal list-inside">
                {state.move_history.map((m, i) => (
                  <li key={i}>
                    {m.player} → cell {m.position}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
