"use client";
import { useRef, useState } from "react";
import { FileText, Loader2, Lock, Upload, X } from "lucide-react";
import { cn } from "@/components/ui";

export interface UploadedFile {
  id: string;
  filename: string;
  pageCount: number | null;
  width?: number;
  height?: number;
  previewUrl?: string;
  confidential?: boolean;
}

function readImageDims(file: File): Promise<{ width: number; height: number; url: string } | null> {
  if (!file.type.startsWith("image/") || /heic|tiff/i.test(file.type)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, url });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function FileUploader({
  store, productId, accept, multiple, files, onChange, confidential,
}: {
  store: string; productId: string; accept?: string; multiple?: boolean; confidential?: boolean;
  files: UploadedFile[]; onChange: (f: UploadedFile[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(list: FileList | File[]) {
    setError(null);
    const arr = Array.from(list).slice(0, multiple ? 50 : 1);
    setBusy((b) => b + arr.length);
    const done: UploadedFile[] = [];
    await Promise.all(arr.map(async (file) => {
      try {
        const dims = await readImageDims(file);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("productId", productId);
        if (dims) { fd.append("width", String(dims.width)); fd.append("height", String(dims.height)); }
        const res = await fetch(`/api/v1/store/${store}/uploads`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
        done.push({ id: data.id, filename: data.filename, pageCount: data.pageCount, confidential: data.confidential, width: dims?.width, height: dims?.height, previewUrl: dims?.url });
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setBusy((b) => b - 1);
      }
    }));
    if (done.length) onChange(multiple ? [...files, ...done] : done);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition", drag ? "border-store bg-store-soft" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50")}
      >
        {busy > 0 ? <Loader2 className="h-8 w-8 animate-spin text-slate-400" /> : <Upload className="h-8 w-8 text-slate-400" />}
        <p className="mt-2 font-medium">{busy > 0 ? `Uploading ${busy} file${busy > 1 ? "s" : ""}…` : `Drop ${multiple ? "files" : "a file"} here or click to browse`}</p>
        <p className="mt-1 text-xs text-slate-500">{accept?.split(",").join(" ").toUpperCase()} · max 50 MB</p>
        {confidential && <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Lock className="h-3.5 w-3.5" />Encrypted at rest · auto-deleted after collection</p>}
        <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} data-testid="file-input"
          onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm">
              {f.previewUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={f.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
                : <FileText className="h-10 w-10 p-2 text-slate-400" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.filename}</p>
                <p className="text-xs text-slate-500">
                  {f.pageCount ? `${f.pageCount} page${f.pageCount > 1 ? "s" : ""}` : "Page count will be checked by the shop"}
                  {f.width ? ` · ${f.width} × ${f.height} px` : ""}
                </p>
              </div>
              <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Remove file"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
