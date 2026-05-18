import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, MessageSquare, Globe, Image as ImageIcon, Sparkles, Code2, Bell, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects"> & { open_count: number; unread_count: number };
type Feedback = Tables<"feedbacks">;

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — ReviewDrop" }] }),
  component: () => (
    <RequireAuth>
      <DashboardLayout>
        <DashboardPage />
      </DashboardLayout>
    </RequireAuth>
  ),
});

const ONBOARDING_DISMISSED_KEY = "reviewdrop_onboarding_dismissed";

function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOnboardingDismissed(localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (!projectsData) {
        if (mounted) {
          setProjects([]);
          setLoading(false);
        }
        return;
      }

      const counts = await Promise.all(
        projectsData.map(async (p) => {
          const [{ count: open }, { count: unread }] = await Promise.all([
            supabase
              .from("feedbacks")
              .select("*", { count: "exact", head: true })
              .eq("project_id", p.id)
              .eq("status", "open"),
            supabase
              .from("feedbacks")
              .select("*", { count: "exact", head: true })
              .eq("project_id", p.id)
              .eq("is_read", false),
          ]);
          return { ...p, open_count: open ?? 0, unread_count: unread ?? 0 };
        }),
      );
      if (mounted) {
        setProjects(counts);
        setLoading(false);
      }
    };

    load();

    // Realtime: update counters live when feedbacks change on owned projects.
    const channel = supabase
      .channel(`dashboard-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedbacks" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Feedback | undefined;
          if (!row) return;
          setProjects((prev) => {
            if (!prev.some((p) => p.id === row.project_id)) return prev;
            return prev.map((p) => {
              if (p.id !== row.project_id) return p;
              if (payload.eventType === "INSERT") {
                const f = payload.new as Feedback;
                if (mounted && !document.hidden) {
                  toast.success(`💬 Nouveau feedback de ${f.author_name}`);
                }
                return {
                  ...p,
                  open_count: p.open_count + (f.status === "open" ? 1 : 0),
                  unread_count: p.unread_count + (f.is_read ? 0 : 1),
                };
              }
              if (payload.eventType === "DELETE") {
                const f = payload.old as Feedback;
                return {
                  ...p,
                  open_count: Math.max(0, p.open_count - (f.status === "open" ? 1 : 0)),
                  unread_count: Math.max(0, p.unread_count - (f.is_read ? 0 : 1)),
                };
              }
              if (payload.eventType === "UPDATE") {
                const oldF = payload.old as Feedback;
                const newF = payload.new as Feedback;
                const openDelta =
                  (newF.status === "open" ? 1 : 0) - (oldF.status === "open" ? 1 : 0);
                const unreadDelta =
                  (newF.is_read ? 0 : 1) - (oldF.is_read ? 0 : 1);
                return {
                  ...p,
                  open_count: Math.max(0, p.open_count + openDelta),
                  unread_count: Math.max(0, p.unread_count + unreadDelta),
                };
              }
              return p;
            });
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    setOnboardingDismissed(true);
  };

  const hasProject = projects.length > 0;
  const hasFeedback = projects.some((p) => p.open_count > 0);
  const showOnboarding = !loading && hasProject && !onboardingDismissed && !hasFeedback;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {showOnboarding && (
        <OnboardingCard
          hasProject={hasProject}
          hasFeedback={hasFeedback}
          firstName={user?.user_metadata?.full_name?.split(" ")[0]}
          onDismiss={dismissOnboarding}
        />
      )}

      {!loading && hasProject && (
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Mes projets</h1>
              <Link
                to="/dashboard/billing"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Beta
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {projects.length} projet{projects.length > 1 ? "s" : ""}
            </p>
          </div>
          <Link to="/dashboard/projects/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau projet
            </Button>
          </Link>
        </div>
      )}

      {loading ? (
        <ProjectsSkeleton />
      ) : projects.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/dashboard/projects/$projectId"
              params={{ projectId: p.id }}
              className="rounded-lg border border-border bg-card p-5 hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                    {p.type === "live" ? <Globe className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  </span>
                  <h3 className="font-semibold truncate">{p.name}</h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.unread_count > 0 && (
                    <span
                      title={`${p.unread_count} non lu${p.unread_count > 1 ? "s" : ""}`}
                      className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white"
                    >
                      {p.unread_count}
                    </span>
                  )}
                  {p.open_count > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {p.open_count}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {p.type === "live" ? "Site web" : "Maquette"} · Créé le{" "}
                {new Date(p.created_at).toLocaleDateString("fr-FR")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-4 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-12 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <MessageSquare className="h-10 w-10 text-primary" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Créez votre premier projet</h2>
      <p className="mt-2 text-muted-foreground max-w-md mx-auto">
        Recueillez vos premiers feedbacks visuels en 2 minutes.
      </p>
      <Link to="/dashboard/projects/new" className="mt-6 inline-block">
        <Button size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Créer un projet
        </Button>
      </Link>
    </div>
  );
}

function OnboardingCard({
  hasProject,
  hasFeedback,
  firstName,
  onDismiss,
}: {
  hasProject: boolean;
  hasFeedback: boolean;
  firstName?: string;
  onDismiss: () => void;
}) {
  const steps = [
    {
      done: hasProject,
      icon: Plus,
      title: "Créez votre premier projet",
      desc: "Site live ou maquette image — choisissez le type adapté à votre client.",
      cta: !hasProject ? { to: "/dashboard/projects/new" as const, label: "Créer un projet" } : null,
    },
    {
      done: hasProject,
      icon: Code2,
      title: "Installez le widget ou partagez le lien",
      desc: "Collez le snippet dans le <head> du site, ou envoyez le lien de la maquette.",
    },
    {
      done: hasFeedback,
      icon: Bell,
      title: "Recevez les feedbacks en temps réel",
      desc: "Les retours apparaissent ici instantanément, ancrés au pixel près.",
    },
  ];

  return (
    <div className="mb-8 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">
              Bienvenue{firstName ? ` ${firstName}` : ""} sur ReviewDrop
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            3 étapes pour collecter votre premier feedback.
          </p>
        </div>
        <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">
          Masquer
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className={`relative rounded-lg border p-4 transition-colors ${
                s.done ? "border-primary/30 bg-card" : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold ${
                    s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm">{s.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              {s.cta && (
                <Link to={s.cta.to} className="mt-3 inline-block">
                  <Button size="sm">{s.cta.label}</Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
