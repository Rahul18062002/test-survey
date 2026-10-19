import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import NewQuestionnaire from './pages/NewQuestionnaire.jsx'
import Questionnaires from './pages/Questionnaires.jsx'
import Job from './pages/Job.jsx'
import Ask from './pages/Ask.jsx'
import Knowledge from './pages/Knowledge.jsx'
import Settings from './pages/Settings.jsx'
import { getName, setName } from './api.js'

export default function App() {
  const [name, setNameState] = useState(getName())
  const [editing, setEditing] = useState(false)
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">✓</span> QuestionnaireFlow
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/questionnaires">Questionnaires</NavLink>
          <NavLink to="/ask">Ask a question</NavLink>
          <NavLink to="/knowledge">Knowledge base</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="who">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setName(name.trim())
                setEditing(false)
              }}
            >
              <input className="input input-sm" autoFocus value={name} onChange={(e) => setNameState(e.target.value)} placeholder="Your name" aria-label="Your name" />
            </form>
          ) : (
            <button className="link" onClick={() => setEditing(true)} title="Shown on answers you review">
              {name ? `Reviewing as ${name}` : 'Add your name'}
            </button>
          )}
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewQuestionnaire />} />
          <Route path="/questionnaires" element={<Questionnaires />} />
          <Route path="/jobs/:id" element={<Job />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p>That page doesn't exist. <NavLink to="/">Go home</NavLink></p>} />
        </Routes>
      </main>
    </div>
  )
}
