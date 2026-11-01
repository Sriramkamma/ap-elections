import { useState } from 'react'
import Command from './pages/Command'

export default function App() {
  const [ok, setOk] = useState(!!sessionStorage.getItem('key') || !import.meta.env.VITE_REQUIRE_KEY)
  if (!ok) return (
    <form className="m-20 max-w-sm space-y-3" onSubmit={e => { e.preventDefault(); sessionStorage.setItem('key', (e.currentTarget.elements.namedItem('k') as HTMLInputElement).value); setOk(true) }}>
      <input name="k" type="password" placeholder="Access key" className="w-full rounded border p-2" />
      <button className="rounded bg-navy px-4 py-2 text-white">Enter</button>
    </form>
  )
  return <Command />
}
