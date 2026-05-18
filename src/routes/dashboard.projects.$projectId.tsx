import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Copy, Check, Trash2, Settings, ExternalLink, Download, Lock, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";
import { getLimits, normalizePlan, type PlanId, DEFAULT_BRAND_COLOR } from "@/lib/plans";

type Project = Tables<"projects">;
type Feedback = Tables<"feedbacks">;
type Reply = Tables<"feedback_replies">;

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  head: () => ({ meta: [{ title: "Projet — ReviewDrop" }] }),
  component: () => (
    <RequireAuth>
      <DashboardLayout>
        <ProjectPage />
      </DashboardLayout>
    </RequireAuth>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  closed: "Résolu",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ");
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportFeedbacksCsv(project: Project, feedbacks: Feedback[]) {
  const headers = [
    "id", "created_at", "status", "author_name", "author_email",
    "message", "page_url", "css_selector", "position_x", "position_y",
  ];
  const rows = feedbacks.map((f) => [
    f.id,
    f.created_at,
    f.status,
    f.author_name,
    (f as Feedback & { author_email?: string }).author_email ?? "",
    f.message,
    f.page_url,
    f.css_selector,
    f.position_x,
    f.position_y,
  ].map(csvEscape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "projet";
  a.download = `feedbacks-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success(`${feedbacks.length} feedback${feedbacks.length > 1 ? "s" : ""} exporté${feedbacks.length > 1 ? "s" : ""}`);
}

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [plan, setPlan] = useState<PlanId>("free");

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const [{ data: p }, { data: f }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase
          .from("feedbacks")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
      ]);
      if (mounted) {
        setProject(p);
        setFeedbacks(f || []);
        setPlan(normalizePlan(prof?.plan));
        setLoading(false);
      }
    })();

    // Realtime subscription
    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedbacks", filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const f = payload.new as Feedback;
            setFeedbacks((prev) => [f, ...prev]);
            toast.success(`💬 Nouveau feedback de ${f.author_name}`);
          } else if (payload.eventType === "UPDATE") {
            setFeedbacks((prev) => prev.map((x) => (x.id === (payload.new as Feedback).id ? (payload.new as Feedback) : x)));
          } else if (payload.eventType === "DELETE") {
            setFeedbacks((prev) => prev.filter((x) => x.id !== (payload.old as Feedback).id));
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [projectId, user]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? feedbacks : feedbacks.filter((f) => f.status === statusFilter)),
    [feedbacks, statusFilter]
  );

  const selected = feedbacks.find((f) => f.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, closed: 0 };
    feedbacks.forEach((f) => {
      c[f.status as keyof typeof c]++;
    });
    return c;
  }, [feedbacks]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("feedbacks").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm("Supprimer ce feedback ?")) return;
    const { error } = await supabase.from("feedbacks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setSelectedId(null);
  };

  const widgetUrl = typeof window !== "undefined" ? `${window.location.origin}/widget.js` : "/widget.js";
  const snippet = project ? `<script src="${widgetUrl}" data-project="${project.public_token}" defer></script>` : "";

  const copySnippet = (text?: string) => {
    navigator.clipboard.writeText(text ?? snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openFeedback = async (id: string) => {
    setSelectedId(id);
    const target = feedbacks.find((f) => f.id === id);
    if (target && !target.is_read) {
      setFeedbacks((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
      await supabase.from("feedbacks").update({ is_read: true }).eq("id", id);
    }
  };

  if (loading) return <ProjectPageSkeleton />;
  if (!project) return <div className="p-6">Projet introuvable.</div>;

  const mockupUrl = project.mockup_image_path
    ? supabase.storage.from("mockups").getPublicUrl(project.mockup_image_path).data.publicUrl
    : null;

  const reviewUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${project.public_token}` : "";

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Tous les projets
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {project.type === "live" ? "Site web" : "Maquette"} · {feedbacks.length} feedback{feedbacks.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {getLimits(plan).csvExport ? (
            <Button variant="outline" size="sm" onClick={() => exportFeedbacksCsv(project, feedbacks)} disabled={feedbacks.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          ) : (
            <Link to="/dashboard/billing">
              <Button variant="outline" size="sm" title="Disponible sur Pro et Max">
                <Lock className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)}>
            <Settings className="h-4 w-4 mr-2" /> Paramètres
          </Button>
        </div>
      </div>

      {showSettings && <ProjectSettings project={project} onUpdate={setProject} plan={plan} />}

      {/* Integration card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        {project.type === "live" ? (
          <>
            <h2 className="font-semibold mb-1">Intégration</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Collez ce snippet dans le <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;head&gt;</code> de votre site.
            </p>
            <div className="flex gap-2 items-stretch">
              <code className="flex-1 text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-nowrap">{snippet}</code>
              <Button variant="outline" onClick={() => copySnippet()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold mb-1">Lien à partager</h2>
            <p className="text-sm text-muted-foreground mb-3">Envoyez ce lien à votre client pour qu'il commente la maquette.</p>
            <div className="flex gap-2 items-stretch">
              <code className="flex-1 text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-nowrap">{reviewUrl}</code>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(reviewUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <a href={reviewUrl} target="_blank" rel="noreferrer">
                <Button variant="outline"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "all", label: `Tous (${feedbacks.length})` },
          { key: "open", label: `Ouverts (${counts.open})` },
          { key: "in_progress", label: `En cours (${counts.in_progress})` },
          { key: "closed", label: `Résolus (${counts.closed})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {feedbacks.length === 0 ? (
        <EmptyFeedbacks
          isLive={project.type === "live"}
          snippet={snippet}
          reviewUrl={reviewUrl}
          copied={copied}
          onCopy={() => copySnippet(project.type === "live" ? snippet : reviewUrl)}
        />
      ) : (
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Mockup preview with pins */}
        {project.type === "mockup" && mockupUrl && (
          <div className="relative rounded-lg border border-border bg-card overflow-hidden">
            <div className="relative">
              <img src={mockupUrl} alt={project.name} className="w-full block" />
              {filtered.map((f) => (
                <button
                  key={f.id}
                  onClick={() => openFeedback(f.id)}
                  className={`absolute -translate-x-1/2 -translate-y-full flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg ring-2 ring-white transition-transform hover:scale-110 ${
                    selectedId === f.id ? "scale-125 z-10" : ""
                  }`}
                  style={{
                    left: `${f.position_x}%`,
                    top: `${f.position_y}%`,
                    backgroundColor: f.status === "closed" ? "#10b981" : f.status === "in_progress" ? "#f59e0b" : project.brand_color,
                  }}
                >
                  {feedbacks.length - feedbacks.indexOf(f)}
                </button>
              ))}
            </div>
          </div>
        )}

        {project.type === "live" && (
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold mb-2">Aperçu des feedbacks</h3>
            <p className="text-sm text-muted-foreground">
              Les feedbacks apparaissent ci-contre dès qu'un visiteur en laisse un. La capture d'écran de la page est disponible en cliquant sur un feedback.
            </p>
          </div>
        )}

        {/* Feedback list / detail */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border bg-card p-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Aucun feedback avec ce filtre</p>
            </div>
          ) : selected ? (
            <FeedbackDetail
              feedback={selected}
              onBack={() => setSelectedId(null)}
              onStatusChange={(s) => updateStatus(selected.id, s)}
              onDelete={() => deleteFeedback(selected.id)}
            />
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => openFeedback(f.id)}
                className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-primary transition-colors relative"
              >
                {!f.is_read && (
                  <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-red-500" title="Non lu" />
                )}
                <div className="flex items-start justify-between gap-2 mb-1 pr-4">
                  <span className={`text-xs ${!f.is_read ? "font-bold" : "font-medium"}`}>{f.author_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    f.status === "open" ? "bg-blue-100 text-blue-700" :
                    f.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {STATUS_LABEL[f.status]}
                  </span>
                </div>
                <p className="text-sm text-foreground line-clamp-2">{f.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(f.created_at).toLocaleString("fr-FR")}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function FeedbackDetail({
  feedback,
  onBack,
  onStatusChange,
  onDelete,
}: {
  feedback: Feedback;
  onBack: () => void;
  onStatusChange: (s: string) => void;
  onDelete: () => void;
}) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [newReply, setNewReply] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("feedback_replies")
        .select("*")
        .eq("feedback_id", feedback.id)
        .order("created_at", { ascending: true });
      setReplies(data || []);
    })();
  }, [feedback.id]);

  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!feedback.screenshot_path) {
      setScreenshotUrl(null);
      return;
    }
    supabase.storage
      .from("screenshots")
      .createSignedUrl(feedback.screenshot_path, 300)
      .then(({ data }) => {
        if (mounted) setScreenshotUrl(data?.signedUrl ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [feedback.screenshot_path]);

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReply.trim() || !user) return;
    const { data, error } = await supabase
      .from("feedback_replies")
      .insert({
        feedback_id: feedback.id,
        author_id: user.id,
        author_name: user.email,
        message: newReply.trim(),
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
    } else if (data) {
      setReplies((r) => [...r, data]);
      setNewReply("");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
        ← Retour à la liste
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm">{feedback.author_name}</span>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm whitespace-pre-wrap">{feedback.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">{new Date(feedback.created_at).toLocaleString("fr-FR")}</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {(["open", "in_progress", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              feedback.status === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {feedback.page_url && (
        <div className="text-xs">
          <span className="text-muted-foreground">Page : </span>
          <a href={feedback.page_url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
            {feedback.page_url}
          </a>
        </div>
      )}

      {feedback.css_selector && (
        <div className="text-xs">
          <span className="text-muted-foreground">Élément : </span>
          <code className="bg-muted px-1 py-0.5 rounded">{feedback.css_selector}</code>
        </div>
      )}

      {screenshotUrl && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Capture</p>
          <a href={screenshotUrl} target="_blank" rel="noreferrer">
            <img src={screenshotUrl} alt="capture" className="rounded border border-border w-full" />
          </a>
        </div>
      )}

      {/* Internal notes */}
      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium mb-2">Notes internes</p>
        {replies.length > 0 && (
          <div className="space-y-2 mb-3">
            {replies.map((r) => (
              <div key={r.id} className="text-sm bg-muted/50 rounded p-2">
                <p className="whitespace-pre-wrap">{r.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString("fr-FR")}</p>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={submitReply} className="space-y-2">
          <Textarea
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="Ajouter une note..."
            rows={2}
            className="text-sm"
          />
          <Button type="submit" size="sm" disabled={!newReply.trim()}>Ajouter</Button>
        </form>
      </div>
    </div>
  );
}

function ProjectSettings({ project, onUpdate, plan }: { project: Project; onUpdate: (p: Project) => void; plan: PlanId }) {
  const limits = getLimits(plan);
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.brand_color);
  const [active, setActive] = useState(project.is_active);
  const [notify, setNotify] = useState(project.notify_email);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("projects")
      .update({
        name,
        brand_color: limits.customBrandColor ? color : DEFAULT_BRAND_COLOR,
        is_active: active,
        notify_email: notify,
      })
      .eq("id", project.id)
      .select()
      .single();
    setSaving(false);
    if (error) toast.error(error.message);
    else if (data) {
      onUpdate(data);
      toast.success("Enregistré");
    }
  };

  const regenerateToken = async () => {
    if (!confirm("Régénérer le jeton invalidera l'ancien snippet/lien. Continuer ?")) return;
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data, error } = await supabase
      .from("projects")
      .update({ public_token: newToken })
      .eq("id", project.id)
      .select()
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      onUpdate(data);
      toast.success("Jeton régénéré");
    }
  };

  const deleteProject = async () => {
    if (!confirm("Supprimer définitivement ce projet et tous ses feedbacks ?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) toast.error(error.message);
    else window.location.href = "/dashboard";
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 mb-6 space-y-4">
      <h2 className="font-semibold">Paramètres</h2>
      <div>
        <Label htmlFor="pname">Nom</Label>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pcolor">Couleur du widget</Label>
          {!limits.customBrandColor && (
            <Link to="/dashboard/billing" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Réservé aux plans Pro et Max
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Input
            id="pcolor"
            type="color"
            value={limits.customBrandColor ? color : DEFAULT_BRAND_COLOR}
            onChange={(e) => setColor(e.target.value)}
            disabled={!limits.customBrandColor}
            className="w-16 h-10 p-1 disabled:opacity-50"
          />
          <Input
            value={limits.customBrandColor ? color : DEFAULT_BRAND_COLOR}
            onChange={(e) => setColor(e.target.value)}
            disabled={!limits.customBrandColor}
            className="flex-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <Label htmlFor="active" className="cursor-pointer">Widget actif</Label>
      </div>
      <div className="flex items-center gap-2">
        <input id="notify" type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <Label htmlFor="notify" className="cursor-pointer">Notifications email à chaque nouveau feedback</Label>
      </div>
      <div className="flex gap-2 flex-wrap pt-2">
        <Button onClick={save} disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
        <Button variant="outline" onClick={regenerateToken}>Régénérer le jeton</Button>
        <Button variant="destructive" onClick={deleteProject}>Supprimer le projet</Button>
      </div>
    </div>
  );
}

function ProjectPageSkeleton() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-40 mb-6" />
      <Skeleton className="h-24 w-full mb-6 rounded-lg" />
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Skeleton className="h-80 w-full rounded-lg" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyFeedbacks({
  isLive,
  snippet,
  reviewUrl,
  copied,
  onCopy,
}: {
  isLive: boolean;
  snippet: string;
  reviewUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const valueToCopy = isLive ? snippet : reviewUrl;
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-8">
      <div className="text-center mb-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Inbox className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-4 text-xl font-bold">En attente de feedbacks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLive
            ? "Installez le snippet sur votre site pour commencer à recevoir des retours."
            : "Partagez le lien à votre client pour qu'il puisse commenter la maquette."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {isLive ? "Votre snippet" : "Votre lien"}
        </p>
        <code className="block text-sm bg-muted p-3 rounded-md overflow-x-auto whitespace-nowrap font-mono">
          {valueToCopy}
        </code>
        <Button onClick={onCopy} className="w-full mt-3" size="lg">
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" /> Copié !
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" /> Copier le {isLive ? "snippet" : "lien"}
            </>
          )}
        </Button>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 text-sm">
        {[
          isLive ? "Copiez le snippet" : "Copiez le lien",
          isLive ? "Collez-le dans votre site" : "Envoyez-le à votre client",
          "Partagez le lien à votre client",
        ].slice(0, isLive ? 3 : 2).concat(isLive ? [] : ["Recevez ses feedbacks ici"]).map((label, i) => (
          <li key={i} className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </span>
            <span className="text-foreground">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
