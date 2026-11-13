import { useLayoutEffect } from 'react'
import { Link as RouterLink, useLocation, useNavigationType, type LinkProps } from 'react-router'
import { settleRoute, useNavigate, type Dir } from './transition'

/** react-router's Link, with the page slide (lib/transition.ts). Modified clicks (new tab and so on) are left to the browser. */
export function Link({ dir, onClick, to, replace, state, ...rest }: LinkProps & { dir?: Dir }) {
  const navigate = useNavigate()
  return (
    <RouterLink
      to={to}
      replace={replace}
      state={state}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return
        e.preventDefault()
        navigate(to, { replace, state, dir })
      }}
    />
  )
}

/** Mounted once inside the router: tells the transition the new page is in, and starts new pages at the top. */
export function RouteSettled() {
  const { key } = useLocation()
  const type = useNavigationType()
  useLayoutEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0)
    settleRoute()
  }, [key, type])
  return null
}
