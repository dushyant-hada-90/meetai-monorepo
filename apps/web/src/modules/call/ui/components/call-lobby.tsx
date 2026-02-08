"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff, Video, VideoOff, Settings, Loader2 } from "lucide-react"

interface Props {
  onJoin: (opts: { audio: boolean; video: boolean; deviceId?: { audio?: string; video?: string } }) => void
}

export const CallLobby = ({ onJoin }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  
  // State
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioId, setSelectedAudioId] = useState<string>("")
  const [selectedVideoId, setSelectedVideoId] = useState<string>("")
  const [showSettings, setShowSettings] = useState(false)

  // Initialization
  useEffect(() => {
    initDevices()
    return () => {
      cleanupStream()
    }
  }, [])

  // Audio Level Visualizer
  useEffect(() => {
    if (!stream || !micOn) {
      setAudioLevel(0)
      return
    }

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const microphone = audioContext.createMediaStreamSource(stream)
    const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1)

    analyser.smoothingTimeConstant = 0.8
    analyser.fftSize = 1024

    microphone.connect(analyser)
    analyser.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    scriptProcessor.onaudioprocess = () => {
      const array = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(array)
      const values = array.reduce((a, b) => a + b, 0)
      const average = values / array.length
      setAudioLevel(Math.min(100, average * 1.5)) // Normalize nicely
    }

    return () => {
      microphone.disconnect()
      scriptProcessor.disconnect()
      audioContext.close()
    }
  }, [stream, micOn])

  // Device Management
  async function initDevices() {
    try {
      // Request generic permissions first to enumerate labels
      const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audio = devices.filter(d => d.kind === "audioinput")
      const video = devices.filter(d => d.kind === "videoinput")
      
      setAudioDevices(audio)
      setVideoDevices(video)
      
      // Cleanup initial permission stream
      initialStream.getTracks().forEach(t => t.stop())

      // Start actual stream with defaults or first found
      startStream(video[0]?.deviceId, audio[0]?.deviceId)

    } catch (err) {
      console.error("Permission error", err)
      setPermissionError("Please allow camera and microphone access to join.")
    }
  }

  async function startStream(videoId?: string, audioId?: string) {
    cleanupStream()

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: videoId ? { deviceId: { exact: videoId } } : true,
        audio: audioId ? { deviceId: { exact: audioId } } : true
      })
      
      setStream(newStream)
      if (videoRef.current) {
        videoRef.current.srcObject = newStream
      }

      // Update selection state
      const tracks = newStream.getTracks()
      const vidTrack = tracks.find(t => t.kind === "video")
      const audTrack = tracks.find(t => t.kind === "audio")
      
      if (vidTrack) setSelectedVideoId(vidTrack.getSettings().deviceId || "")
      if (audTrack) setSelectedAudioId(audTrack.getSettings().deviceId || "")

      setPermissionError(null)
    } catch (err) {
      console.error("Stream start error", err)
      setPermissionError("Could not access selected device.")
    }
  }

  function cleanupStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    }
  }

  // Toggles
  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks().forEach(t => t.enabled = !cameraOn)
      setCameraOn(!cameraOn)
    }
  }

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = !micOn)
      setMicOn(!micOn)
    }
  }

  const handleDeviceChange = (type: 'audio' | 'video', deviceId: string) => {
    if (type === 'audio') {
      setSelectedAudioId(deviceId)
      startStream(selectedVideoId, deviceId)
    } else {
      setSelectedVideoId(deviceId)
      startStream(deviceId, selectedAudioId)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-950 p-4 font-sans">
      <div className="flex w-full max-w-5xl flex-col gap-6 overflow-hidden rounded-3xl bg-neutral-900/50 p-2 shadow-2xl backdrop-blur-xl border border-white/5 md:flex-row md:p-4">
        
        {/* LEFT: Video Preview */}
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-black aspect-video md:aspect-auto">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover transition-opacity duration-300 ${cameraOn ? 'opacity-100' : 'opacity-0'} ${cameraOn ? '-scale-x-100' : ''}`} // Mirror effect
          />
          
          {/* Camera Off State */}
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-800">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700">
                <div className="h-10 w-10 text-neutral-400">
                  <VideoOff size={40} />
                </div>
              </div>
              <p className="text-neutral-400 font-medium">Camera is off</p>
            </div>
          )}

          {/* Audio Meter Overlay */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-md border border-white/10">
            {micOn ? (
               <div className="flex items-end gap-1 h-4">
                 {[1, 2, 3].map(i => (
                   <div 
                     key={i} 
                     className="w-1 bg-green-500 rounded-full transition-all duration-75"
                     style={{ height: `${Math.max(20, Math.min(100, audioLevel * (i * 0.8)))}%` }}
                   />
                 ))}
               </div>
            ) : (
               <MicOff size={14} className="text-red-400" />
            )}
          </div>

          {permissionError && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
                <p className="text-red-400 font-medium">{permissionError}</p>
             </div>
          )}
        </div>

        {/* RIGHT: Controls */}
        <div className="flex w-full flex-col justify-center space-y-8 p-4 md:w-80 md:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Ready to join?</h1>
            <p className="text-sm text-neutral-400">Check your audio and video settings.</p>
          </div>

          {/* Device Selection (Collapsible) */}
          <div className="space-y-4">
             <button 
               onClick={() => setShowSettings(!showSettings)}
               className="flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
             >
               <Settings size={14} />
               {showSettings ? "Hide Settings" : "Check Settings"}
             </button>

             {showSettings && (
               <div className="space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Microphone</label>
                    <select 
                      value={selectedAudioId}
                      onChange={(e) => handleDeviceChange('audio', e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {audioDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}...`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Camera</label>
                    <select 
                      value={selectedVideoId}
                      onChange={(e) => handleDeviceChange('video', e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {videoDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Cam ${d.deviceId.slice(0,5)}...`}</option>
                      ))}
                    </select>
                  </div>
               </div>
             )}
          </div>

          <div className="flex items-center justify-between gap-4">
             <button
                onClick={toggleMic}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200 ${
                   micOn 
                   ? "border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 text-white" 
                   : "border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
             >
                {micOn ? <Mic size={24} /> : <MicOff size={24} />}
                <span className="text-xs font-medium">{micOn ? "Mic On" : "Mic Off"}</span>
             </button>
             
             <button
                onClick={toggleCamera}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200 ${
                   cameraOn 
                   ? "border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 text-white" 
                   : "border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
             >
                {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
                <span className="text-xs font-medium">{cameraOn ? "Cam On" : "Cam Off"}</span>
             </button>
          </div>

          <button
            onClick={() => onJoin({ audio: micOn, video: cameraOn })}
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 active:scale-[0.98]"
          >
            Join Meeting
          </button>
        </div>
      </div>
    </div>
  )
}