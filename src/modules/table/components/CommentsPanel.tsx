// Define TaskComment interface locally since it's not exported from types
interface TaskComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_label?: string;
  author_avatar_url?: string;
}

interface CommentsPanelProps {
  commentsOpen: boolean;
  setCommentsOpen: (open: boolean) => void;
  comments: TaskComment[];
  setComments: (comments: TaskComment[]) => void;
  commentsTaskId: string | null;
  setCommentsTaskId: (id: string | null) => void;
  commentDraft: string;
  setCommentDraft: (draft: string) => void;
  linkUrlDraft: string;
  setLinkUrlDraft: (url: string) => void;
  linkTitleDraft: string;
  setLinkTitleDraft: (title: string) => void;
  onAddComment: () => void;
  onAddLinkComment: () => void;
  onDeleteComment: (commentId: string) => void;
  user?: { id: string };
}

function parseLinkComment(body: string): { url: string; title: string } | null {
  const match = body.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) {
    return { title: match[1], url: match[2] };
  }
  return null;
}

export function CommentsPanel({
  commentsOpen,
  setCommentsOpen,
  comments,
  setComments,
  commentsTaskId,
  setCommentsTaskId,
  commentDraft,
  setCommentDraft,
  linkUrlDraft,
  setLinkUrlDraft,
  linkTitleDraft,
  setLinkTitleDraft,
  onAddComment,
  onAddLinkComment,
  onDeleteComment,
  user,
}: CommentsPanelProps) {
  if (!commentsOpen) return null;
  const safeCommentDraft = typeof commentDraft === 'string' ? commentDraft : '';
  const safeLinkUrlDraft = typeof linkUrlDraft === 'string' ? linkUrlDraft : '';
  const safeLinkTitleDraft = typeof linkTitleDraft === 'string' ? linkTitleDraft : '';

  const submitComment = () => {
    onAddComment();
  };

  const submitLinkComment = () => {
    onAddLinkComment();
  };

  return (
    <div className="fixed inset-0 z-[210] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/15 pointer-events-auto"
        onClick={() => setCommentsOpen(false)}
      />
      <aside role="dialog" aria-label="Panel de comentarios" className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-border shadow-[0_14px_30px_rgba(15,23,42,0.10)] pointer-events-auto flex flex-col">
        <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-text-secondary">Comentarios</p>
            <p className="text-sm font-medium truncate">Elemento</p>
          </div>
          <button
            onClick={() => setCommentsOpen(false)}
            className="h-7 w-7 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
            aria-label="Cerrar panel de comentarios"
            title="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
          {comments.length === 0 ? (
            <p className="text-xs text-text-secondary">Aun no hay comentarios.</p>
          ) : (
            comments.map((comment) => {
              const isMine = user?.id && comment.user_id === user.id;
              const link = parseLinkComment(comment.body);
              return (
                <div key={comment.id} className="group rounded-xl border border-border bg-bg-secondary px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="min-w-0 flex items-center gap-2">
                      {comment.author_avatar_url ? (
                        <img
                          src={comment.author_avatar_url}
                          alt={comment.author_label || 'Avatar'}
                          className="h-5 w-5 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-[10px] text-text-secondary">
                          {(comment.author_label || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary truncate">
                          {comment.author_label || 'Anonimo'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {new Date(comment.created_at).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    {isMine && (
                      <button
                        onClick={() => onDeleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-md border border-border text-text-secondary hover:text-[#B71C1C] hover:border-[#B71C1C] transition-all"
                        title="Eliminar comentario"
                      >
                        <span className="text-[10px]">×</span>
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-text-primary">
                    {link ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-700 underline break-all"
                      >
                        {link.title || link.url}
                      </a>
                    ) : (
                      <p className="text-xs text-text-primary whitespace-pre-wrap break-words">{comment.body}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <textarea
            value={safeCommentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Escribe un comentario..."
            className="w-full h-24 resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-2 grid grid-cols-1 gap-2">
            <input
              value={safeLinkUrlDraft}
              onChange={(e) => setLinkUrlDraft(e.target.value)}
              placeholder="https://enlace-importante.com"
              className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
            <input
              value={safeLinkTitleDraft}
              onChange={(e) => setLinkTitleDraft(e.target.value)}
              placeholder="Titulo opcional del enlace"
              className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setCommentsOpen(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
            >
              Cerrar
            </button>
            <button
              onClick={submitComment}
              disabled={!safeCommentDraft.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Comentar
            </button>
            <button
              onClick={submitLinkComment}
              disabled={!safeLinkUrlDraft.trim()}
              className="px-3 py-1.5 text-xs rounded-lg border border-border bg-white text-text-primary hover:bg-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar enlace
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

