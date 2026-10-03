"use client";

import { Button } from "@/shared/ui/button";

/**
 * Forces a full document reload after the user has joined the Discord server.
 *
 * Deliberately not a `<Link>`: client-side navigation to the same route serves the
 * cached server payload, so the membership check would keep showing the state from
 * before the user joined. That is the same staleness that broke the `?tab=` links
 * (ATW-34), and here it would leave the applicant blocked on a page that looks
 * unchanged.
 */
export function RecheckMembershipButton() {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={() => window.location.reload()}
      className="rounded-full font-bold px-10 h-14 border-white/10 hover:bg-white/5 active:scale-95 "
    >
      Ya me he unido
    </Button>
  );
}
