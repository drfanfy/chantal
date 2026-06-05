import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { ImageIcon, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  content: string;
  onChange: (html: string) => void;
}

function toHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text; // déjà du HTML
  return text.split("\n").map(line => `<p>${line}</p>`).join("");
}

function ToolbarBtn({
  active, onClick, children, title,
}: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors select-none ${
        active
          ? "bg-brand/15 text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ content, onChange }: Props) {
  const [imgOpen,   setImgOpen]   = useState(false);
  const [imgUrl,    setImgUrl]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: toHtml(content),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync si le contenu change de l'extérieur (changement de chapitre)
  useEffect(() => {
    if (!editor) return;
    const html = toHtml(content);
    if (editor.getHTML() !== html) {
      editor.commands.setContent(html);
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  const insertUrl = () => {
    const url = imgUrl.trim();
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
    setImgUrl("");
    setImgOpen(false);
  };

  const handleFile = (file: File) => {
    setUploading(true);
    setUploadErr(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
      setImgOpen(false);
      setUploading(false);
    };
    reader.onerror = () => {
      setUploadErr("Impossible de lire le fichier.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted/20">
        <ToolbarBtn active={editor.isActive("bold")}   onClick={() => editor.chain().focus().toggleBold().run()}   title="Gras (Ctrl+B)">
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)">
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Barré">
          <s>S</s>
        </ToolbarBtn>
        <div className="w-px h-3.5 bg-border mx-0.5" />
        <ToolbarBtn active={imgOpen} onClick={() => setImgOpen(o => !o)} title="Insérer une image">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
      </div>

      {/* ── Zone image ── */}
      {imgOpen && (
        <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={imgUrl}
              onChange={e => setImgUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); insertUrl(); } }}
              placeholder="https://… (URL de l'image)"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-brand/40"
            />
            <button type="button" onClick={insertUrl}
              className="px-2.5 py-1.5 rounded-md bg-brand text-white text-xs hover:bg-brand/90 shrink-0">
              Insérer
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
              <Upload className="w-3 h-3" />
              {uploading ? "Upload…" : "Depuis le disque"}
            </button>
            <button type="button" onClick={() => { setImgOpen(false); setUploadErr(null); }}
              className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {uploadErr && (
            <p className="text-[0.7rem] text-destructive">{uploadErr}</p>
          )}
        </div>
      )}

      {/* ── Contenu ── */}
      <EditorContent editor={editor} className="formation-editor px-3 py-2" />
    </div>
  );
}
