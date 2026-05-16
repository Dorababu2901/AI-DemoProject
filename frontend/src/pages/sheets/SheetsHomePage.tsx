import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { sheetsApi, type SheetDataset } from "../../lib/sheetsApi";

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return String((e.data as any)?.detail ?? e.message);
  return (e as Error)?.message ?? "Request failed";
}

export default function SheetsHomePage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<SheetDataset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [worksheet, setWorksheet] = useState("");

  // Google Sheet form state
  const [gName, setGName] = useState("");
  const [gUrl, setGUrl] = useState("");
  const [gWs, setGWs] = useState("");

  const refresh = () =>
    sheetsApi
      .list()
      .then(setDatasets)
      .catch(() => setDatasets([]));

  useEffect(() => {
    refresh();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const ds = await sheetsApi.uploadFile(file, uploadName || undefined, worksheet || undefined);
      setFile(null);
      setUploadName("");
      setWorksheet("");
      await refresh();
      navigate(`/sheets/${ds.id}/ask`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gName.trim() || !gUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const ds = await sheetsApi.addGoogleSheet({
        name: gName.trim(),
        sheet_url: gUrl.trim(),
        worksheet: gWs.trim() || undefined,
      });
      setGName("");
      setGUrl("");
      setGWs("");
      await refresh();
      navigate(`/sheets/${ds.id}/ask`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this dataset?")) return;
    try {
      await sheetsApi.remove(id);
      await refresh();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Chat
        </Link>
        <h1 className="text-base font-semibold">Talk to your spreadsheet</h1>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <section className="grid md:grid-cols-2 gap-6">
          <form
            onSubmit={handleUpload}
            className="bg-white border rounded p-4 space-y-3"
          >
            <h2 className="font-semibold">Upload CSV / XLSX</h2>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <input
              type="text"
              placeholder="Dataset name (optional)"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Worksheet (xlsx only, optional)"
              value={worksheet}
              onChange={(e) => setWorksheet(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <button
              type="submit"
              disabled={!file || busy}
              className="bg-emerald-600 text-white text-sm rounded px-3 py-1 disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload"}
            </button>
          </form>

          <form
            onSubmit={handleAddGoogle}
            className="bg-white border rounded p-4 space-y-3"
          >
            <h2 className="font-semibold">Add Google Sheet</h2>
            <input
              type="text"
              placeholder="Dataset name"
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Google Sheet URL"
              value={gUrl}
              onChange={(e) => setGUrl(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              placeholder="Worksheet name (optional)"
              value={gWs}
              onChange={(e) => setGWs(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-slate-500">
              The Sheet must be shared with the service-account email
              (configured server-side) as Viewer.
            </p>
            <button
              type="submit"
              disabled={!gName.trim() || !gUrl.trim() || busy}
              className="bg-emerald-600 text-white text-sm rounded px-3 py-1 disabled:opacity-50"
            >
              {busy ? "Loading…" : "Add Sheet"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Your datasets</h2>
          {datasets === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : datasets.length === 0 ? (
            <p className="text-sm text-slate-500">
              No datasets yet — upload a file or add a Google Sheet above.
            </p>
          ) : (
            <table className="w-full bg-white border rounded text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Rows</th>
                  <th className="p-2">Columns</th>
                  <th className="p-2">Created</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 font-mono">{d.name}</td>
                    <td className="p-2">{d.source}</td>
                    <td className="p-2">{d.row_count}</td>
                    <td className="p-2 text-xs text-slate-600">
                      {d.columns.slice(0, 5).join(", ")}
                      {d.columns.length > 5 ? `, +${d.columns.length - 5}` : ""}
                    </td>
                    <td className="p-2 text-xs text-slate-500">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 text-right space-x-2">
                      <Link
                        to={`/sheets/${d.id}/ask`}
                        className="text-emerald-700 hover:underline"
                      >
                        Ask
                      </Link>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
