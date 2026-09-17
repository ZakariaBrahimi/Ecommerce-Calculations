import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The browser tab icon - the same teal-to-navy mark used in TopBar.tsx and the login page. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F766E 0%, #102A43 100%)',
          borderRadius: 7,
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 7-8" />
          <path d="M15 6h5v5" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
