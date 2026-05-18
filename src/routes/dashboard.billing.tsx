import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ArrowLeft, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/dashboard/billing")({
  head: () => ({ meta: [{ title: "Abonnement — ReviewDrop" }] }),
  component: () => (
    <RequireAuth>
      <DashboardLayout>
        <BillingPage />
      </DashboardLayout>
    </RequireAuth>
  ),
});

// TODO: re-enable post-beta — restore Stripe checkout, customer portal,
// plan selector and tiered pricing UI.

const INCLUDED = [
  "Projets illimités",
  "Feedbacks illimités",
  "Personnalisation du widget (couleur, logo)",
  "Export CSV des feedbacks",
  "Webhooks & intégrations",
  "Suppression du badge ReviewDrop",
  "Domaine personnalisé pour le widget",
  "Support prioritaire",
];

function BillingPage() {
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Accès beta
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-2">
          🎉 Vous êtes en accès beta gratuit
        </h1>
        <p className="text-muted-foreground mb-6">
          Toutes les fonctionnalités Pro sont incluses, sans limite et sans
          carte bancaire. Le pricing sera activé à la sortie officielle —
          vous serez prévenu·e à l'avance.
        </p>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Inclus pendant la beta</h2>
          <ul className="space-y-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
