import z from './mascot.module.css'

/** How a still of Zarqa moves (mascot.module.css). Loops: breathe, sway, bob. One-shots that settle into breathing: wiggle, bounce. */
export type ZarqaMotion = 'breathe' | 'sway' | 'bob' | 'wiggle' | 'bounce' | 'none'

/** Classes that make a still of Zarqa pop in (`enter`) and then stay alive. Her pivot is the CSS variable --zo. */
export function zarqaMotion(motion: ZarqaMotion = 'breathe', enter = true) {
  return `${z.z} ${enter ? z.enter : ''} ${motion === 'none' ? '' : z[motion]}`
}
