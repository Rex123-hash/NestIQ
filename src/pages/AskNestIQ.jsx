import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Send, ShieldCheck, Home, Train, TreePine, ShoppingCart, DollarSign, Building2, TrendingUp, MessageSquare, Trash2, Database, X, LoaderCircle, CircleCheck, ArrowRight, ChevronDown, MessageSquarePlus, Mic, MicOff, ImagePlus } from 'lucide-react'
import { apiAnalyzeImage, apiAsk, apiNeighborhoods, apiTranscribe } from '../lib/api.js'
import { useCity } from '../lib/cityStore.jsx'
import { useRecent, pushRecent, removeRecent, clearRecent, relativeTime } from '../lib/recent.js'
import CityPicker from '../components/layout/CityPicker.jsx'

const POPULAR = [
  ['Which locality has the best air quality?', 'Find the lowest-AQI areas with cleaner air to breathe.', TreePine, '#3FB984'],
  ['Where is rent most affordable?', 'See localities with the lowest median rent for your budget.', DollarSign, '#7C5CF6'],
  ['Which area has the shortest commute?', 'Compare driving time to the city work hub across localities.', Train, '#4F86F7'],
  ['What is the safest locality here?', 'See the safety index across localities in this city.', ShieldCheck, '#F5A63B'],
  ['Which locality has the most amenities?', 'Restaurants, gyms, parks and shops within 1.5 km.', ShoppingCart, '#EC6FA6'],
  ['Give me the best overall pick', 'The top FitScore balancing air, rent, commute and amenities.', TrendingUp, '#2FB6A8'],
]

// Fallback suggestions shown only until live city data loads.
const SUGGESTIONS = [
  ['Is the air safe to go out today?', 'Get an AQI-based health read for this area.', TreePine],
  ['Which localities are similar on air + rent?', 'Compare AQI, rent and commute side by side.', Building2],
  ['Best area for a family on a budget?', 'Balance air quality, safety, rent and amenities.', Home],
  ['Rank localities by air quality', 'Cleanest-air areas first.', TrendingUp],
]

const STEPS = [
  ['You ask a question', 'Type anything you want to know about your neighborhood.'],
  ['NestIQ analyzes data', 'Our AI scans trusted sources, real-time data, and local insights.'],
  ['You get smart answers', 'Clear, accurate, and personalized answers in seconds.'],
]

const MODE_LABELS = {
  city_analytics: 'City data analysis',
  city_evidence: 'City evidence',
  locality_evidence: 'Locality evidence',
  image_evidence: 'Image evidence',
}

function RichText({ children }) {
  const parts = String(children || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    : <span key={index}>{part}</span>)
}

function conversationExchanges(messages) {
  return messages.reduce((exchanges, message) => {
    if (message.role === 'user' || exchanges.length === 0) exchanges.push([message])
    else exchanges[exchanges.length - 1].push(message)
    return exchanges
  }, []).reverse()
}

