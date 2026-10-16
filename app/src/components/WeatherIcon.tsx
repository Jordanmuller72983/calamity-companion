// Small animated weather icons for the town cards. Pure SVG + CSS (see WeatherIcon.css); the motion stops
// for people who ask for reduced motion (theme.css), leaving a still icon.
import type { Sky } from '../data/sky'
import './WeatherIcon.css'

const CLOUD = 'M11 31h18a6 6 0 0 0 .8-11.95A8.5 8.5 0 0 0 13.4 17.6 6.7 6.7 0 0 0 11 31Z'
const SMALL_CLOUD = 'M8 20h11a4 4 0 0 0 .5-7.97A5.6 5.6 0 0 0 8.7 11.1 4.5 4.5 0 0 0 8 20Z'

function Sun({ cx = 20, cy = 20, r = 6.5, rays = 11 }: { cx?: number; cy?: number; r?: number; rays?: number }) {
  return (
    <g className="wx-sun">
      <g className="wx-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r + 2.5)}
              y1={cy + Math.sin(a) * (r + 2.5)}
              x2={cx + Math.cos(a) * rays}
              y2={cy + Math.sin(a) * rays}
            />
          )
        })}
      </g>
      <circle className="wx-sun-core" cx={cx} cy={cy} r={r} />
    </g>
  )
}

function Moon({ dx = 0, dy = 0, scale = 1, stars = true }: { dx?: number; dy?: number; scale?: number; stars?: boolean }) {
  return (
    <g transform={`translate(${dx} ${dy}) scale(${scale})`}>
      <path className="wx-moon" d="M24 8.5a11 11 0 1 0 7.5 18.9A9 9 0 0 1 24 8.5Z" />
      {stars && (
        <>
          <path className="wx-star" d="M31 7l.8 1.7 1.7.8-1.7.8L31 12l-.8-1.7-1.7-.8 1.7-.8Z" />
          <path className="wx-star wx-star-2" d="M34.5 17l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5Z" />
        </>
      )}
    </g>
  )
}

function Drops({ n, long }: { n: number; long?: boolean }) {
  const xs = n === 3 ? [14, 20, 26] : n === 4 ? [12.5, 17.5, 22.5, 27.5] : [11, 15, 19, 23, 27, 31]
  return (
    <g className={`wx-drops ${long ? 'wx-drops-long' : ''}`}>
      {xs.map((x, i) => (
        <line key={x} x1={x} y1={28} x2={x - (long ? 1.6 : 0.8)} y2={long ? 33 : 31} style={{ animationDelay: `${(i * 0.37) % 1}s` }} />
      ))}
    </g>
  )
}

export function WeatherIcon({ sky, night, size = 34 }: { sky: Sky; night: boolean; size?: number }) {
  return (
    <svg className={`wx wx-${sky}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {sky === 'clear' && (night ? <Moon /> : <Sun />)}

      {sky === 'partly' && (
        <>
          {night ? <Moon dx={8} dy={-3} scale={0.75} stars={false} /> : <Sun cx={27} cy={13} r={5} rays={8.5} />}
          <path className="wx-cloud wx-drift" d={CLOUD} />
        </>
      )}

      {sky === 'cloudy' && (
        <>
          <path className="wx-cloud wx-cloud-back wx-drift-back" d={SMALL_CLOUD} transform="translate(13 1)" />
          <path className="wx-cloud wx-drift" d={CLOUD} />
        </>
      )}

      {sky === 'fog' && (
        <g className="wx-fog">
          <line x1="8" y1="15" x2="30" y2="15" />
          <line x1="11" y1="21" x2="33" y2="21" />
          <line x1="7" y1="27" x2="27" y2="27" />
        </g>
      )}

      {(sky === 'drizzle' || sky === 'rain' || sky === 'showers' || sky === 'heavyRain' || sky === 'thunder') && (
        <>
          {sky === 'showers' && (night ? <Moon dx={8} dy={-5} scale={0.7} stars={false} /> : <Sun cx={28} cy={11} r={4.5} rays={7.5} />)}
          <path className="wx-cloud wx-cloud-wet" d={CLOUD} transform="translate(0 -5)" />
          {sky === 'thunder' && <path className="wx-bolt" d="M21 25l-4 6.5h3.4L18.5 38l6-8h-3.6l2.3-5Z" />}
          <Drops n={sky === 'drizzle' ? 3 : sky === 'heavyRain' ? 6 : 4} long={sky !== 'drizzle'} />
        </>
      )}
    </svg>
  )
}

export function Moonlit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  )
}
