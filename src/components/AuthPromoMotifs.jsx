import React from "react";
import {
  BookMarked,
  BookOpen,
  GraduationCap,
  Library,
  Lightbulb,
  Notebook,
} from "lucide-react";

// Educational motifs that drift sideways across the blue auth promo
// panel (the left half of /login and /signup), mirroring the same
// effect on the marketing hero. Six icons on independent rails with
// mixed directions / durations so the cluster reads as ambient
// motion rather than a parade. Sparse on purpose -- the panel is
// narrower than the hero, six icons fill it without crowding the
// "Smarter answers. Cited sources." headline.
//
// Icon alpha and animation are entirely CSS-driven (Auth.css), so
// `<AuthPromoMotifs />` is just a markup helper that emits the same
// structure for both Login and Signup without duplication.
const PROMO_ICONS = [
  { Icon: BookOpen,      top: "12%", size: 38, dur: "30s", delay: "0s",  direction: "ltr" },
  { Icon: Library,       top: "42%", size: 46, dur: "34s", delay: "8s",  direction: "rtl" },
  { Icon: GraduationCap, top: "70%", size: 40, dur: "32s", delay: "4s",  direction: "ltr" },
  { Icon: BookMarked,    top: "88%", size: 30, dur: "28s", delay: "12s", direction: "rtl" },
  { Icon: Lightbulb,     top: "26%", size: 32, dur: "30s", delay: "16s", direction: "rtl" },
  { Icon: Notebook,      top: "56%", size: 34, dur: "34s", delay: "20s", direction: "ltr" },
];

const AuthPromoMotifs = () => (
  <div className="auth-promo__icons" aria-hidden="true">
    {PROMO_ICONS.map(({ Icon, top, size, dur, delay, direction }, i) => (
      <span
        key={i}
        className={`auth-promo__icon auth-promo__icon--${direction}`}
        style={{
          top,
          "--promo-icon-dur": dur,
          "--promo-icon-delay": delay,
        }}
      >
        <Icon size={size} strokeWidth={1.4} />
      </span>
    ))}
  </div>
);

export default AuthPromoMotifs;
