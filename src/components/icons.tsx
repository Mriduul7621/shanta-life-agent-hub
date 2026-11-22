/** Minimal inline stroke icons (no emoji, no external assets). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function base(props: P) {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export const IconHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

export const IconLeads = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M17.5 15.2c2 .6 3.4 2.2 4 4.8" />
  </svg>
);

export const IconLearning = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
    <path d="M4 20.5V5.5" />
    <path d="M9 7.5h7M9 11h7" />
  </svg>
);

export const IconCalculator = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8.5 7.5h7" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 19h.01M12 19h.01M15.5 19h.01" />
  </svg>
);

export const IconDashboard = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-8" />
    <path d="M22 20H2" />
  </svg>
);

export const IconProposals = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3h9l4 4v14H6Z" />
    <path d="M15 3v4h4" />
    <path d="M9.5 12h6M9.5 16h6" />
  </svg>
);

export const IconProfile = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1-3.8 3.9-6 7.5-6s6.5 2.2 7.5 6" />
  </svg>
);

export const IconPhone = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const IconCoin = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v9M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3.1 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.6-3.1-1.6" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </svg>
);

/**
 * Board-legend parity (hb11, STRICT_AUDIT §2/S12): the board's
 * 14-icon "Icons & UI Elements" legend shows Certificate, Time,
 * Download and Sign out, which did not exist in the app. The paths
 * below are the board's own glyphs (board.html #i-award, #i-clock,
 * #i-down, #i-out) drawn in this file's 22px stroke style. Only
 * IconDownload is rendered today (the Android promo button); the
 * others complete the set for future use.
 */
export const IconCertificate = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="9" r="5.5" />
    <path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5" />
  </svg>
);

export const IconTime = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
);

export const IconSignOut = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
