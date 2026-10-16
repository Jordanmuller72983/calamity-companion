import type { Topic } from '../rules/types'

// antd-mobile-icons has no school / bus / briefcase icons, so these are drawn here.
const PATHS: Record<Topic, string> = {
  school: 'M3 10 12 5l9 5-9 5-9-5Zm3 2v4.5c1.8 1.6 3.8 2.5 6 2.5s4.2-.9 6-2.5V12M21 10v5',
  work: 'M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16',
  transport: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2Zm-2 8h16M7 16v3m10-3v3M7.5 14h.01m9 0h.01',
  outside: 'M12 3a5 5 0 0 0-5 5c0 4 5 9 5 9s5-5 5-9a5 5 0 0 0-5-5Zm0 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM5 21h14',
}

export function TopicIcon({ topic, size = 28 }: { topic: Topic; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[topic]} />
    </svg>
  )
}