function CopilotAnswer({ answer, onFollowUp }) {
  const modeLabel = MODE_LABELS[answer.mode] || 'Grounded answer'
  const tools = Array.isArray(answer.tools) ? answer.tools : []
  const followUps = Array.isArray(answer.followUps) ? answer.followUps : []
  const actions = Array.isArray(answer.actions) ? answer.actions : []

  return (
    <article className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white shadow-sm"><Sparkles size={15} /></span>
          Copilot answer
        </div>
        <span className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700">{modeLabel}</span>
      </header>

      <div className="p-5">
        <p className="whitespace-pre-line text-sm leading-7 text-ink-soft"><RichText>{answer.answer}</RichText></p>

        {tools.length > 0 && (
          <section className="mt-4 rounded-xl border border-line bg-band/35 p-3.5" aria-label="Tools used for this answer">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Tools used</span>
              {tools.map((tool) => (
                <span key={tool.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink-soft">
                  <CircleCheck size={13} className="text-aff" /> {tool.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {answer.sql && (
          <details className="group mt-4 rounded-xl border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-brand-700">
              <span className="flex items-center gap-2"><Database size={14} /> View BigQuery analysis</span>
              <ChevronDown size={15} className="transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-line p-3">
              <pre className="overflow-x-auto rounded-lg bg-[#1B1B2F] p-3 text-[11px] leading-relaxed text-[#D6CCFB]">
                <code>{answer.sql}</code>
              </pre>
              {answer.rows?.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        {Object.keys(answer.rows[0]).map((key) => (
                          <th key={key} className="border-b border-line px-2 py-1.5 font-semibold text-muted">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {answer.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.values(row).map((value, valueIndex) => (
                            <td key={valueIndex} className="border-b border-line/60 px-2 py-1.5 text-ink-soft">{String(value)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        )}

        {answer.sources?.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium">Evidence:</span>
            {answer.sources.map((source) => <span key={source} className="chip py-1 text-xs">{source}</span>)}
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => action.type === 'view_locality' && (
              <Link
                key={`${action.type}:${action.localityId}`}
                to={`/neighborhood/${action.localityId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                {action.label} <ArrowRight size={13} />
              </Link>
            ))}
          </div>
        )}

        {followUps.length > 0 && (
          <section className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-semibold text-ink">Continue exploring</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {followUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onFollowUp(question)}
                  className="rounded-full border border-brand-200 bg-brand-50/60 px-3 py-1.5 text-left text-xs font-medium text-brand-700 transition hover:border-brand-300 hover:bg-brand-100"
                >
                  {question}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  )
}

export default function AskNestIQ() {
  const { city, cities } = useCity()
  const cityName = cities.find((c) => c.id === city)?.name || 'your city'
  const [q, setQ] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [liveSug, setLiveSug] = useState([])
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageError, setImageError] = useState('')
  const composerRef = useRef(null)
  const imageInputRef = useRef(null)
  const recorderRef = useRef(null)
  const voiceStreamRef = useRef(null)
  const voiceTimerRef = useRef(null)
  const voiceStartedRef = useRef(0)
  const voiceCancelledRef = useRef(false)
  const voicePrefixRef = useRef('')
  const recent = useRecent()
  const voiceSupported = typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    setMessages([])
    setQ('')
    setImage(null)
    setImageError('')
  }, [city])

  useEffect(() => () => {
    voiceCancelledRef.current = true
    clearTimeout(voiceTimerRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!image) {
      setImagePreview('')
      return undefined
    }
    const preview = URL.createObjectURL(image)
    setImagePreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [image])

  // Build genuinely personalized suggestions from the current city's live data.
  useEffect(() => {
    let alive = true
    setLiveSug([])
    apiNeighborhoods(city).then((list) => {
      if (!alive || !list?.length) return
      const clean = [...list].filter((x) => Number.isFinite(x.aqi)).sort((a, b) => a.aqi - b.aqi)[0]
      const cheap = [...list].sort((a, b) => (a.median_rent ?? 1e9) - (b.median_rent ?? 1e9))[0]
      const sug = []
      if (clean) {
        const risky = (clean.criticalRisks || []).length > 0
        sug.push(
          risky
            ? [`Is the air in ${clean.name} safe right now?`, `Even the least-polluted area in ${cityName} is AQI ${clean.aqi} (${clean.airHealthBand || 'poor'}).`, TreePine]
            : [`Why is ${clean.name} the cleanest-air area right now?`, `AQI ${clean.aqi}, the lowest in ${cityName} today.`, TreePine],
        )
      }
      // Only suggest a budget prompt when a rent is actually sourced; Number(null)
      // is 0, which would advertise a fabricated price.
      if (cheap && Number.isFinite(cheap.median_rent))
        sug.push([`Is ${cheap.name} a good budget pick?`, `Lowest median rent in ${cityName} at ₹${cheap.median_rent.toLocaleString('en-IN')}.`, DollarSign])
      setLiveSug(sug)
    })
    return () => {
      alive = false
    }
  }, [city, cityName])

  const suggestions = liveSug.length ? [...liveSug, ...SUGGESTIONS.slice(0, 2)] : SUGGESTIONS

  async function submit(text) {
    if (loading) return
    const question = (text ?? q).trim()
    if (!question && !image) return
    const history = messages
      .map((message) => ({
        role: message.role,
        content: message.role === 'assistant' ? message.response.answer : message.content,
      }))
      .slice(-6)
    const attachedImage = image
    const visibleQuestion = question || 'Analyze this neighborhood image.'
    setQ('')
    setImage(null)
    setImageError('')
    if (composerRef.current) composerRef.current.style.height = 'auto'
    pushRecent(visibleQuestion)
    setMessages((current) => [...current, { role: 'user', content: visibleQuestion, imageName: attachedImage?.name }])
    setLoading(true)
    const res = attachedImage
      ? await apiAnalyzeImage(attachedImage, visibleQuestion, city)
      : await apiAsk(visibleQuestion, null, city, history)
    setLoading(false)
    const response = res || { answer: "I couldn't reach the assistant just now. Please try again.", sources: [] }
    setMessages((current) => [...current, { role: 'assistant', response }])
  }

  function newConversation() {
    voiceCancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setListening(false)
    setTranscribing(false)
    setVoiceError('')
    setImage(null)
    setImageError('')
    setMessages([])
    setQ('')
    if (composerRef.current) {
      composerRef.current.style.height = 'auto'
      composerRef.current.focus()
    }
  }

  function selectImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError('Choose an image smaller than 8 MB.')
      return
    }
    setImage(file)
    setImageError('')
    composerRef.current?.focus()
  }

  function clearComposer() {
    voiceCancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setQ('')
    setListening(false)
    setTranscribing(false)
    setVoiceError('')
    if (composerRef.current) {
      composerRef.current.style.height = 'auto'
      composerRef.current.focus()
    }
  }

  function updateComposer(event) {
    setQ(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = `${Math.min(event.target.scrollHeight, 144)}px`
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  async function toggleVoice() {
    setVoiceError('')
    if (!voiceSupported) {
      setVoiceError('Audio recording is not supported by this browser. You can continue typing normally.')
      return
    }
    if (listening) {
      recorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceStreamRef.current = stream
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mimeType = preferredTypes.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || ''
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      voicePrefixRef.current = q.trim()
      voiceCancelledRef.current = false
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        setVoiceError('The recording stopped unexpectedly. You can continue typing.')
      }
      recorder.onstart = () => {
        voiceStartedRef.current = Date.now()
        setListening(true)
        voiceTimerRef.current = setTimeout(() => recorder.stop(), 30_000)
      }
      recorder.onstop = async () => {
        clearTimeout(voiceTimerRef.current)
        setListening(false)
        stream.getTracks().forEach((track) => track.stop())
        voiceStreamRef.current = null
        recorderRef.current = null
        if (voiceCancelledRef.current) return

        const durationMs = Math.max(1, Date.now() - voiceStartedRef.current)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) {
          setVoiceError('The recording was empty. Please try again closer to the microphone.')
          return
        }
        setTranscribing(true)
        const result = await apiTranscribe(blob, durationMs, 'en-IN')
        setTranscribing(false)
        if (voiceCancelledRef.current) return
        if (result?.transcript) {
          const prefix = voicePrefixRef.current
          const voiceQuestion = `${prefix}${prefix ? ' ' : ''}${result.transcript}`
          await submit(voiceQuestion)
        } else {
          setVoiceError(result?.limitation || 'Voice transcription is temporarily unavailable. You can continue typing.')
        }
      }
      recorder.start()
    } catch (error) {
      setListening(false)
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      voiceStreamRef.current = null
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      setVoiceError(denied
        ? 'Microphone permission was denied. Allow access or continue typing.'
        : 'The microphone could not start. Please try again or continue typing.')
    }
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl text-ink">NestIQ Copilot</h1>
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">Grounded assistant</span>
          </div>
          <p className="mt-1 text-sm text-muted">Ask, compare and investigate neighborhoods across {cityName}.</p>
        </div>
        <CityPicker className="shrink-0" />
      </div>

      {/* Copilot composer: focus is calm; the animated aura is reserved for real work. */}
      <div className={`copilot-composer mt-5 ${loading || listening || transcribing ? 'copilot-composer--working' : ''}`}>
        <div className="relative rounded-[21px] bg-white p-3">
          {image && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-2.5">
              {imagePreview
                ? <img src={imagePreview} alt="Selected upload preview" className="h-14 w-14 rounded-lg object-cover" />
                : <span className="grid h-14 w-14 place-items-center rounded-lg bg-brand-100 text-brand-700"><ImagePlus size={20} /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{image.name}</p>
                <p className="text-[11px] text-muted">Gemini will inspect this image in memory</p>
              </div>
              <button type="button" onClick={() => setImage(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white hover:text-brand-700" aria-label="Remove attached image"><X size={15} /></button>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ${loading ? 'animate-pulse' : ''}`}>
              {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}
            </span>
            <textarea
              ref={composerRef}
              value={q}
              rows={1}
              onChange={updateComposer}
              onKeyDown={handleComposerKeyDown}
              className="max-h-36 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-ink outline-none placeholder:text-muted"
              placeholder="Ask about a locality, compare options, or investigate a trade-off..."
              aria-label="Ask NestIQ Copilot"
            />
            <div className="flex shrink-0 items-center gap-2">
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} className="sr-only" aria-label="Choose an image" />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || transcribing || listening}
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-muted transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Attach image"
                title="Attach a neighborhood photo"
              >
                <ImagePlus size={16} />
              </button>
              <button
                type="button"
                onClick={toggleVoice}
                disabled={loading || transcribing}
                className={`grid h-9 w-9 place-items-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  listening
                    ? 'border-brand-500 bg-brand-600 text-white shadow-sm'
                    : 'border-line bg-white text-muted hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'
                }`}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={listening}
                title={voiceSupported ? (listening ? 'Stop listening' : 'Speak your question') : 'Voice input unavailable in this browser'}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              {q && (
                <button
                  type="button"
                  onClick={clearComposer}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-muted transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  aria-label="Clear question"
                  title="Clear question"
                >
                  <X size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => submit()}
                disabled={(!q.trim() && !image) || loading || listening || transcribing}
                className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-200 disabled:shadow-none"
                aria-label={loading ? 'NestIQ is working' : 'Send question'}
              >
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-1 pt-2 text-[11px] text-muted">
            <span className="flex items-center gap-1.5" aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-brand-500' : 'bg-aff'}`} />
              {listening
                ? 'Recording… up to 30 seconds'
                : transcribing
                  ? 'Transcribing securely with Google Speech-to-Text…'
                : loading
                  ? 'Selecting grounded tools and checking evidence…'
                  : `Auto-routing for ${cityName}`}
            </span>
            <span>{listening ? 'Tap the microphone to stop' : transcribing ? 'Audio is not stored' : 'Enter to send · Shift + Enter for a new line'}</span>
          </div>
        </div>
      </div>
      {(voiceError || imageError || listening || transcribing) && (
        <p className={`mt-2 px-1 text-xs ${voiceError || imageError ? 'text-red-700' : 'text-muted'}`} role={voiceError || imageError ? 'alert' : 'status'}>
          {voiceError || imageError || (listening
            ? 'Recording locally. It will be sent for transcription only when you stop.'
            : 'Google Speech-to-Text is processing this clip in memory. Raw audio is not saved.')}
        </p>
      )}

      {(messages.length > 0 || loading) && (
        <section className="mt-5" aria-label="Copilot conversation">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Conversation</p>
            <button
              type="button"
              onClick={newConversation}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquarePlus size={14} /> New conversation
            </button>
          </div>
          <div className="mt-2 space-y-5">
            {conversationExchanges(messages).map((exchange, exchangeIndex) => (
              <div key={`exchange:${exchangeIndex}`} className="space-y-3">
                {exchange.map((message, messageIndex) => message.role === 'user' ? (
                  <div key={`user:${messageIndex}`} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-6 text-white shadow-sm">
                      {message.content}
                      {message.imageName && <span className="mt-1 block text-[11px] text-white/75">Image: {message.imageName}</span>}
                    </div>
                  </div>
                ) : (
                  <CopilotAnswer key={`assistant:${messageIndex}`} answer={message.response} onFollowUp={submit} />
                ))}
                {loading && exchangeIndex === 0 && exchange.every((message) => message.role !== 'assistant') && (
                  <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card" role="status">
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <LoaderCircle size={16} className="animate-spin text-brand-500" /> NestIQ is selecting tools and checking grounded evidence…
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* popular questions */}
        <div>
          <h3 className="flex items-center justify-between text-sm font-semibold text-ink">
            Recent Questions
            {recent.length > 0 && (
              <button onClick={clearRecent} className="text-xs font-medium text-brand-700 hover:text-brand-800">Clear all</button>
            )}
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted">
                Your questions will show up here as you ask them.
              </div>
            ) : (
              recent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><MessageSquare size={15} /></span>
                  <button onClick={() => submit(r.q)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm text-ink hover:text-brand-700">{r.q}</p>
                    <p className="text-[11px] text-muted">{r.category}</p>
                  </button>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">{relativeTime(r.at)}</span>
                  <button onClick={() => removeRecent(r.id)} className="shrink-0 text-muted hover:text-[#E5484D]" aria-label="Remove question">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-ink">Popular Questions</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {POPULAR.map(([q, d, Icon, color]) => (
              <button key={q} onClick={() => submit(q)} className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-left transition hover:border-brand-200">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{q}</p>
                  <p className="mt-0.5 text-xs text-muted">{d}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* right column */}
        <div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">NestIQ Suggestions</h3>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                {liveSug.length ? `Live in ${cityName}` : 'Suggested'}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {suggestions.map(([q, d, Icon]) => (
                <button key={q} onClick={() => submit(q)} className="flex items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-200">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={15} /></span>
                  <div>
                    <p className="text-sm font-medium text-ink">{q}</p>
                    <p className="text-xs text-muted">{d}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card mt-5 p-5">
            <h3 className="text-sm font-semibold text-ink">How NestIQ works</h3>
            <ol className="mt-3 space-y-4">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t}</p>
                    <p className="text-xs text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
