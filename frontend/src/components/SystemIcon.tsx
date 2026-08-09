import type { SVGProps } from 'react';

export type SystemIconName =
  | 'today' | 'food' | 'training' | 'supplements' | 'profile'
  | 'settings' | 'spark' | 'sun' | 'moon' | 'shield' | 'target'
  | 'calendar' | 'clock' | 'edit' | 'history' | 'plan' | 'lifestyle'
  | 'sleep' | 'chevron' | 'check' | 'plus' | 'info' | 'store'
  | 'location' | 'budget' | 'assistant' | 'close' | 'search'
  | 'sync' | 'warning' | 'equipment' | 'leaf' | 'back' | 'external'
  | 'water' | 'camera' | 'delete' | 'share' | 'list' | 'flame';

export interface SystemIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: SystemIconName;
  title?: string;
}

function Glyph({ name }: { name: SystemIconName }) {
  switch (name) {
    case 'today': return <><path d="M4 5.5h16v14H4z"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/><path d="m8 14 2.2 2.2L16.5 12"/></>;
    case 'food': return <><path d="M4 11h16M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M8 8c0-2 1-3 1-4M12 8c0-2 1-3 1-4M16 8c0-2 1-3 1-4"/></>;
    case 'training': return <><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></>;
    case 'supplements': return <><path d="M8.3 4.3a5 5 0 0 1 7.1 7.1l-4 4a5 5 0 0 1-7.1-7.1z"/><path d="m8 12 4 4"/></>;
    case 'profile': return <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6"/><path d="m12 2 1.2 2.2L16 5l-2 1.8.4 2.7L12 8.2 9.6 9.5l.4-2.7L8 5l2.8-.8z" opacity=".55"/></>;
    case 'settings': return <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.8-1L14.2 3h-4.4L9.4 6a8 8 0 0 0-1.8 1L5.1 6l-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 1.8 1l.4 3h4.4l.4-3a8 8 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></>;
    case 'spark': return <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/></>;
    case 'sun': return <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>;
    case 'moon': return <path d="M20 15.4A8 8 0 0 1 8.6 4 8 8 0 1 0 20 15.4z"/>;
    case 'shield': return <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 10 4.2-2.2 7-5.4 7-10V6z"/>;
    case 'target': return <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>;
    case 'calendar': return <><rect x="4" y="5" width="16" height="15"/><path d="M8 3v4M16 3v4M4 9h16"/></>;
    case 'clock': return <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>;
    case 'edit': return <><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.7 7.5 3 3"/></>;
    case 'history': return <><path d="M4 5v5h5"/><path d="M5.5 16.5A8 8 0 1 0 5 8"/><path d="M12 7v5l3 2"/></>;
    case 'plan': return <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/><path d="m16 13 1 1 2-2"/></>;
    case 'lifestyle': return <><path d="M4 20h16M6 20v-6h5v6M13 20V9h5v11"/><path d="M5 10c2-4 5-6 9-6"/><path d="m12 3 2 1-1 2"/></>;
    case 'sleep': return <><path d="M19 15.5A7.5 7.5 0 0 1 8.5 5 7.5 7.5 0 1 0 19 15.5z"/><path d="M16.5 4h3l-3 3h3"/></>;
    case 'chevron': return <path d="m9 5 7 7-7 7"/>;
    case 'check': return <path d="m5 12 4 4L19 6"/>;
    case 'plus': return <path d="M12 5v14M5 12h14"/>;
    case 'info': return <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>;
    case 'store': return <><path d="M4 9h16l-2-5H6z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/><path d="M4 9c0 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 4 2 4 0"/></>;
    case 'location': return <><path d="M20 10c0 5.5-8 11-8 11S4 15.5 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>;
    case 'budget': return <><rect x="3" y="6" width="18" height="13"/><path d="M3 10h18M7 15h3"/><circle cx="17" cy="15" r="1.5"/></>;
    case 'assistant': return <><path d="M5 5h14v11H9l-4 4z"/><path d="m12 7 .8 2.2L15 10l-2.2.8L12 13l-.8-2.2L9 10l2.2-.8z"/></>;
    case 'close': return <path d="M5 5l14 14M19 5 5 19"/>;
    case 'search': return <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>;
    case 'sync': return <><path d="M20 7h-5V2"/><path d="M19 7a8 8 0 0 0-14 1M4 17h5v5"/><path d="M5 17a8 8 0 0 0 14-1"/></>;
    case 'warning': return <><path d="m12 3 9 17H3z"/><path d="M12 9v5M12 17h.01"/></>;
    case 'equipment': return <><path d="M7 7v10M17 7v10M3 10v4M21 10v4M7 12h10"/></>;
    case 'leaf': return <><path d="M20 4C12 4 5 7 5 14c0 3 2 5 5 5 7 0 9-7 10-15z"/><path d="M5 20c3-5 7-8 12-11"/></>;
    case 'back': return <><path d="m15 5-7 7 7 7"/><path d="M8 12h12"/></>;
    case 'external': return <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></>;
    case 'water': return <><path d="M12 3c3.2 4 6 7.1 6 11a6 6 0 0 1-12 0c0-3.9 2.8-7 6-11z"/><path d="M9 15.2c.4 1.1 1.4 1.8 2.7 1.8"/></>;
    case 'camera': return <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></>;
    case 'delete': return <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></>;
    case 'share': return <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></>;
    case 'list': return <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>;
    case 'flame': return <path d="M13 3c.2 3-1.7 4.4-3 6.2-1.2 1.7-.3 3.2 1.2 4.2-.1-2.4 1.5-3.2 2.8-4.8 2.7 2 4 4.4 4 6.7A6 6 0 0 1 6 15c0-2.1 1-4 2.8-5.8-.2 2 .8 3 1.7 3.5C9 8.2 11 5 13 3z"/>;
  }
}

export function SystemIcon({ name, title, width = 24, height = 24, ...props }: SystemIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      <Glyph name={name} />
    </svg>
  );
}
